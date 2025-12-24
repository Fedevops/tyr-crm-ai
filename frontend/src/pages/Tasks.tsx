import { useState, useEffect } from 'react'
import { useTranslation } from 'react-i18next'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import api from '@/lib/api'
import { Plus, CheckCircle2, Clock, AlertCircle, Mail, Phone, Link as LinkIcon, Calendar, Search, X } from 'lucide-react'
import { useNavigate } from 'react-router-dom'

interface Task {
  id: number
  lead_id: number
  sequence_id: number | null
  assigned_to: number | null
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
    due_time: '09:00'
  })

  useEffect(() => {
    fetchTasks()
    fetchLeads()
  }, [statusFilter, typeFilter, currentPage, pageSize, searchTerm])

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
        due_date: dueDateTime.toISOString()
      }

      await api.post('/api/tasks', taskData)
      
      // Reset form
      setFormData({
        lead_id: '',
        type: 'email',
        title: '',
        description: '',
        due_date: '',
        due_time: '09:00'
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
                    className="flex items-center justify-between p-3 rounded-lg bg-red-50 border border-red-200 dark:bg-red-950 dark:border-red-800"
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
                      <p className="text-xs text-red-600 dark:text-red-400 mt-1">
                        Vencida em {formatDate(dueDate)}
                      </p>
                    </div>
                    <div className="flex gap-2">
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
                    className={`flex items-center justify-between p-3 rounded-lg border ${
                      isToday
                        ? 'bg-yellow-50 border-yellow-200 dark:bg-yellow-950 dark:border-yellow-800'
                        : 'bg-gray-50 border-gray-200 dark:bg-gray-900 dark:border-gray-800'
                    }`}
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
                      <p className={`text-xs mt-1 ${
                        isToday
                          ? 'text-yellow-600 dark:text-yellow-400 font-medium'
                          : 'text-muted-foreground'
                      }`}>
                        {isToday ? 'Hoje' : formatDate(dueDate)}
                      </p>
                    </div>
                    <div className="flex gap-2">
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
                  className="flex items-center justify-between p-2 rounded-lg bg-gray-50 border border-gray-200 dark:bg-gray-900 dark:border-gray-800"
                >
                  <div className="flex items-center gap-2">
                    <CheckCircle2 className="h-4 w-4 text-green-500" />
                    <span className="text-sm line-through text-muted-foreground">{task.title}</span>
                    {task.lead && (
                      <span className="text-xs text-muted-foreground">
                        - {task.lead.name}
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
    </div>
  )
}

