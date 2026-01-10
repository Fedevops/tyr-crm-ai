import React, { useState, useEffect } from 'react'
import { useTranslation } from 'react-i18next'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import api from '@/lib/api'
import { useKPI } from '@/contexts/KPIContext'
import { Plus, CheckCircle2, Clock, AlertCircle, Mail, Phone, Link as LinkIcon, Calendar, Search, X, User, XCircle, Trash2, Edit, Sparkles, Loader2 } from 'lucide-react'
import { useNavigate } from 'react-router-dom'

interface Task {
  id: number
  lead_id: number
  sequence_id: number | null
  assigned_to: number | null
  owner_id: number | null
  owner?: {
    id: number
    full_name: string
    email: string
  }
  type: string
  title: string
  description: string | null
  status: string
  due_date: string
  completed_at: string | null
  notes: string | null
  lead?: {
    name: string
    company: string | null
  }
}

const formatDate = (date: Date) => {
  const day = date.getDate().toString().padStart(2, '0')
  const month = (date.getMonth() + 1).toString().padStart(2, '0')
  const hours = date.getHours().toString().padStart(2, '0')
  const minutes = date.getMinutes().toString().padStart(2, '0')
  return `${day}/${month} às ${hours}:${minutes}`
}

const getTypeIcon = (type: string) => {
  switch (type) {
    case 'email':
      return <Mail className="h-4 w-4" />
    case 'call':
      return <Phone className="h-4 w-4" />
    case 'linkedin':
      return <LinkIcon className="h-4 w-4" />
    case 'meeting':
      return <Calendar className="h-4 w-4" />
    default:
      return <Clock className="h-4 w-4" />
  }
}

interface Lead {
  id: number
  name: string
  company: string | null
  email: string
}

