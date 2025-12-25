import { useState, useEffect } from 'react'
import { useTranslation } from 'react-i18next'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import api from '@/lib/api'
import { useKPI } from '@/contexts/KPIContext'
import { Plus, CheckCircle2, Clock, AlertCircle, Mail, Phone, Link as LinkIcon, Calendar, Search, X, User, XCircle, Trash2, Edit } from 'lucide-react'
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
  const { t } = useTranslation()
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
        filtered = tasksWithLeads.filter(task => 
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
      setSelectedTaskDetail(prev => prev ? { ...prev, updated_at: taskResponse.data.updated_at } : taskResponse.data)
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
      setTaskComments(prevComments => prevComments.filter(c => c.id !== commentId))
      
      if (selectedTaskDetail) {
        const taskResponse = await api.get(`/api/tasks/${selectedTaskDetail.id}`)
        setSelectedTaskDetail(prev => prev ? { ...prev, updated_at: taskResponse.data.updated_at } : taskResponse.data)
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
      
      // Atualizar otimisticamente a UI
      setTasks(prevTasks => 
        prevTasks.map(task => 
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
      const task = tasks.find(t => t.id === taskId)
      if (newStatus === 'completed' && task && task.status !== 'completed') {
        trackActivity('tasks_completed', 1, 'Task', taskId).catch((err) => {
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
  const upcomingTasks = tasks.filter(task => {
    const dueDate = new Date(task.due_date)
    return dueDate >= new Date() && task.status !== 'completed'
  }).sort((a, b) => new Date(a.due_date).getTime() - new Date(b.due_date).getTime())

  const overdueTasks = tasks.filter(task => {
    const dueDate = new Date(task.due_date)
    return dueDate < new Date() && task.status !== 'completed'
  })

  const completedTasks = tasks.filter(task => task.status === 'completed')
  
  // Calcular totalPages, garantindo pelo menos 1 página
  const totalPages = totalTasks > 0 ? Math.ceil(totalTasks / pageSize) : 1

  if (loading) {
    return <div className="flex-1 space-y-6 p-6">Carregando...</div>
  }

  return (
    <div className="flex-1 space-y-6 p-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold">{t('navigation.tasks')}</h1>
          <p className="text-muted-foreground">
            Gerencie suas tarefas de prospecção
          </p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" onClick={() => navigate('/leads')}>
            <Plus className="mr-2 h-4 w-4" />
            Associar Cadência a Lead
          </Button>
          <Button 
            onClick={() => setShowForm(!showForm)}
            className="bg-gradient-to-r from-emerald-600 to-emerald-700 hover:from-emerald-700 hover:to-emerald-800 text-white shadow-md hover:shadow-lg transition-all duration-200"
          >
            <Plus className="mr-2 h-4 w-4" />
            Nova Tarefa
          </Button>
        </div>
      </div>

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
                <Input
                  type="text"
                  value={formData.title}
                  onChange={(e) => setFormData({ ...formData, title: e.target.value })}
                  placeholder="Ex: Enviar email de apresentação"
                  required
                />
              </div>
              <div>
                <label className="block text-sm font-medium mb-1">Descrição</label>
                <Textarea
                  value={formData.description}
                  onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                  placeholder="Descreva a tarefa..."
                  rows={3}
                />
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
              <div className="flex gap-2 pt-4">
                <Button 
                  type="submit"
                  className="bg-gradient-to-r from-emerald-600 to-emerald-700 hover:from-emerald-700 hover:to-emerald-800 text-white shadow-md hover:shadow-lg transition-all duration-200"
                >
                  Criar Tarefa
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  className="border-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800"
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
          <div className="flex items-center justify-between">
            <CardTitle className="text-emerald-900 dark:text-emerald-100">Filtros</CardTitle>
            <div className="flex items-center gap-2">
              <label className="text-sm font-medium">Itens por página:</label>
              <select
                value={pageSize}
                onChange={(e) => {
                  const newPageSize = Number(e.target.value)
                  setPageSize(newPageSize)
                  setCurrentPage(1)
                }}
                className="px-3 py-1.5 border rounded-md text-sm bg-background"
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
                    className="flex items-center justify-between p-3 rounded-lg bg-red-50 border border-red-200 dark:bg-red-950 dark:border-red-800 cursor-pointer hover:bg-red-100 dark:hover:bg-red-900 transition-colors"
                    onClick={() => handleOpenTaskDetail(task)}
                  >
                    <div className="flex-1">
                      <div className="flex items-center gap-2">
                        {getTypeIcon(task.type)}
                        <span className="font-medium">{task.title}</span>
                        <span className="text-xs px-2 py-1 rounded bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200">
                          {task.type}
                        </span>
                      </div>
                      {task.lead && (
                        <p className="text-sm text-muted-foreground mt-1">
                          {task.lead.name}
                          {task.lead.company && ` - ${task.lead.company}`}
                        </p>
                      )}
                      {task.owner && (
                        <p className="text-xs text-muted-foreground mt-1 flex items-center gap-1">
                          <User className="h-3 w-3" />
                          Responsável: {task.owner.full_name}
                        </p>
                      )}
                      {task.owner_id && !task.owner && (
                        <p className="text-xs text-muted-foreground mt-1 flex items-center gap-1">
                          <User className="h-3 w-3" />
                          Responsável: {users.find(u => u.id === task.owner_id)?.full_name || `ID: ${task.owner_id}`}
                        </p>
                      )}
                      <p className="text-xs text-red-600 dark:text-red-400 mt-1">
                        Vencida em {formatDate(dueDate)}
                      </p>
                    </div>
                    <div className="flex gap-2" onClick={(e) => e.stopPropagation()}>
                      <Button
                        size="sm"
                        onClick={() => handleStatusChange(task.id, 'completed')}
                      >
                        <CheckCircle2 className="h-4 w-4 mr-1" />
                        Concluir
                      </Button>
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => navigate(`/leads`)}
                      >
                        Ver Lead
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
                    className={`flex items-center justify-between p-3 rounded-lg border cursor-pointer hover:opacity-90 transition-colors ${
                      isToday
                        ? 'bg-yellow-50 border-yellow-200 dark:bg-yellow-950 dark:border-yellow-800 hover:bg-yellow-100 dark:hover:bg-yellow-900'
                        : 'bg-gray-50 border-gray-200 dark:bg-gray-900 dark:border-gray-800 hover:bg-gray-100 dark:hover:bg-gray-800'
                    }`}
                    onClick={() => handleOpenTaskDetail(task)}
                  >
                    <div className="flex-1">
                      <div className="flex items-center gap-2">
                        {getTypeIcon(task.type)}
                        <span className="font-medium">{task.title}</span>
                        <span className="text-xs px-2 py-1 rounded bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200">
                          {task.type}
                        </span>
                      </div>
                      {task.lead && (
                        <p className="text-sm text-muted-foreground mt-1">
                          {task.lead.name}
                          {task.lead.company && ` - ${task.lead.company}`}
                        </p>
                      )}
                      {task.owner && (
                        <p className="text-xs text-muted-foreground mt-1 flex items-center gap-1">
                          <User className="h-3 w-3" />
                          Responsável: {task.owner.full_name}
                        </p>
                      )}
                      {task.owner_id && !task.owner && (
                        <p className="text-xs text-muted-foreground mt-1 flex items-center gap-1">
                          <User className="h-3 w-3" />
                          Responsável: {users.find(u => u.id === task.owner_id)?.full_name || `ID: ${task.owner_id}`}
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
                    <div className="flex gap-2" onClick={(e) => e.stopPropagation()}>
                      <Button
                        size="sm"
                        onClick={() => handleStatusChange(task.id, 'in_progress')}
                        variant="outline"
                      >
                        Iniciar
                      </Button>
                      <Button
                        size="sm"
                        onClick={() => handleStatusChange(task.id, 'completed')}
                      >
                        <CheckCircle2 className="h-4 w-4 mr-1" />
                        Concluir
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
                  className="flex items-center justify-between p-2 rounded-lg bg-gray-50 border border-gray-200 dark:bg-gray-900 dark:border-gray-800 cursor-pointer hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors"
                  onClick={() => handleOpenTaskDetail(task)}
                >
                  <div className="flex items-center gap-2">
                    <CheckCircle2 className="h-4 w-4 text-green-500" />
                    <span className="text-sm line-through text-muted-foreground">{task.title}</span>
                    {task.lead && (
                      <span className="text-xs text-muted-foreground">
                        - {task.lead.name}
                      </span>
                    )}
                    {task.owner && (
                      <span className="text-xs text-muted-foreground flex items-center gap-1">
                        <User className="h-3 w-3" />
                        {task.owner.full_name}
                      </span>
                    )}
                    {task.owner_id && !task.owner && (
                      <span className="text-xs text-muted-foreground flex items-center gap-1">
                        <User className="h-3 w-3" />
                        {users.find(u => u.id === task.owner_id)?.full_name || `ID: ${task.owner_id}`}
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
          <div className="flex items-center justify-between flex-wrap gap-4">
            <div className="flex items-center gap-4">
              {totalTasks > 0 ? (
                <span className="text-sm text-muted-foreground">
                  Mostrando {((currentPage - 1) * pageSize) + 1} a {Math.min(currentPage * pageSize, totalTasks)} de {totalTasks} tarefas
                </span>
              ) : (
                <span className="text-sm text-muted-foreground">
                  {tasks.length > 0 ? `Mostrando ${tasks.length} tarefa(s)` : 'Nenhuma tarefa encontrada'}
                </span>
              )}
              <div className="flex items-center gap-2">
                <label className="text-sm font-medium">Itens por página:</label>
                <select
                  value={pageSize}
                  onChange={(e) => {
                    const newPageSize = Number(e.target.value)
                    setPageSize(newPageSize)
                    setCurrentPage(1)
                  }}
                  className="px-3 py-1.5 border rounded-md text-sm bg-background min-w-[80px]"
                >
                  <option value={10}>10</option>
                  <option value={20}>20</option>
                  <option value={50}>50</option>
                  <option value={100}>100</option>
                </select>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={() => setCurrentPage(1)}
                disabled={currentPage === 1 || totalTasks === 0}
              >
                Primeira
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={() => setCurrentPage(p => Math.max(1, p - 1))}
                disabled={currentPage === 1 || totalTasks === 0}
              >
                Anterior
              </Button>
              <span className="text-sm px-3 font-medium">
                Página {currentPage} de {totalPages > 0 ? totalPages : 1}
              </span>
              <Button
                variant="outline"
                size="sm"
                onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))}
                disabled={currentPage >= totalPages || totalTasks === 0}
              >
                Próxima
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={() => setCurrentPage(totalPages)}
                disabled={currentPage >= totalPages || totalTasks === 0}
              >
                Última
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
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
          <Card className="w-full max-w-4xl h-[90vh] overflow-hidden flex flex-col">
            <CardHeader className="border-b flex-shrink-0">
              <div className="flex items-center justify-between">
                <CardTitle className="text-2xl">Detalhes da Tarefa</CardTitle>
                <div className="flex items-center gap-2">
                  {!editingTask && (
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => setEditingTask(true)}
                    >
                      <Edit className="h-4 w-4 mr-2" />
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
                  >
                    <XCircle className="h-5 w-5" />
                  </Button>
                </div>
              </div>
            </CardHeader>
            
            {/* Abas */}
            <div className="border-b px-6 flex-shrink-0">
              <div className="flex gap-1 overflow-x-auto">
                <button
                  onClick={() => setActiveTab('basicas')}
                  className={`px-4 py-3 text-sm font-medium border-b-2 transition-colors whitespace-nowrap ${
                    activeTab === 'basicas'
                      ? 'border-primary text-primary'
                      : 'border-transparent text-muted-foreground hover:text-foreground'
                  }`}
                >
                  Informações Básicas
                </button>
                <button
                  onClick={() => setActiveTab('comentarios')}
                  className={`px-4 py-3 text-sm font-medium border-b-2 transition-colors whitespace-nowrap ${
                    activeTab === 'comentarios'
                      ? 'border-primary text-primary'
                      : 'border-transparent text-muted-foreground hover:text-foreground'
                  }`}
                >
                  Comentários
                </button>
              </div>
            </div>

            <CardContent className="flex-1 overflow-y-auto p-6">
              {/* Aba: Informações Básicas */}
              {activeTab === 'basicas' && (
                <div className="space-y-4">
                  {editingTask ? (
                    <div className="space-y-4">
                      <div>
                        <label className="block text-sm font-medium mb-1">Título *</label>
                        <Input
                          value={editFormData.title}
                          onChange={(e) => setEditFormData({ ...editFormData, title: e.target.value })}
                          required
                        />
                      </div>
                      <div>
                        <label className="block text-sm font-medium mb-1">Descrição</label>
                        <Textarea
                          value={editFormData.description}
                          onChange={(e) => setEditFormData({ ...editFormData, description: e.target.value })}
                          rows={4}
                        />
                      </div>
                      <div className="grid gap-4 md:grid-cols-2">
                        <div>
                          <label className="block text-sm font-medium mb-1">Status *</label>
                          <select
                            value={editFormData.status}
                            onChange={(e) => setEditFormData({ ...editFormData, status: e.target.value })}
                            className="w-full px-3 py-2 border rounded-md"
                            required
                          >
                            <option value="pending">Pendente</option>
                            <option value="in_progress">Em Progresso</option>
                            <option value="completed">Concluída</option>
                            <option value="cancelled">Cancelada</option>
                          </select>
                        </div>
                        <div>
                          <label className="block text-sm font-medium mb-1">Responsável</label>
                          <select
                            value={editFormData.owner_id || ''}
                            onChange={(e) => setEditFormData({ ...editFormData, owner_id: e.target.value ? Number(e.target.value) : null })}
                            className="w-full px-3 py-2 border rounded-md"
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
                          <label className="block text-sm font-medium mb-1">Data de Vencimento *</label>
                          <Input
                            type="date"
                            value={editFormData.due_date}
                            onChange={(e) => setEditFormData({ ...editFormData, due_date: e.target.value })}
                            required
                          />
                        </div>
                        <div>
                          <label className="block text-sm font-medium mb-1">Horário</label>
                          <Input
                            type="time"
                            value={editFormData.due_time}
                            onChange={(e) => setEditFormData({ ...editFormData, due_time: e.target.value })}
                          />
                        </div>
                      </div>
                      <div>
                        <label className="block text-sm font-medium mb-1">Notas</label>
                        <Textarea
                          value={editFormData.notes}
                          onChange={(e) => setEditFormData({ ...editFormData, notes: e.target.value })}
                          rows={3}
                        />
                      </div>
                      <div className="flex gap-2 pt-4">
                        <Button onClick={handleUpdateTask}>
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
                        >
                          Cancelar
                        </Button>
                      </div>
                    </div>
                  ) : (
                    <>
                      <div className="grid gap-4 md:grid-cols-2">
                        <div>
                          <label className="text-sm font-medium text-muted-foreground">Título</label>
                          <p className="text-base font-medium mt-1">{selectedTaskDetail.title}</p>
                        </div>
                        <div>
                          <label className="text-sm font-medium text-muted-foreground">Status</label>
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
                          <label className="text-sm font-medium text-muted-foreground">Tipo</label>
                          <p className="text-base mt-1 flex items-center gap-2">
                            {getTypeIcon(selectedTaskDetail.type)}
                            <span className="capitalize">{selectedTaskDetail.type}</span>
                          </p>
                        </div>
                        <div>
                          <label className="text-sm font-medium text-muted-foreground">Data de Vencimento</label>
                          <p className="text-base mt-1 flex items-center gap-2">
                            <Calendar className="h-4 w-4" />
                            {formatDate(new Date(selectedTaskDetail.due_date))}
                          </p>
                        </div>
                        {selectedTaskDetail.owner && (
                          <div>
                            <label className="text-sm font-medium text-muted-foreground">Responsável</label>
                            <p className="text-base mt-1 flex items-center gap-2">
                              <User className="h-4 w-4" />
                              {selectedTaskDetail.owner.full_name}
                            </p>
                          </div>
                        )}
                        {selectedTaskDetail.lead && (
                          <div>
                            <label className="text-sm font-medium text-muted-foreground">Lead</label>
                            <p className="text-base mt-1">{selectedTaskDetail.lead.name}</p>
                            {selectedTaskDetail.lead.company && (
                              <p className="text-sm text-muted-foreground">{selectedTaskDetail.lead.company}</p>
                            )}
                          </div>
                        )}
                        {selectedTaskDetail.completed_at && (
                          <div>
                            <label className="text-sm font-medium text-muted-foreground">Concluída em</label>
                            <p className="text-base mt-1 flex items-center gap-2">
                              <Calendar className="h-4 w-4" />
                              {formatDate(new Date(selectedTaskDetail.completed_at))}
                            </p>
                          </div>
                        )}
                      </div>
                      {selectedTaskDetail.description && (
                        <div className="mt-4">
                          <label className="text-sm font-medium text-muted-foreground">Descrição</label>
                          <p className="text-base mt-1 whitespace-pre-wrap">{selectedTaskDetail.description}</p>
                        </div>
                      )}
                      {selectedTaskDetail.notes && (
                        <div className="mt-4">
                          <label className="text-sm font-medium text-muted-foreground">Notas</label>
                          <div className="mt-1 p-4 bg-gray-50 dark:bg-gray-900 rounded-lg">
                            <p className="text-base whitespace-pre-wrap">{selectedTaskDetail.notes}</p>
                          </div>
                        </div>
                      )}
                    </>
                  )}
                </div>
              )}

              {/* Aba: Comentários */}
              {activeTab === 'comentarios' && (
                <div className="space-y-6">
                  <div>
                    <h3 className="text-lg font-semibold mb-4">Comentários</h3>
                    
                    {/* Formulário para adicionar comentário */}
                    <div className="mb-4 space-y-2">
                      <Textarea
                        placeholder="Adicione um comentário sobre esta tarefa..."
                        value={newComment}
                        onChange={(e) => setNewComment(e.target.value)}
                        rows={3}
                        className="w-full"
                      />
                      <div className="flex justify-end">
                        <Button
                          onClick={handleAddComment}
                          disabled={!newComment.trim() || addingComment}
                          size="sm"
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
    </div>
  )
}