export function Tasks() {
  const { t, i18n } = useTranslation()
  const navigate = useNavigate()
  const { trackActivity } = useKPI()
  const [tasks, setTasks] = useState<Task[]>([])
  const [loading, setLoading] = useState(true)
  const [statusFilter, setStatusFilter] = useState<string>('all')
  const [typeFilter, setTypeFilter] = useState<string>('all')
  const [searchTerm, setSearchTerm] = useState('')
  const [showForm, setShowForm] = useState(false)
  const [leads, setLeads] = useState<Lead[]>([])
  const [currentPage, setCurrentPage] = useState(1)
  const [pageSize, setPageSize] = useState(20)
  const [totalTasks, setTotalTasks] = useState(0)
  const [formData, setFormData] = useState({
    lead_id: '',
    type: 'email',
    title: '',
    description: '',
    due_date: '',
    due_time: '09:00',
    owner_id: null as number | null
  })
  const [users, setUsers] = useState<Array<{id: number, full_name: string, email: string}>>([])
  const [generatingMessage, setGeneratingMessage] = useState(false)
  
  // Seleção múltipla
  const [selectedTasks, setSelectedTasks] = useState<Set<number>>(new Set())
  
  // Modal de geração de nota de conexão
  const [showConnectionNoteModal, setShowConnectionNoteModal] = useState(false)
  const [taskForConnectionNote, setTaskForConnectionNote] = useState<Task | null>(null)
  const [connectionNoteText, setConnectionNoteText] = useState('')
  const [generatingConnectionNote, setGeneratingConnectionNote] = useState(false)
  
  // Títulos pré-definidos para tarefas do LinkedIn
  const linkedinTaskTitles = [
    'Enviar solicitação de conexão',
    'Enviar nota de conexão',
    'Enviar mensagem de follow-up',
    'Follow-up após conexão aceita',
    'Follow-up após reunião',
    'Follow-up após e-mail',
    'Follow-up após ligação',
    'Comentar em publicação',
    'Compartilhar conteúdo relevante',
    'Parabenizar por conquista',
    'Enviar mensagem de aniversário',
    'Enviar proposta de valor',
    'Agendar reunião via LinkedIn',
    'Enviar case de sucesso',
    'Outro'
  ]
  
  // Detail modal
  const [showTaskDetailModal, setShowTaskDetailModal] = useState(false)
  const [selectedTaskDetail, setSelectedTaskDetail] = useState<Task | null>(null)
  const [activeTab, setActiveTab] = useState<'basicas' | 'comentarios'>('basicas')
  const [taskComments, setTaskComments] = useState<any[]>([])
  const [loadingComments, setLoadingComments] = useState(false)
  const [newComment, setNewComment] = useState('')
  const [addingComment, setAddingComment] = useState(false)
  const [editingTask, setEditingTask] = useState(false)
  const [editFormData, setEditFormData] = useState({
    title: '',
    description: '',
    status: 'pending' as string,
    due_date: '',
    due_time: '09:00',
    owner_id: null as number | null,
    notes: ''
  })

  useEffect(() => {
    fetchUsers()
    fetchTasks()
    fetchLeads()
  }, [statusFilter, typeFilter, currentPage, pageSize, searchTerm])
  
  useEffect(() => {
    if (showTaskDetailModal && selectedTaskDetail?.id) {
      fetchTaskComments(selectedTaskDetail.id)
    }
  }, [showTaskDetailModal, selectedTaskDetail?.id])

  const fetchUsers = async () => {
    try {
      const response = await api.get('/api/users')
      setUsers(response.data)
    } catch (error) {
      console.error('Error fetching users:', error)
    }
  }

  const fetchLeads = async () => {
    try {
      const response = await api.get('/api/leads?limit=1000')
      setLeads(response.data || [])
    } catch (error) {
      console.error('Error fetching leads:', error)
    }
  }

  const fetchTasks = async () => {
    try {
      setLoading(true)
      const params: any = {
        skip: (currentPage - 1) * pageSize,
        limit: pageSize
      }
      
      if (statusFilter !== 'all') {
        params.status = statusFilter
      }
      
      if (typeFilter !== 'all') {
        params.type = typeFilter
      }
      
      const queryString = new URLSearchParams(params).toString()
      const response = await api.get(`/api/tasks?${queryString}`)
      let tasksData = response.data || []
      
      // Get total count from headers
      // Axios normalizes headers to lowercase, but check both cases
      const totalCountHeader = response.headers['x-total-count'] || 
                               response.headers['X-Total-Count'] || 
                               response.headers.get?.('x-total-count') ||
                               '0'
      const totalCount = parseInt(totalCountHeader, 10) || 0
      
      console.log('🔍 Tasks API Response Debug:')
      console.log('  - All headers:', Object.keys(response.headers))
      console.log('  - x-total-count (lowercase):', response.headers['x-total-count'])
      console.log('  - X-Total-Count (uppercase):', response.headers['X-Total-Count'])
      console.log('  - Total count parsed:', totalCount)
      console.log('  - Tasks received:', tasksData.length)
      console.log('  - Current page:', currentPage, 'Page size:', pageSize)
      
      // Se não conseguir ler do header, usar fallback
      if (totalCount === 0 && tasksData.length > 0) {
        // Se recebeu tarefas mas o total é 0, pode ser que o header não esteja sendo exposto
        // Usar estimativa baseada na quantidade recebida
        const estimatedTotal = tasksData.length < pageSize 
          ? (currentPage - 1) * pageSize + tasksData.length
          : (currentPage * pageSize) + 1
        console.warn('⚠️ Total count not found in headers, using estimate:', estimatedTotal)
        setTotalTasks(estimatedTotal)
      } else {
        setTotalTasks(totalCount)
      }
      
      // Buscar informações dos leads
      const tasksWithLeads = await Promise.all(
        tasksData.map(async (task: Task) => {
          try {
            const leadResponse = await api.get(`/api/leads/${task.lead_id}`)
            return { ...task, lead: leadResponse.data }
          } catch {
            return task
          }
        })
      )
      
      // Aplicar filtro de busca no frontend apenas para exibição
      // Nota: A busca no frontend afeta apenas a página atual
      // Para busca completa, seria necessário implementar no backend
      let filtered = tasksWithLeads
      if (searchTerm) {
        const searchLower = searchTerm.toLowerCase()
        filtered = tasksWithLeads.filter((task: Task) => 
          task.title.toLowerCase().includes(searchLower) ||
          task.lead?.name.toLowerCase().includes(searchLower) ||
          task.lead?.company?.toLowerCase().includes(searchLower)
        )
      }
      
      setTasks(filtered)
    } catch (error) {
      console.error('Error fetching tasks:', error)
    } finally {
      setLoading(false)
    }
  }

  const handleOpenTaskDetail = (task: Task) => {
    setSelectedTaskDetail(task)
    setShowTaskDetailModal(true)
    setActiveTab('basicas')
    setEditingTask(false)
    // Preencher formulário de edição
    const dueDate = new Date(task.due_date)
    setEditFormData({
      title: task.title,
      description: task.description || '',
      status: task.status,
      due_date: dueDate.toISOString().split('T')[0],
      due_time: dueDate.toTimeString().slice(0, 5),
      owner_id: task.owner_id,
      notes: task.notes || ''
    })
  }

  // Funções de seleção múltipla
  const handleSelectTask = (taskId: number, e?: React.MouseEvent<HTMLInputElement>) => {
    e?.stopPropagation() // Prevenir que abra o modal ao clicar no checkbox
    const newSelected = new Set(selectedTasks)
    if (newSelected.has(taskId)) {
      newSelected.delete(taskId)
    } else {
      newSelected.add(taskId)
    }
    setSelectedTasks(newSelected)
  }

  const handleSelectAll = () => {
    if (selectedTasks.size === tasks.length) {
      setSelectedTasks(new Set())
    } else {
      setSelectedTasks(new Set(tasks.map((t: Task) => t.id)))
    }
  }

  const handleBulkDelete = async () => {
    if (selectedTasks.size === 0) return
    
    const confirmMessage = `Tem certeza que deseja apagar ${selectedTasks.size} tarefa(s)? Esta ação não pode ser desfeita.`
    if (!confirm(confirmMessage)) return

    try {
      const taskIds = Array.from(selectedTasks)
      await api.post('/api/tasks/bulk-delete', { task_ids: taskIds })
      
      setSelectedTasks(new Set())
      fetchTasks()
      alert(`${taskIds.length} tarefa(s) apagada(s) com sucesso!`)
    } catch (error: any) {
      console.error('Error deleting tasks:', error)
      alert(error.response?.data?.detail || 'Erro ao apagar tarefas. Tente novamente.')
    }
  }

  // Função para gerar mensagem do LinkedIn com IA
  const handleGenerateLinkedInMessage = async (messageType: 'connection_note' | 'followup') => {
    if (!formData.lead_id) {
      alert('Por favor, selecione um lead primeiro.')
      return
    }

    setGeneratingMessage(true)
    try {
      const currentLanguage = i18n.language || 'pt-BR'
      
      // Detectar contexto baseado no título
      let followupContext = 'generic'
      if (messageType === 'followup') {
        if (formData.title === 'Follow-up após conexão aceita') {
          followupContext = 'after_connection'
        } else if (formData.title === 'Follow-up após reunião') {
          followupContext = 'after_meeting'
        } else if (formData.title === 'Follow-up após e-mail') {
          followupContext = 'after_email'
        } else if (formData.title === 'Follow-up após ligação') {
          followupContext = 'after_call'
        }
      }
      
      const response = await api.post('/api/tasks/generate-linkedin-message', {
        lead_id: parseInt(formData.lead_id),
        message_type: messageType,
        language: currentLanguage,
        followup_context: messageType === 'followup' ? followupContext : undefined
      })
      
      if (response.data.success && response.data.message) {
        setFormData((prev: typeof formData) => ({
          ...prev,
          description: response.data.message
        }))
        alert(messageType === 'connection_note' ? 'Nota de conexão gerada com sucesso!' : 'Mensagem de follow-up gerada com sucesso!')
      } else {
        alert('Erro ao gerar mensagem. Tente novamente.')
      }
    } catch (error: any) {
      console.error('Error generating LinkedIn message:', error)
      if (error.response?.status === 401) {
        alert('Sua sessão expirou. Por favor, faça login novamente.')
        window.location.href = '/login'
      } else if (error.response?.status === 503) {
        alert('LLM não está disponível. Configure OpenAI ou Ollama no arquivo .env')
      } else {
        alert(error.response?.data?.detail || 'Erro ao gerar mensagem. Tente novamente.')
      }
    } finally {
      setGeneratingMessage(false)
    }
  }

  const fetchTaskComments = async (taskId: number) => {
    try {
      setLoadingComments(true)
      const response = await api.get(`/api/tasks/${taskId}/comments`)
      setTaskComments(response.data || [])
    } catch (error) {
      console.error('Error fetching task comments:', error)
      setTaskComments([])
    } finally {
      setLoadingComments(false)
    }
  }

  const handleAddComment = async () => {
    if (!selectedTaskDetail || !newComment.trim()) return
    
    try {
      setAddingComment(true)
      const response = await api.post(`/api/tasks/${selectedTaskDetail.id}/comments`, {
        comment: newComment.trim()
      })
      
      setTaskComments([response.data, ...taskComments])
      setNewComment('')
      
      const taskResponse = await api.get(`/api/tasks/${selectedTaskDetail.id}`)
      setSelectedTaskDetail((prev: Task | null) => prev ? { ...prev, updated_at: taskResponse.data.updated_at } : taskResponse.data)
    } catch (error: any) {
      console.error('Error adding comment:', error)
      alert(error.response?.data?.detail || 'Erro ao adicionar comentário')
    } finally {
      setAddingComment(false)
    }
  }

  const handleDeleteComment = async (commentId: number) => {
    if (!confirm('Tem certeza que deseja excluir este comentário?')) return
    
    try {
      await api.delete(`/api/tasks/comments/${commentId}`)
      setTaskComments((prevComments: any[]) => prevComments.filter((c: any) => c.id !== commentId))
      
      if (selectedTaskDetail) {
        const taskResponse = await api.get(`/api/tasks/${selectedTaskDetail.id}`)
        setSelectedTaskDetail((prev: Task | null) => prev ? { ...prev, updated_at: taskResponse.data.updated_at } : taskResponse.data)
      }
    } catch (error: any) {
      console.error('Error deleting comment:', error)
      alert(error.response?.data?.detail || 'Erro ao excluir comentário')
    }
  }

  const handleUpdateTask = async () => {
    if (!selectedTaskDetail) return
    
    try {
      const dueDateTime = new Date(`${editFormData.due_date}T${editFormData.due_time}`)
      
      const updateData = {
        title: editFormData.title,
        description: editFormData.description || null,
        status: editFormData.status,
        due_date: dueDateTime.toISOString(),
        owner_id: editFormData.owner_id || null,
        notes: editFormData.notes || null
      }
      
      const response = await api.patch(`/api/tasks/${selectedTaskDetail.id}`, updateData)
      setSelectedTaskDetail(response.data)
      setEditingTask(false)
      fetchTasks() // Recarregar lista
    } catch (error: any) {
      console.error('Error updating task:', error)
      alert(error.response?.data?.detail || 'Erro ao atualizar tarefa')
    }
  }

  const handleStatusChange = async (taskId: number, newStatus: string) => {
    try {
      console.log(`🔄 [FRONTEND] Atualizando tarefa ${taskId} para status: ${newStatus}`)
      
      const task = tasks.find((t: Task) => t.id === taskId)
      
      // Se está completando uma tarefa de LinkedIn de conexão, mostrar modal
      if (newStatus === 'completed' && task && task.type === 'linkedin') {
        const titleLower = task.title?.toLowerCase() || ''
        const isConnectionNoteTask = titleLower.includes('nota de conexão') || 
                                     titleLower.includes('solicitação de conexão') ||
                                     titleLower.includes('enviar nota de conexão') ||
                                     titleLower.includes('enviar solicitação de conexão')
        
        if (isConnectionNoteTask) {
          // Armazenar a tarefa e mostrar modal
          setTaskForConnectionNote(task)
          setConnectionNoteText(task.description || '')
          setShowConnectionNoteModal(true)
          return // Não completar ainda, aguardar o usuário gerar a nota
        }
      }
      
      // Atualizar otimisticamente a UI
      setTasks((prevTasks: Task[]) => 
        prevTasks.map((task: Task) => 
          task.id === taskId 
            ? { ...task, status: newStatus, completed_at: newStatus === 'completed' ? new Date().toISOString() : task.completed_at }
            : task
        )
      )
      
      const response = await api.patch(`/api/tasks/${taskId}`, {
        status: newStatus
      }, {
        timeout: 60000 // 60 segundos de timeout para permitir pesquisa automática
      })
      
      console.log(`✅ [FRONTEND] Tarefa atualizada com sucesso:`, response.data)
      console.log(`🔍 [FRONTEND] Tipo da tarefa:`, response.data?.type)
      
      // Recarregar tarefas para obter dados atualizados (incluindo notes da pesquisa)
      await fetchTasks()
      
      // Track KPI activity if task was completed
      if (newStatus === 'completed' && task && task.status !== 'completed') {
        trackActivity('tasks_completed', 1, 'Task', taskId).catch((err: any) => {
          console.error('Error tracking KPI activity:', err)
        })
      }

      // Feedback visual
      if (newStatus === 'completed' && response.data?.type === 'research') {
        console.log('✅ [FRONTEND] Tarefa de pesquisa concluída. Verifique as notas para ver o resultado da pesquisa automática.')
      }
    } catch (error: any) {
      console.error('❌ [FRONTEND] Erro ao atualizar tarefa:', error)
      console.error('❌ [FRONTEND] Detalhes do erro:', error.response?.data)
      console.error('❌ [FRONTEND] Status do erro:', error.response?.status)
      
      // Reverter atualização otimista em caso de erro
      fetchTasks()
      
      const errorMessage = error.response?.data?.detail || error.message || 'Erro desconhecido'
      alert(`Erro ao atualizar tarefa: ${errorMessage}`)
    }
  }
  
  const handleGenerateConnectionNote = async () => {
    if (!taskForConnectionNote) return
    
    setGeneratingConnectionNote(true)
    try {
      const currentLanguage = i18n.language || 'pt-BR'
      const response = await api.post('/api/tasks/generate-linkedin-message', {
        lead_id: taskForConnectionNote.lead_id,
        message_type: 'connection_note',
        language: currentLanguage
      })
      
      if (response.data.success && response.data.message) {
        setConnectionNoteText(response.data.message)
      } else {
        alert('Erro ao gerar nota de conexão. Tente novamente.')
      }
    } catch (error: any) {
      console.error('Error generating connection note:', error)
      if (error.response?.status === 503) {
        alert('LLM não está disponível. Configure OpenAI ou Ollama no arquivo .env')
      } else {
        alert(error.response?.data?.detail || 'Erro ao gerar nota de conexão. Tente novamente.')
      }
    } finally {
      setGeneratingConnectionNote(false)
    }
  }
  
  const handleSaveConnectionNote = async () => {
    if (!taskForConnectionNote) return
    
    try {
      // Atualizar a tarefa com a nota de conexão e completar
      await api.patch(`/api/tasks/${taskForConnectionNote.id}`, {
        description: connectionNoteText,
        status: 'completed'
      })
      
      // Track KPI activity
      trackActivity('tasks_completed', 1, 'Task', taskForConnectionNote.id).catch((err: any) => {
        console.error('Error tracking KPI activity:', err)
      })
      
      // Recarregar tarefas
      await fetchTasks()
      
      // Fechar modal
      setShowConnectionNoteModal(false)
      setTaskForConnectionNote(null)
      setConnectionNoteText('')
    } catch (error: any) {
      console.error('Error saving connection note:', error)
      alert(error.response?.data?.detail || 'Erro ao salvar nota de conexão. Tente novamente.')
    }
  }
  
  const handleCancelConnectionNote = () => {
    setShowConnectionNoteModal(false)
    setTaskForConnectionNote(null)
    setConnectionNoteText('')
  }

  const handleSubmitTask = async (e: React.FormEvent) => {
    e.preventDefault()
    
    if (!formData.lead_id || !formData.title || !formData.due_date) {
      alert('Por favor, preencha todos os campos obrigatórios')
      return
    }

    try {
      // Combine date and time
      const dueDateTime = new Date(`${formData.due_date}T${formData.due_time}`)
      
      const taskData = {
        lead_id: parseInt(formData.lead_id),
        type: formData.type,
        title: formData.title,
        description: formData.description || null,
        due_date: dueDateTime.toISOString(),
        owner_id: formData.owner_id || null
      }

      await api.post('/api/tasks', taskData)
      
      // Reset form
      setFormData({
        lead_id: '',
        type: 'email',
        title: '',
        description: '',
        due_date: '',
        due_time: '09:00',
        owner_id: null
      })
      setShowForm(false)
      fetchTasks()
    } catch (error: any) {
      console.error('Error creating task:', error)
      alert(error.response?.data?.detail || 'Erro ao criar tarefa')
    }
  }

  // Categorizar tarefas da página atual para exibição
  const upcomingTasks = tasks.filter((task: Task) => {
    const dueDate = new Date(task.due_date)
    return dueDate >= new Date() && task.status !== 'completed'
  }).sort((a: Task, b: Task) => new Date(a.due_date).getTime() - new Date(b.due_date).getTime())

  const overdueTasks = tasks.filter((task: Task) => {
    const dueDate = new Date(task.due_date)
    return dueDate < new Date() && task.status !== 'completed'
  })

  const completedTasks = tasks.filter((task: Task) => task.status === 'completed')
  
  // Calcular totalPages, garantindo pelo menos 1 página
  const totalPages = totalTasks > 0 ? Math.ceil(totalTasks / pageSize) : 1

  if (loading) {
    return <div className="flex-1 space-y-6 p-6">Carregando...</div>
  }

  return (
    <div className="flex-1 space-y-4 md:space-y-6 p-4 md:p-6 overflow-x-hidden">
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
        <div>
          <h1 className="text-2xl md:text-3xl font-bold">{t('navigation.tasks')}</h1>
          <p className="text-sm md:text-base text-muted-foreground">
            Gerencie suas tarefas de prospecção
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button 
            variant="outline" 
            onClick={() => navigate('/leads')}
            className="flex-1 md:flex-initial text-xs md:text-sm"
          >
            <Plus className="mr-1 md:mr-2 h-3 w-3 md:h-4 md:w-4" />
            <span className="hidden sm:inline">Associar Cadência a Lead</span>
            <span className="sm:hidden">Cadência</span>
          </Button>
          <Button 
            onClick={() => setShowForm(!showForm)}
            className="bg-gradient-to-r from-emerald-600 to-emerald-700 hover:from-emerald-700 hover:to-emerald-800 text-white shadow-md hover:shadow-lg transition-all duration-200 flex-1 md:flex-initial text-xs md:text-sm"
          >
            <Plus className="mr-1 md:mr-2 h-3 w-3 md:h-4 md:w-4" />
            Nova Tarefa
          </Button>
        </div>
      </div>

      {/* Barra de ações em massa */}
      {selectedTasks.size > 0 && (
        <Card className="border-l-4 border-l-red-500 bg-gradient-to-r from-red-50/50 to-white dark:from-red-950/20 dark:to-background">
          <CardContent className="py-3">
            <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-3">
              <div className="flex flex-wrap items-center gap-2 md:gap-4">
                <span className="text-xs md:text-sm font-medium">
                  {selectedTasks.size} tarefa(s) selecionada(s)
                </span>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={handleSelectAll}
                  className="text-xs md:text-sm"
                >
                  <span className="hidden sm:inline">{selectedTasks.size === tasks.length ? 'Desselecionar todas' : 'Selecionar todas'}</span>
                  <span className="sm:hidden">{selectedTasks.size === tasks.length ? 'Desselecionar' : 'Selecionar'}</span>
                </Button>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <Button
                  variant="destructive"
                  size="sm"
                  onClick={handleBulkDelete}
                  className="flex items-center gap-2 flex-1 md:flex-initial text-xs md:text-sm"
                >
                  <Trash2 className="h-3 w-3 md:h-4 md:w-4" />
                  <span className="hidden sm:inline">Apagar Selecionadas</span>
                  <span className="sm:hidden">Apagar</span>
                </Button>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => setSelectedTasks(new Set())}
                  className="flex-1 md:flex-initial text-xs md:text-sm"
                >
                  Cancelar
                </Button>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Formulário de Nova Tarefa */}
      {showForm && (
        <Card className="border-t-4 border-t-emerald-500 bg-gradient-to-br from-emerald-50/30 to-white dark:from-emerald-950/10 dark:to-background">
          <CardHeader className="bg-gradient-to-r from-emerald-50/50 to-transparent dark:from-emerald-950/20">
            <div className="flex items-center justify-between">
              <CardTitle className="text-emerald-900 dark:text-emerald-100">Nova Tarefa</CardTitle>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => {
                  setShowForm(false)
                  setFormData({
                    lead_id: '',
                    type: 'email',
                    title: '',
                    description: '',
                    due_date: '',
                    due_time: '09:00'
                  })
                }}
              >
                <X className="h-4 w-4" />
              </Button>
            </div>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleSubmitTask} className="space-y-4">
              <div className="grid gap-4 md:grid-cols-2">
                <div>
                  <label className="block text-sm font-medium mb-1">Lead *</label>
                  <select
                    value={formData.lead_id}
                    onChange={(e) => setFormData({ ...formData, lead_id: e.target.value })}
                    className="w-full px-3 py-2 border rounded-md"
                    required
                  >
                    <option value="">Selecione um lead</option>
                    {leads.map((lead) => (
                      <option key={lead.id} value={lead.id}>
                        {lead.name} {lead.company ? `- ${lead.company}` : ''}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-medium mb-1">Tipo de Tarefa *</label>
                  <select
                    value={formData.type}
                    onChange={(e) => setFormData({ ...formData, type: e.target.value })}
                    className="w-full px-3 py-2 border rounded-md"
                    required
                  >
                    <option value="email">Email</option>
                    <option value="call">Ligação</option>
                    <option value="linkedin">LinkedIn</option>
                    <option value="meeting">Reunião</option>
                    <option value="follow_up">Follow-up</option>
                    <option value="research">Pesquisa</option>
                    <option value="other">Outro</option>
                  </select>
                </div>
              </div>
              <div>
                <label className="block text-sm font-medium mb-1">Título *</label>
                {formData.type === 'linkedin' ? (
                  <select
                    value={formData.title}
                    onChange={(e) => setFormData({ ...formData, title: e.target.value })}
                    className="w-full px-3 py-2 border rounded-md"
                    required
                  >
                    <option value="">Selecione um título</option>
                    {linkedinTaskTitles.map((title) => (
                      <option key={title} value={title}>
                        {title}
                      </option>
                    ))}
                  </select>
                ) : (
                  <Input
                    type="text"
                    value={formData.title}
                    onChange={(e) => setFormData({ ...formData, title: e.target.value })}
                    placeholder="Ex: Enviar email de apresentação"
                    required
                  />
                )}
              </div>
              <div>
                <div className="flex items-center justify-between mb-1">
                  <label className="block text-sm font-medium">Descrição</label>
                  {formData.type === 'linkedin' && formData.lead_id && (
                    <div className="flex flex-wrap gap-2">
                      {(formData.title === 'Enviar nota de conexão' || formData.title === 'Enviar solicitação de conexão') && (
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          onClick={() => handleGenerateLinkedInMessage('connection_note')}
                          disabled={generatingMessage}
                          className="flex items-center gap-1 md:gap-2 text-xs"
                        >
                          {generatingMessage ? (
                            <>
                              <Loader2 className="h-3 w-3 animate-spin" />
                              <span className="hidden sm:inline">Gerando...</span>
                              <span className="sm:hidden">...</span>
                            </>
                          ) : (
                            <>
                              <Sparkles className="h-3 w-3" />
                              <span className="hidden sm:inline">Gerar Nota de Conexão com IA</span>
                              <span className="sm:hidden">Gerar Nota</span>
                            </>
                          )}
                        </Button>
                      )}
                      {(formData.title === 'Enviar mensagem de follow-up' ||
                        formData.title === 'Follow-up após conexão aceita' ||
                        formData.title === 'Follow-up após reunião' ||
                        formData.title === 'Follow-up após e-mail' ||
                        formData.title === 'Follow-up após ligação') && (
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          onClick={() => handleGenerateLinkedInMessage('followup')}
                          disabled={generatingMessage}
                          className="flex items-center gap-1 md:gap-2 text-xs"
                        >
                          {generatingMessage ? (
                            <>
                              <Loader2 className="h-3 w-3 animate-spin" />
                              <span className="hidden sm:inline">Gerando...</span>
                              <span className="sm:hidden">...</span>
                            </>
                          ) : (
                            <>
                              <Sparkles className="h-3 w-3" />
                              <span className="hidden sm:inline">Gerar Mensagem com IA</span>
                              <span className="sm:hidden">Gerar</span>
                            </>
                          )}
                        </Button>
                      )}
                    </div>
                  )}
                </div>
                <Textarea
                  value={formData.description}
                  onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                  placeholder={formData.type === 'linkedin' ? "Mensagem do LinkedIn ou descrição da tarefa..." : "Descreva a tarefa..."}
                  rows={formData.type === 'linkedin' ? 5 : 3}
                />
                {formData.type === 'linkedin' && (
                  <p className="text-xs text-muted-foreground mt-1">
                    {formData.description.length > 0 && `${formData.description.length} caracteres`}
                    {formData.description.length === 0 && 'Use os botões acima para gerar mensagens personalizadas com IA'}
                  </p>
                )}
              </div>
              <div className="grid gap-4 md:grid-cols-2">
                <div>
                  <label className="block text-sm font-medium mb-1">Data de Vencimento *</label>
                  <Input
                    type="date"
                    value={formData.due_date}
                    onChange={(e) => setFormData({ ...formData, due_date: e.target.value })}
                    required
                    min={new Date().toISOString().split('T')[0]}
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium mb-1">Horário</label>
                  <Input
                    type="time"
                    value={formData.due_time}
                    onChange={(e) => setFormData({ ...formData, due_time: e.target.value })}
                  />
                </div>
              </div>
              <div>
                <label className="block text-sm font-medium mb-1">Responsável</label>
                <select
                  value={formData.owner_id || ''}
                  onChange={(e) => setFormData({ ...formData, owner_id: e.target.value ? parseInt(e.target.value) : null })}
                  className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background"
                >
                  <option value="">Sem responsável</option>
                  {users.map((user) => (
                    <option key={user.id} value={user.id}>
                      {user.full_name} ({user.email})
                    </option>
                  ))}
                </select>
              </div>
              <div className="flex flex-wrap gap-2 pt-4">
                <Button 
                  type="submit"
                  className="bg-gradient-to-r from-emerald-600 to-emerald-700 hover:from-emerald-700 hover:to-emerald-800 text-white shadow-md hover:shadow-lg transition-all duration-200 flex-1 md:flex-initial text-xs md:text-sm"
                >
                  Criar Tarefa
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  className="border-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800 flex-1 md:flex-initial text-xs md:text-sm"
                  onClick={() => {
                    setShowForm(false)
                    setFormData({
                      lead_id: '',
                      type: 'email',
                      title: '',
                      description: '',
                      due_date: '',
                      due_time: '09:00'
                    })
                  }}
                >
                  Cancelar
                </Button>
              </div>
            </form>
          </CardContent>
        </Card>
      )}

      {/* Filtros e Paginação */}
      <Card className="border-t-4 border-t-emerald-500 bg-gradient-to-br from-emerald-50/30 to-white dark:from-emerald-950/10 dark:to-background">
          <CardHeader className="bg-gradient-to-r from-emerald-50/50 to-transparent dark:from-emerald-950/20">
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
              <CardTitle className="text-emerald-900 dark:text-emerald-100 text-lg md:text-xl">Filtros</CardTitle>
              <div className="flex items-center gap-2">
                <label className="text-xs md:text-sm font-medium">Itens por página:</label>
                <select
                  value={pageSize}
                  onChange={(e) => {
                    const newPageSize = Number(e.target.value)
                    setPageSize(newPageSize)
                    setCurrentPage(1)
                  }}
                  className="px-2 md:px-3 py-1.5 border rounded-md text-xs md:text-sm bg-background"
                >
                  <option value={10}>10</option>
                  <option value={20}>20</option>
                  <option value={50}>50</option>
                  <option value={100}>100</option>
                </select>
              </div>
            </div>
          </CardHeader>
        <CardContent>
          <div className="grid gap-4 md:grid-cols-3">
            <div>
              <label className="block text-sm font-medium mb-1">Buscar</label>
              <div className="relative">
                <Search className="absolute left-2 top-2.5 h-4 w-4 text-muted-foreground" />
                <input
                  type="text"
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  placeholder="Buscar por título ou lead..."
                  className="w-full pl-8 pr-3 py-2 border rounded-md"
                />
              </div>
            </div>
            <div>
              <label className="block text-sm font-medium mb-1">Status</label>
              <select
                value={statusFilter}
                onChange={(e) => {
                  setStatusFilter(e.target.value)
                  setCurrentPage(1)
                }}
                className="w-full px-3 py-2 border rounded-md"
              >
                <option value="all">Todos</option>
                <option value="pending">Pendente</option>
                <option value="in_progress">Em Progresso</option>
                <option value="completed">Concluída</option>
                <option value="cancelled">Cancelada</option>
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium mb-1">Tipo</label>
              <select
                value={typeFilter}
                onChange={(e) => {
                  setTypeFilter(e.target.value)
                  setCurrentPage(1)
                }}
                className="w-full px-3 py-2 border rounded-md"
              >
                <option value="all">Todos</option>
                <option value="email">Email</option>
                <option value="call">Ligação</option>
                <option value="linkedin">LinkedIn</option>
                <option value="meeting">Reunião</option>
                <option value="follow_up">Follow-up</option>
              </select>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Tarefas Atrasadas */}
      {overdueTasks.length > 0 && (
        <Card className="border-t-4 border-t-red-500 bg-gradient-to-br from-red-50/30 to-white dark:from-red-950/10 dark:to-background">
          <CardHeader className="bg-gradient-to-r from-red-50/50 to-transparent dark:from-red-950/20">
            <CardTitle className="flex items-center gap-2 text-red-900 dark:text-red-100">
              <AlertCircle className="h-5 w-5 text-red-600 dark:text-red-400" />
              Tarefas Atrasadas ({overdueTasks.length})
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              {overdueTasks.map((task) => {
                const dueDate = new Date(task.due_date)
                return (
                  <div
                    key={task.id}
                    className="flex flex-col sm:flex-row sm:items-center gap-3 p-3 rounded-lg bg-red-50 border border-red-200 dark:bg-red-950 dark:border-red-800 cursor-pointer hover:bg-red-100 dark:hover:bg-red-900 transition-colors"
                    onClick={() => handleOpenTaskDetail(task)}
                  >
                    <input
                      type="checkbox"
                      checked={selectedTasks.has(task.id)}
                      onChange={() => handleSelectTask(task.id)}
                      onClick={(e) => e.stopPropagation()}
                      className="h-4 w-4 cursor-pointer flex-shrink-0"
                    />
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        {getTypeIcon(task.type)}
                        <span className="font-medium text-sm md:text-base break-words">{task.title}</span>
                        <span className="text-xs px-2 py-1 rounded bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200 flex-shrink-0">
                          {task.type}
                        </span>
                      </div>
                      {task.lead && (
                        <p className="text-xs md:text-sm text-muted-foreground mt-1 break-words">
                          {task.lead.name}
                          {task.lead.company && <span className="hidden sm:inline"> - {task.lead.company}</span>}
                        </p>
                      )}
                      {task.owner && (
                        <p className="text-xs text-muted-foreground mt-1 flex items-center gap-1">
                          <User className="h-3 w-3 flex-shrink-0" />
                          <span className="hidden sm:inline">Responsável: </span>
                          <span className="break-words">{task.owner.full_name}</span>
                        </p>
                      )}
                      {task.owner_id && !task.owner && (
                        <p className="text-xs text-muted-foreground mt-1 flex items-center gap-1">
                          <User className="h-3 w-3 flex-shrink-0" />
                          <span className="hidden sm:inline">Responsável: </span>
                          <span className="break-words">{users.find(u => u.id === task.owner_id)?.full_name || `ID: ${task.owner_id}`}</span>
                        </p>
                      )}
                      <p className="text-xs text-red-600 dark:text-red-400 mt-1 break-words">
                        <span className="hidden sm:inline">Vencida em </span>
                        {formatDate(dueDate)}
                      </p>
                    </div>
                    <div className="flex gap-2 flex-shrink-0" onClick={(e) => e.stopPropagation()}>
                      <Button
                        size="sm"
                        onClick={() => handleStatusChange(task.id, 'completed')}
                        className="text-xs md:text-sm h-8 md:h-9"
                      >
                        <CheckCircle2 className="h-3 w-3 md:h-4 md:w-4 mr-1" />
                        <span className="hidden sm:inline">Concluir</span>
                        <span className="sm:hidden">OK</span>
                      </Button>
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => navigate(`/leads`)}
                        className="text-xs md:text-sm h-8 md:h-9"
                      >
                        <span className="hidden sm:inline">Ver Lead</span>
                        <span className="sm:hidden">Lead</span>
                      </Button>
                    </div>
                  </div>
                )
              })}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Próximas Tarefas */}
      {upcomingTasks.length > 0 && (
        <Card className="border-t-4 border-t-blue-500 bg-gradient-to-br from-blue-50/30 to-white dark:from-blue-950/10 dark:to-background">
          <CardHeader className="bg-gradient-to-r from-blue-50/50 to-transparent dark:from-blue-950/20">
            <CardTitle className="flex items-center gap-2 text-blue-900 dark:text-blue-100">
              <Clock className="h-5 w-5 text-blue-600 dark:text-blue-400" />
              Próximas Tarefas ({upcomingTasks.length})
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              {upcomingTasks.map((task) => {
                const dueDate = new Date(task.due_date)
                const isToday = dueDate.toDateString() === new Date().toDateString()
                
                return (
                  <div
                    key={task.id}
                    className={`flex flex-col sm:flex-row sm:items-center gap-3 p-3 rounded-lg border cursor-pointer hover:opacity-90 transition-colors ${
                      isToday
                        ? 'bg-yellow-50 border-yellow-200 dark:bg-yellow-950 dark:border-yellow-800 hover:bg-yellow-100 dark:hover:bg-yellow-900'
                        : 'bg-gray-50 border-gray-200 dark:bg-gray-900 dark:border-gray-800 hover:bg-gray-100 dark:hover:bg-gray-800'
                    }`}
                    onClick={() => handleOpenTaskDetail(task)}
                  >
                    <input
                      type="checkbox"
                      checked={selectedTasks.has(task.id)}
                      onChange={() => handleSelectTask(task.id)}
                      onClick={(e) => e.stopPropagation()}
                      className="h-4 w-4 cursor-pointer flex-shrink-0"
                    />
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        {getTypeIcon(task.type)}
                        <span className="font-medium text-sm md:text-base break-words">{task.title}</span>
                        <span className="text-xs px-2 py-1 rounded bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200 flex-shrink-0">
                          {task.type}
                        </span>
                      </div>
                      {task.lead && (
                        <p className="text-xs md:text-sm text-muted-foreground mt-1 break-words">
                          {task.lead.name}
                          {task.lead.company && <span className="hidden sm:inline"> - {task.lead.company}</span>}
                        </p>
                      )}
                      {task.owner && (
                        <p className="text-xs text-muted-foreground mt-1 flex items-center gap-1">
                          <User className="h-3 w-3 flex-shrink-0" />
                          <span className="hidden sm:inline">Responsável: </span>
                          <span className="break-words">{task.owner.full_name}</span>
                        </p>
                      )}
                      {task.owner_id && !task.owner && (
                        <p className="text-xs text-muted-foreground mt-1 flex items-center gap-1">
                          <User className="h-3 w-3 flex-shrink-0" />
                          <span className="hidden sm:inline">Responsável: </span>
                          <span className="break-words">{users.find(u => u.id === task.owner_id)?.full_name || `ID: ${task.owner_id}`}</span>
                        </p>
                      )}
                      <p className={`text-xs mt-1 ${
                        isToday
                          ? 'text-yellow-600 dark:text-yellow-400 font-medium'
                          : 'text-muted-foreground'
                      }`}>
                        {isToday ? 'Hoje' : formatDate(dueDate)}
                      </p>
                    </div>
                    <div className="flex gap-2 flex-shrink-0" onClick={(e) => e.stopPropagation()}>
                      <Button
                        size="sm"
                        onClick={() => handleStatusChange(task.id, 'in_progress')}
                        variant="outline"
                        className="text-xs md:text-sm h-8 md:h-9"
                      >
                        Iniciar
                      </Button>
                      <Button
                        size="sm"
                        onClick={() => handleStatusChange(task.id, 'completed')}
                        className="text-xs md:text-sm h-8 md:h-9"
                      >
                        <CheckCircle2 className="h-3 w-3 md:h-4 md:w-4 mr-1" />
                        <span className="hidden sm:inline">Concluir</span>
                        <span className="sm:hidden">OK</span>
                      </Button>
                    </div>
                  </div>
                )
              })}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Tarefas Concluídas */}
      {completedTasks.length > 0 && statusFilter === 'all' && (
        <Card className="border-t-4 border-t-green-500 bg-gradient-to-br from-green-50/30 to-white dark:from-green-950/10 dark:to-background">
          <CardHeader className="bg-gradient-to-r from-green-50/50 to-transparent dark:from-green-950/20">
            <CardTitle className="flex items-center gap-2 text-green-900 dark:text-green-100">
              <CheckCircle2 className="h-5 w-5 text-green-600 dark:text-green-400" />
              Tarefas Concluídas ({completedTasks.length})
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-2">
              {completedTasks.map((task) => (
                <div
                  key={task.id}
                  className="flex items-center gap-2 md:gap-3 p-2 rounded-lg bg-gray-50 border border-gray-200 dark:bg-gray-900 dark:border-gray-800 cursor-pointer hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors"
                  onClick={() => handleOpenTaskDetail(task)}
                >
                  <input
                    type="checkbox"
                    checked={selectedTasks.has(task.id)}
                    onChange={() => handleSelectTask(task.id)}
                    onClick={(e) => e.stopPropagation()}
                    className="h-4 w-4 cursor-pointer flex-shrink-0"
                  />
                  <div className="flex items-center gap-2 flex-wrap min-w-0 flex-1">
                    <CheckCircle2 className="h-4 w-4 text-green-500 flex-shrink-0" />
                    <span className="text-xs md:text-sm line-through text-muted-foreground break-words">{task.title}</span>
                    {task.lead && (
                      <span className="text-xs text-muted-foreground break-words">
                        - {task.lead.name}
                      </span>
                    )}
                    {task.owner && (
                      <span className="text-xs text-muted-foreground flex items-center gap-1">
                        <User className="h-3 w-3 flex-shrink-0" />
                        <span className="break-words">{task.owner.full_name}</span>
                      </span>
                    )}
                    {task.owner_id && !task.owner && (
                      <span className="text-xs text-muted-foreground flex items-center gap-1">
                        <User className="h-3 w-3 flex-shrink-0" />
                        <span className="break-words">{users.find(u => u.id === task.owner_id)?.full_name || `ID: ${task.owner_id}`}</span>
                      </span>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Paginação - Sempre exibir o seletor */}
      <Card>
        <CardContent className="py-4">
          <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
            <div className="flex flex-col sm:flex-row items-start sm:items-center gap-2 sm:gap-4">
              {totalTasks > 0 ? (
                <span className="text-xs md:text-sm text-muted-foreground">
                  <span className="hidden sm:inline">Mostrando {((currentPage - 1) * pageSize) + 1} a {Math.min(currentPage * pageSize, totalTasks)} de {totalTasks} tarefas</span>
                  <span className="sm:hidden">{((currentPage - 1) * pageSize) + 1}-{Math.min(currentPage * pageSize, totalTasks)} de {totalTasks}</span>
                </span>
              ) : (
                <span className="text-xs md:text-sm text-muted-foreground">
                  {tasks.length > 0 ? `Mostrando ${tasks.length} tarefa(s)` : 'Nenhuma tarefa encontrada'}
                </span>
              )}
              <div className="flex items-center gap-2">
                <label className="text-xs md:text-sm font-medium">Itens por página:</label>
                <select
                  value={pageSize}
                  onChange={(e) => {
                    const newPageSize = Number(e.target.value)
                    setPageSize(newPageSize)
                    setCurrentPage(1)
                  }}
                  className="px-2 md:px-3 py-1.5 border rounded-md text-xs md:text-sm bg-background min-w-[80px]"
                >
                  <option value={10}>10</option>
                  <option value={20}>20</option>
                  <option value={50}>50</option>
                  <option value={100}>100</option>
                </select>
              </div>
            </div>
            <div className="flex items-center gap-1 md:gap-2 flex-wrap">
              <Button
                variant="outline"
                size="sm"
                onClick={() => setCurrentPage(1)}
                disabled={currentPage === 1 || totalTasks === 0}
                className="text-xs px-2 md:px-3"
              >
                <span className="hidden sm:inline">Primeira</span>
                <span className="sm:hidden">1ª</span>
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={() => setCurrentPage(p => Math.max(1, p - 1))}
                disabled={currentPage === 1 || totalTasks === 0}
                className="text-xs px-2 md:px-3"
              >
                <span className="hidden sm:inline">Anterior</span>
                <span className="sm:hidden">Ant</span>
              </Button>
              <span className="text-xs md:text-sm px-2 md:px-3 font-medium">
                <span className="hidden sm:inline">Página {currentPage} de {totalPages > 0 ? totalPages : 1}</span>
                <span className="sm:hidden">{currentPage}/{totalPages > 0 ? totalPages : 1}</span>
              </span>
              <Button
                variant="outline"
                size="sm"
                onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))}
                disabled={currentPage >= totalPages || totalTasks === 0}
                className="text-xs px-2 md:px-3"
              >
                <span className="hidden sm:inline">Próxima</span>
                <span className="sm:hidden">Próx</span>
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={() => setCurrentPage(totalPages)}
                disabled={currentPage >= totalPages || totalTasks === 0}
                className="text-xs px-2 md:px-3"
              >
                <span className="hidden sm:inline">Última</span>
                <span className="sm:hidden">Últ</span>
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>

      {tasks.length === 0 && !loading && (
        <Card>
          <CardContent className="py-12 text-center">
            <p className="text-muted-foreground">Nenhuma tarefa encontrada</p>
            <Button onClick={() => navigate('/leads')} className="mt-4">
              Associar Cadência a um Lead
            </Button>
          </CardContent>
        </Card>
      )}

      {/* Modal de Detalhes da Tarefa */}
      {showTaskDetailModal && selectedTaskDetail && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-2 md:p-4">
          <Card className="w-full max-w-4xl h-[90vh] md:h-[90vh] overflow-hidden flex flex-col">
            <CardHeader className="border-b flex-shrink-0 p-4 md:p-6">
              <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
                <CardTitle className="text-lg md:text-2xl break-words">Detalhes da Tarefa</CardTitle>
                <div className="flex items-center gap-2 flex-shrink-0">
                  {!editingTask && (
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => setEditingTask(true)}
                      className="text-xs md:text-sm h-8 md:h-9"
                    >
                      <Edit className="h-3 w-3 md:h-4 md:w-4 mr-1 md:mr-2" />
                      Editar
                    </Button>
                  )}
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={() => {
                      setShowTaskDetailModal(false)
                      setSelectedTaskDetail(null)
                      setActiveTab('basicas')
                      setEditingTask(false)
                    }}
                    className="h-8 w-8 md:h-10 md:w-10"
                  >
                    <XCircle className="h-4 w-4 md:h-5 md:w-5" />
                  </Button>
                </div>
              </div>
            </CardHeader>
            
            {/* Abas */}
            <div className="border-b px-4 md:px-6 flex-shrink-0">
              <div className="flex gap-1 overflow-x-auto">
                <button
                  onClick={() => setActiveTab('basicas')}
                  className={`px-3 md:px-4 py-2 md:py-3 text-xs md:text-sm font-medium border-b-2 transition-colors whitespace-nowrap ${
                    activeTab === 'basicas'
                      ? 'border-primary text-primary'
                      : 'border-transparent text-muted-foreground hover:text-foreground'
                  }`}
                >
                  <span className="hidden sm:inline">Informações Básicas</span>
                  <span className="sm:hidden">Básicas</span>
                </button>
                <button
                  onClick={() => setActiveTab('comentarios')}
                  className={`px-3 md:px-4 py-2 md:py-3 text-xs md:text-sm font-medium border-b-2 transition-colors whitespace-nowrap ${
                    activeTab === 'comentarios'
                      ? 'border-primary text-primary'
                      : 'border-transparent text-muted-foreground hover:text-foreground'
                  }`}
                >
                  Comentários
                </button>
              </div>
            </div>

            <CardContent className="flex-1 overflow-y-auto p-4 md:p-6">
              {/* Aba: Informações Básicas */}
              {activeTab === 'basicas' && (
                <div className="space-y-4">
                  {editingTask ? (
                    <div className="space-y-4">
                      <div>
                        <label className="block text-xs md:text-sm font-medium mb-1">Título *</label>
                        <Input
                          value={editFormData.title}
                          onChange={(e) => setEditFormData({ ...editFormData, title: e.target.value })}
                          required
                          className="text-xs md:text-sm"
                        />
                      </div>
                      <div>
                        <label className="block text-xs md:text-sm font-medium mb-1">Descrição</label>
                        <Textarea
                          value={editFormData.description}
                          onChange={(e) => setEditFormData({ ...editFormData, description: e.target.value })}
                          rows={4}
                          className="text-xs md:text-sm"
                        />
                      </div>
                      <div className="grid gap-4 grid-cols-1 sm:grid-cols-2">
                        <div>
                          <label className="block text-xs md:text-sm font-medium mb-1">Status *</label>
                          <select
                            value={editFormData.status}
                            onChange={(e) => setEditFormData({ ...editFormData, status: e.target.value })}
                            className="w-full px-3 py-2 border rounded-md text-xs md:text-sm"
                            required
                          >
                            <option value="pending">Pendente</option>
                            <option value="in_progress">Em Progresso</option>
                            <option value="completed">Concluída</option>
                            <option value="cancelled">Cancelada</option>
                          </select>
                        </div>
                        <div>
                          <label className="block text-xs md:text-sm font-medium mb-1">Responsável</label>
                          <select
                            value={editFormData.owner_id || ''}
                            onChange={(e) => setEditFormData({ ...editFormData, owner_id: e.target.value ? Number(e.target.value) : null })}
                            className="w-full px-3 py-2 border rounded-md text-xs md:text-sm"
                          >
                            <option value="">Sem responsável</option>
                            {users.map((user) => (
                              <option key={user.id} value={user.id}>
                                {user.full_name} ({user.email})
                              </option>
                            ))}
                          </select>
                        </div>
                        <div>
                          <label className="block text-xs md:text-sm font-medium mb-1">Data de Vencimento *</label>
                          <Input
                            type="date"
                            value={editFormData.due_date}
                            onChange={(e) => setEditFormData({ ...editFormData, due_date: e.target.value })}
                            required
                            className="text-xs md:text-sm"
                          />
                        </div>
                        <div>
                          <label className="block text-xs md:text-sm font-medium mb-1">Horário</label>
                          <Input
                            type="time"
                            value={editFormData.due_time}
                            onChange={(e) => setEditFormData({ ...editFormData, due_time: e.target.value })}
                            className="text-xs md:text-sm"
                          />
                        </div>
                      </div>
                      <div>
                        <label className="block text-xs md:text-sm font-medium mb-1">Notas</label>
                        <Textarea
                          value={editFormData.notes}
                          onChange={(e) => setEditFormData({ ...editFormData, notes: e.target.value })}
                          rows={3}
                          className="text-xs md:text-sm"
                        />
                      </div>
                      <div className="flex flex-wrap gap-2 pt-4">
                        <Button 
                          onClick={handleUpdateTask}
                          className="flex-1 sm:flex-initial text-xs md:text-sm"
                        >
                          Salvar Alterações
                        </Button>
                        <Button
                          variant="outline"
                          onClick={() => {
                            setEditingTask(false)
                            // Restaurar dados originais
                            const dueDate = new Date(selectedTaskDetail.due_date)
                            setEditFormData({
                              title: selectedTaskDetail.title,
                              description: selectedTaskDetail.description || '',
                              status: selectedTaskDetail.status,
                              due_date: dueDate.toISOString().split('T')[0],
                              due_time: dueDate.toTimeString().slice(0, 5),
                              owner_id: selectedTaskDetail.owner_id,
                              notes: selectedTaskDetail.notes || ''
                            })
                          }}
                          className="flex-1 sm:flex-initial text-xs md:text-sm"
                        >
                          Cancelar
                        </Button>
                      </div>
                    </div>
                  ) : (
                    <>
                      <div className="grid gap-4 grid-cols-1 sm:grid-cols-2">
                        <div>
                          <label className="text-xs md:text-sm font-medium text-muted-foreground">Título</label>
                          <p className="text-sm md:text-base font-medium mt-1 break-words">{selectedTaskDetail.title}</p>
                        </div>
                        <div>
                          <label className="text-xs md:text-sm font-medium text-muted-foreground">Status</label>
                          <p className="mt-1">
                            <span className={`text-xs px-2 py-1 rounded ${
                              selectedTaskDetail.status === 'completed' ? 'bg-green-100 text-green-700 dark:bg-green-900 dark:text-green-200' :
                              selectedTaskDetail.status === 'in_progress' ? 'bg-blue-100 text-blue-700 dark:bg-blue-900 dark:text-blue-200' :
                              selectedTaskDetail.status === 'cancelled' ? 'bg-red-100 text-red-700 dark:bg-red-900 dark:text-red-200' :
                              'bg-yellow-100 text-yellow-700 dark:bg-yellow-900 dark:text-yellow-200'
                            }`}>
                              {selectedTaskDetail.status === 'pending' ? 'Pendente' :
                               selectedTaskDetail.status === 'in_progress' ? 'Em Progresso' :
                               selectedTaskDetail.status === 'completed' ? 'Concluída' : 'Cancelada'}
                            </span>
                          </p>
                        </div>
                        <div>
                          <label className="text-xs md:text-sm font-medium text-muted-foreground">Tipo</label>
                          <p className="text-sm md:text-base mt-1 flex items-center gap-2">
                            {getTypeIcon(selectedTaskDetail.type)}
                            <span className="capitalize break-words">{selectedTaskDetail.type}</span>
                          </p>
                        </div>
                        <div>
                          <label className="text-xs md:text-sm font-medium text-muted-foreground">Data de Vencimento</label>
                          <p className="text-sm md:text-base mt-1 flex items-center gap-2">
                            <Calendar className="h-4 w-4 flex-shrink-0" />
                            <span className="break-words">{formatDate(new Date(selectedTaskDetail.due_date))}</span>
                          </p>
                        </div>
                        {selectedTaskDetail.owner && (
                          <div>
                            <label className="text-xs md:text-sm font-medium text-muted-foreground">Responsável</label>
                            <p className="text-sm md:text-base mt-1 flex items-center gap-2">
                              <User className="h-4 w-4 flex-shrink-0" />
                              <span className="break-words">{selectedTaskDetail.owner.full_name}</span>
                            </p>
                          </div>
                        )}
                        {selectedTaskDetail.lead && (
                          <div>
                            <label className="text-xs md:text-sm font-medium text-muted-foreground">Lead</label>
                            <p className="text-sm md:text-base mt-1 break-words">{selectedTaskDetail.lead.name}</p>
                            {selectedTaskDetail.lead.company && (
                              <p className="text-xs md:text-sm text-muted-foreground break-words">{selectedTaskDetail.lead.company}</p>
                            )}
                          </div>
                        )}
                        {selectedTaskDetail.completed_at && (
                          <div>
                            <label className="text-xs md:text-sm font-medium text-muted-foreground">Concluída em</label>
                            <p className="text-sm md:text-base mt-1 flex items-center gap-2">
                              <Calendar className="h-4 w-4 flex-shrink-0" />
                              <span className="break-words">{formatDate(new Date(selectedTaskDetail.completed_at))}</span>
                            </p>
                          </div>
                        )}
                      </div>
                      {selectedTaskDetail.description && (
                        <div className="mt-4">
                          <label className="text-xs md:text-sm font-medium text-muted-foreground">Descrição</label>
                          <p className="text-sm md:text-base mt-1 whitespace-pre-wrap break-words">{selectedTaskDetail.description}</p>
                        </div>
                      )}
                      {selectedTaskDetail.notes && (
                        <div className="mt-4">
                          <label className="text-xs md:text-sm font-medium text-muted-foreground">Notas</label>
                          <div className="mt-1 p-3 md:p-4 bg-gray-50 dark:bg-gray-900 rounded-lg">
                            <p className="text-sm md:text-base whitespace-pre-wrap break-words">{selectedTaskDetail.notes}</p>
                          </div>
                        </div>
                      )}
                    </>
                  )}
                </div>
              )}

              {/* Aba: Comentários */}
              {activeTab === 'comentarios' && (
                <div className="space-y-4 md:space-y-6">
                  <div>
                    <h3 className="text-base md:text-lg font-semibold mb-4">Comentários</h3>
                    
                    {/* Formulário para adicionar comentário */}
                    <div className="mb-4 space-y-2">
                      <Textarea
                        placeholder="Adicione um comentário sobre esta tarefa..."
                        value={newComment}
                        onChange={(e) => setNewComment(e.target.value)}
                        rows={3}
                        className="w-full text-xs md:text-sm"
                      />
                      <div className="flex justify-end">
                        <Button
                          onClick={handleAddComment}
                          disabled={!newComment.trim() || addingComment}
                          size="sm"
                          className="text-xs md:text-sm"
                        >
                          {addingComment ? 'Adicionando...' : 'Adicionar Comentário'}
                        </Button>
                      </div>
                    </div>

                    {/* Lista de comentários */}
                    {loadingComments ? (
                      <p className="text-sm text-muted-foreground">Carregando comentários...</p>
                    ) : taskComments.length === 0 ? (
                      <p className="text-sm text-muted-foreground">Nenhum comentário ainda. Seja o primeiro a comentar!</p>
                    ) : (
                      <div className="space-y-3">
                        {taskComments.map((comment) => (
                          <div
                            key={comment.id}
                            className="bg-gray-50 dark:bg-gray-900 p-4 rounded-lg border"
                          >
                            <div className="flex items-start justify-between mb-2">
                              <div className="flex-1">
                                <div className="flex items-center gap-2 mb-1">
                                  <User className="h-4 w-4 text-muted-foreground" />
                                  <span className="font-medium text-sm">
                                    {comment.user_name || comment.user_email || 'Usuário'}
                                  </span>
                                  <span className="text-xs text-muted-foreground">
                                    • {new Date(comment.created_at).toLocaleString('pt-BR')}
                                  </span>
                                </div>
                                <p className="text-sm whitespace-pre-wrap mt-2">{comment.comment}</p>
                              </div>
                              <Button
                                variant="ghost"
                                size="icon"
                                className="h-6 w-6"
                                onClick={() => handleDeleteComment(comment.id)}
                                title="Excluir comentário"
                              >
                                <Trash2 className="h-3 w-3" />
                              </Button>
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      )}

      {/* Modal de Geração de Nota de Conexão */}
      {showConnectionNoteModal && taskForConnectionNote && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-2 md:p-4">
          <Card className="w-full max-w-2xl max-h-[90vh] overflow-hidden flex flex-col">
            <CardHeader className="border-b flex-shrink-0 p-4 md:p-6">
              <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
                <CardTitle className="flex items-center gap-2 text-base md:text-lg break-words">
                  <LinkIcon className="h-4 w-4 md:h-5 md:w-5 flex-shrink-0" />
                  Gerar Nota de Conexão
                </CardTitle>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={handleCancelConnectionNote}
                  className="h-8 w-8 md:h-9 md:w-9 flex-shrink-0"
                >
                  <X className="h-3 w-3 md:h-4 md:w-4" />
                </Button>
              </div>
              <p className="text-xs md:text-sm text-muted-foreground mt-2 break-words">
                Tarefa: {taskForConnectionNote.title}
                {taskForConnectionNote.lead && (
                  <span className="ml-2">• Lead: {taskForConnectionNote.lead.name}</span>
                )}
              </p>
            </CardHeader>
            <CardContent className="flex-1 overflow-y-auto p-4 md:p-6">
              <div className="space-y-4">
                <div>
                  <label className="block text-xs md:text-sm font-medium mb-2">
                    Nota de Conexão
                  </label>
                  <div className="flex flex-wrap gap-2 mb-2">
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={handleGenerateConnectionNote}
                      disabled={generatingConnectionNote}
                      className="flex items-center gap-1 md:gap-2 text-xs"
                    >
                      {generatingConnectionNote ? (
                        <>
                          <Loader2 className="h-3 w-3 md:h-4 md:w-4 animate-spin" />
                          <span className="hidden sm:inline">Gerando...</span>
                          <span className="sm:hidden">...</span>
                        </>
                      ) : (
                        <>
                          <Sparkles className="h-3 w-3 md:h-4 md:w-4" />
                          <span className="hidden sm:inline">Gerar Nota de Conexão com IA</span>
                          <span className="sm:hidden">Gerar Nota</span>
                        </>
                      )}
                    </Button>
                  </div>
                  <Textarea
                    value={connectionNoteText}
                    onChange={(e) => setConnectionNoteText(e.target.value)}
                    placeholder="A nota de conexão será gerada aqui. Você pode editar antes de salvar."
                    rows={8}
                    className="font-mono text-xs md:text-sm"
                  />
                  <p className="text-xs text-muted-foreground mt-1">
                    {connectionNoteText.length} caracteres
                  </p>
                </div>
                <div className="bg-blue-50 dark:bg-blue-950/20 border border-blue-200 dark:border-blue-900 rounded-lg p-3 md:p-4">
                  <p className="text-xs md:text-sm text-blue-900 dark:text-blue-100 break-words">
                    <strong>Dica:</strong> A IA irá gerar uma nota de conexão personalizada baseada no insight do lead e nos produtos/serviços do catálogo. Você pode editar o texto gerado antes de salvar.
                  </p>
                </div>
              </div>
            </CardContent>
            <div className="border-t p-4 flex flex-wrap gap-2 justify-end flex-shrink-0">
              <Button
                variant="outline"
                onClick={handleCancelConnectionNote}
                className="flex-1 sm:flex-initial text-xs md:text-sm"
              >
                Cancelar
              </Button>
              <Button
                onClick={handleSaveConnectionNote}
                disabled={!connectionNoteText.trim()}
                className="bg-blue-600 hover:bg-blue-700 flex-1 sm:flex-initial text-xs md:text-sm"
              >
                <span className="hidden sm:inline">Salvar e Completar Tarefa</span>
                <span className="sm:hidden">Salvar</span>
              </Button>
            </div>
          </Card>
        </div>
      )}
    </div>
  )
}

