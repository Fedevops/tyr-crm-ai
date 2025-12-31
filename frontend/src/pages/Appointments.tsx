import { useState, useEffect } from 'react'
import { useTranslation } from 'react-i18next'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import api from '@/lib/api'
import { Plus, Calendar, Clock, CheckCircle2, XCircle, Search, X, Edit, Trash2, MapPin, Link as LinkIcon, ChevronLeft, ChevronRight, List, Grid } from 'lucide-react'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'

interface Appointment {
  id: number
  lead_id: number
  title: string
  description: string | null
  scheduled_at: string
  duration_minutes: number
  location: string | null
  meeting_url: string | null
  status: 'scheduled' | 'completed' | 'cancelled' | 'rescheduled' | 'no_show'
  notes: string | null
  outcome: string | null
  completed_at: string | null
  cancelled_at: string | null
  owner_id: number | null
  created_by_id: number | null
  lead_name?: string
  lead_company?: string
}

interface Lead {
  id: number
  name: string
  company: string | null
  email: string
}

const formatDateTime = (dateString: string) => {
  const date = new Date(dateString)
  const day = date.getDate().toString().padStart(2, '0')
  const month = (date.getMonth() + 1).toString().padStart(2, '0')
  const year = date.getFullYear()
  const hours = date.getHours().toString().padStart(2, '0')
  const minutes = date.getMinutes().toString().padStart(2, '0')
  return `${day}/${month}/${year} às ${hours}:${minutes}`
}

const getStatusColor = (status: string) => {
  switch (status) {
    case 'scheduled':
      return 'bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200'
    case 'completed':
      return 'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200'
    case 'cancelled':
      return 'bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200'
    case 'rescheduled':
      return 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-200'
    case 'no_show':
      return 'bg-gray-100 text-gray-800 dark:bg-gray-900 dark:text-gray-200'
    default:
      return 'bg-gray-100 text-gray-800 dark:bg-gray-900 dark:text-gray-200'
  }
}

const getStatusLabel = (status: string) => {
  switch (status) {
    case 'scheduled':
      return 'Agendada'
    case 'completed':
      return 'Completada'
    case 'cancelled':
      return 'Cancelada'
    case 'rescheduled':
      return 'Reagendada'
    case 'no_show':
      return 'Não Compareceu'
    default:
      return status
  }
}

export function Appointments() {
  const { t } = useTranslation()
  const [appointments, setAppointments] = useState<Appointment[]>([])
  const [loading, setLoading] = useState(true)
  const [statusFilter, setStatusFilter] = useState<string>('all')
  const [searchTerm, setSearchTerm] = useState('')
  const [showForm, setShowForm] = useState(false)
  const [showEditModal, setShowEditModal] = useState(false)
  const [editingAppointment, setEditingAppointment] = useState<Appointment | null>(null)
  const [leads, setLeads] = useState<Lead[]>([])
  const [viewMode, setViewMode] = useState<'list' | 'calendar'>('list')
  const [currentMonth, setCurrentMonth] = useState(new Date())
  const [stats, setStats] = useState({
    total_scheduled: 0,
    total_completed: 0,
    total_cancelled: 0,
    upcoming: [] as Appointment[]
  })

  const [formData, setFormData] = useState({
    lead_id: '',
    title: '',
    description: '',
    scheduled_at: '',
    scheduled_time: '09:00',
    duration_minutes: 30,
    location: '',
    meeting_url: '',
    notes: ''
  })

  useEffect(() => {
    fetchLeads()
    fetchAppointments()
    fetchStats()
  }, [statusFilter])

  const fetchLeads = async () => {
    try {
      const response = await api.get('/api/leads?limit=1000')
      setLeads(response.data || [])
    } catch (error) {
      console.error('Error fetching leads:', error)
    }
  }

  const fetchAppointments = async () => {
    try {
      setLoading(true)
      const params: any = {}
      if (statusFilter !== 'all') {
        params.status_filter = statusFilter
      }
      const response = await api.get('/api/appointments', { params })
      setAppointments(response.data || [])
    } catch (error) {
      console.error('Error fetching appointments:', error)
    } finally {
      setLoading(false)
    }
  }

  const fetchStats = async () => {
    try {
      const response = await api.get('/api/appointments/stats/summary')
      setStats(response.data || { total_scheduled: 0, total_completed: 0, total_cancelled: 0, upcoming: [] })
    } catch (error) {
      console.error('Error fetching stats:', error)
    }
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    
    if (!formData.lead_id || !formData.title || !formData.scheduled_at) {
      alert('Por favor, preencha todos os campos obrigatórios.')
      return
    }

    try {
      const scheduledDateTime = new Date(`${formData.scheduled_at}T${formData.scheduled_time}`)
      
      const appointmentData = {
        lead_id: parseInt(formData.lead_id),
        title: formData.title,
        description: formData.description || null,
        scheduled_at: scheduledDateTime.toISOString(),
        duration_minutes: formData.duration_minutes,
        location: formData.location || null,
        meeting_url: formData.meeting_url || null,
        notes: formData.notes || null
      }

      if (editingAppointment) {
        await api.put(`/api/appointments/${editingAppointment.id}`, appointmentData)
      } else {
        await api.post('/api/appointments', appointmentData)
      }
      
      // Reset form
      setFormData({
        lead_id: '',
        title: '',
        description: '',
        scheduled_at: '',
        scheduled_time: '09:00',
        duration_minutes: 30,
        location: '',
        meeting_url: '',
        notes: ''
      })
      setShowForm(false)
      setShowEditModal(false)
      setEditingAppointment(null)
      fetchAppointments()
      fetchStats()
    } catch (error: any) {
      console.error('Error saving appointment:', error)
      alert(error.response?.data?.detail || 'Erro ao salvar agendamento')
    }
  }

  const handleEdit = (appointment: Appointment) => {
    setEditingAppointment(appointment)
    const scheduledDate = new Date(appointment.scheduled_at)
    const dateStr = scheduledDate.toISOString().split('T')[0]
    const timeStr = scheduledDate.toTimeString().slice(0, 5)
    
    setFormData({
      lead_id: appointment.lead_id.toString(),
      title: appointment.title,
      description: appointment.description || '',
      scheduled_at: dateStr,
      scheduled_time: timeStr,
      duration_minutes: appointment.duration_minutes,
      location: appointment.location || '',
      meeting_url: appointment.meeting_url || '',
      notes: appointment.notes || ''
    })
    setShowEditModal(true)
  }

  const handleDelete = async (id: number) => {
    if (!confirm('Tem certeza que deseja deletar este agendamento?')) return
    
    try {
      await api.delete(`/api/appointments/${id}`)
      fetchAppointments()
      fetchStats()
    } catch (error: any) {
      console.error('Error deleting appointment:', error)
      alert(error.response?.data?.detail || 'Erro ao deletar agendamento')
    }
  }

  const handleStatusChange = async (id: number, newStatus: string) => {
    try {
      await api.put(`/api/appointments/${id}`, { status: newStatus })
      fetchAppointments()
      fetchStats()
    } catch (error: any) {
      console.error('Error updating status:', error)
      alert(error.response?.data?.detail || 'Erro ao atualizar status')
    }
  }

  const filteredAppointments = appointments.filter(apt => {
    if (searchTerm) {
      const searchLower = searchTerm.toLowerCase()
      return (
        apt.title.toLowerCase().includes(searchLower) ||
        apt.lead_name?.toLowerCase().includes(searchLower) ||
        apt.lead_company?.toLowerCase().includes(searchLower)
      )
    }
    return true
  })

  const upcomingAppointments = filteredAppointments.filter(apt => {
    const scheduledDate = new Date(apt.scheduled_at)
    return scheduledDate >= new Date() && apt.status === 'scheduled'
  }).sort((a, b) => new Date(a.scheduled_at).getTime() - new Date(b.scheduled_at).getTime())

  const pastAppointments = filteredAppointments.filter(apt => {
    const scheduledDate = new Date(apt.scheduled_at)
    return scheduledDate < new Date() || apt.status !== 'scheduled'
  }).sort((a, b) => new Date(b.scheduled_at).getTime() - new Date(a.scheduled_at).getTime())

  // Funções para o calendário
  const getDaysInMonth = (date: Date) => {
    const year = date.getFullYear()
    const month = date.getMonth()
    const firstDay = new Date(year, month, 1)
    const lastDay = new Date(year, month + 1, 0)
    const daysInMonth = lastDay.getDate()
    const startingDayOfWeek = firstDay.getDay()
    
    const days: Array<{ date: Date; appointments: Appointment[] }> = []
    
    // Dias do mês anterior (para preencher a primeira semana)
    const prevMonth = new Date(year, month - 1, 0)
    for (let i = startingDayOfWeek - 1; i >= 0; i--) {
      const dayDate = new Date(year, month - 1, prevMonth.getDate() - i)
      days.push({ date: dayDate, appointments: [] })
    }
    
    // Dias do mês atual
    for (let day = 1; day <= daysInMonth; day++) {
      const dayDate = new Date(year, month, day)
      const dayStart = new Date(year, month, day, 0, 0, 0, 0)
      const dayEnd = new Date(year, month, day, 23, 59, 59, 999)
      
      const dayAppointments = filteredAppointments.filter(apt => {
        const aptDate = new Date(apt.scheduled_at)
        return aptDate >= dayStart && aptDate <= dayEnd
      })
      
      days.push({ date: new Date(year, month, day), appointments: dayAppointments })
    }
    
    // Dias do próximo mês (para completar a última semana)
    const remainingDays = 42 - days.length // 6 semanas * 7 dias = 42
    for (let day = 1; day <= remainingDays; day++) {
      const dayDate = new Date(year, month + 1, day)
      days.push({ date: dayDate, appointments: [] })
    }
    
    return days
  }

  const getAppointmentsForDate = (date: Date) => {
    const dateStr = date.toISOString().split('T')[0]
    return filteredAppointments.filter(apt => {
      const aptDate = new Date(apt.scheduled_at).toISOString().split('T')[0]
      return aptDate === dateStr
    })
  }

  const navigateMonth = (direction: 'prev' | 'next') => {
    setCurrentMonth(prev => {
      const newDate = new Date(prev)
      if (direction === 'prev') {
        newDate.setMonth(prev.getMonth() - 1)
      } else {
        newDate.setMonth(prev.getMonth() + 1)
      }
      return newDate
    })
  }

  const isToday = (date: Date) => {
    const today = new Date()
    return date.toDateString() === today.toDateString()
  }

  const isCurrentMonth = (date: Date) => {
    return date.getMonth() === currentMonth.getMonth() && date.getFullYear() === currentMonth.getFullYear()
  }

  if (loading) {
    return <div className="flex-1 space-y-6 p-6">Carregando...</div>
  }

  return (
    <div className="flex-1 space-y-6 p-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold">Agendamentos</h1>
          <p className="text-muted-foreground">
            Gerencie suas reuniões com leads
          </p>
        </div>
        <Button 
          onClick={() => {
            setEditingAppointment(null)
            setShowForm(true)
          }}
          className="bg-gradient-to-r from-blue-600 to-blue-700 hover:from-blue-700 hover:to-blue-800 text-white"
        >
          <Plus className="mr-2 h-4 w-4" />
          Novo Agendamento
        </Button>
      </div>

      {/* Estatísticas */}
      <div className="grid gap-4 md:grid-cols-4">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Agendadas</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{stats.total_scheduled}</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Completadas</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-green-600">{stats.total_completed}</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Canceladas</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-red-600">{stats.total_cancelled}</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Próximas</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-blue-600">{stats.upcoming.length}</div>
          </CardContent>
        </Card>
      </div>

      {/* Filtros e Modo de Visualização */}
      <div className="flex gap-4 items-center">
        <div className="flex-1">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Buscar por título, lead ou empresa..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="pl-10"
            />
          </div>
        </div>
        <Select value={statusFilter} onValueChange={setStatusFilter}>
          <SelectTrigger className="w-[180px]">
            <SelectValue placeholder="Filtrar por status" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Todos</SelectItem>
            <SelectItem value="scheduled">Agendadas</SelectItem>
            <SelectItem value="completed">Completadas</SelectItem>
            <SelectItem value="cancelled">Canceladas</SelectItem>
            <SelectItem value="rescheduled">Reagendadas</SelectItem>
            <SelectItem value="no_show">Não Compareceu</SelectItem>
          </SelectContent>
        </Select>
        <div className="flex gap-2 border rounded-md">
          <Button
            variant={viewMode === 'list' ? 'default' : 'ghost'}
            size="sm"
            onClick={() => setViewMode('list')}
            className="rounded-r-none"
          >
            <List className="h-4 w-4" />
          </Button>
          <Button
            variant={viewMode === 'calendar' ? 'default' : 'ghost'}
            size="sm"
            onClick={() => setViewMode('calendar')}
            className="rounded-l-none"
          >
            <Grid className="h-4 w-4" />
          </Button>
        </div>
      </div>

      {/* Formulário de Novo Agendamento */}
      {showForm && (
        <Card className="border-t-4 border-t-blue-500">
          <CardHeader>
            <div className="flex items-center justify-between">
              <CardTitle>Novo Agendamento</CardTitle>
              <Button variant="ghost" size="sm" onClick={() => setShowForm(false)}>
                <X className="h-4 w-4" />
              </Button>
            </div>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleSubmit} className="space-y-4">
              <div className="grid gap-4 md:grid-cols-2">
                <div>
                  <label className="block text-sm font-medium mb-1">Lead *</label>
                  <Select
                    value={formData.lead_id}
                    onValueChange={(value) => setFormData({ ...formData, lead_id: value })}
                    required
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Selecione um lead" />
                    </SelectTrigger>
                    <SelectContent>
                      {leads.map((lead) => (
                        <SelectItem key={lead.id} value={lead.id.toString()}>
                          {lead.name} {lead.company ? `- ${lead.company}` : ''}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <label className="block text-sm font-medium mb-1">Título *</label>
                  <Input
                    value={formData.title}
                    onChange={(e) => setFormData({ ...formData, title: e.target.value })}
                    placeholder="Ex: Reunião de apresentação"
                    required
                  />
                </div>
              </div>
              <div>
                <label className="block text-sm font-medium mb-1">Descrição</label>
                <Textarea
                  value={formData.description}
                  onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                  placeholder="Descrição da reunião..."
                  rows={3}
                />
              </div>
              <div className="grid gap-4 md:grid-cols-3">
                <div>
                  <label className="block text-sm font-medium mb-1">Data *</label>
                  <Input
                    type="date"
                    value={formData.scheduled_at}
                    onChange={(e) => setFormData({ ...formData, scheduled_at: e.target.value })}
                    required
                    min={new Date().toISOString().split('T')[0]}
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium mb-1">Horário *</label>
                  <Input
                    type="time"
                    value={formData.scheduled_time}
                    onChange={(e) => setFormData({ ...formData, scheduled_time: e.target.value })}
                    required
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium mb-1">Duração (minutos)</label>
                  <Input
                    type="number"
                    value={formData.duration_minutes}
                    onChange={(e) => setFormData({ ...formData, duration_minutes: parseInt(e.target.value) || 30 })}
                    min={15}
                    step={15}
                  />
                </div>
              </div>
              <div className="grid gap-4 md:grid-cols-2">
                <div>
                  <label className="block text-sm font-medium mb-1">Local</label>
                  <Input
                    value={formData.location}
                    onChange={(e) => setFormData({ ...formData, location: e.target.value })}
                    placeholder="Ex: Escritório, Online, Endereço..."
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium mb-1">URL da Reunião</label>
                  <Input
                    value={formData.meeting_url}
                    onChange={(e) => setFormData({ ...formData, meeting_url: e.target.value })}
                    placeholder="Ex: https://meet.google.com/..."
                  />
                </div>
              </div>
              <div className="flex gap-2">
                <Button type="submit" className="bg-blue-600 hover:bg-blue-700">
                  {editingAppointment ? 'Atualizar' : 'Criar'} Agendamento
                </Button>
                <Button type="button" variant="outline" onClick={() => setShowForm(false)}>
                  Cancelar
                </Button>
              </div>
            </form>
          </CardContent>
        </Card>
      )}

      {/* Modal de Edição */}
      <Dialog open={showEditModal} onOpenChange={setShowEditModal}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Editar Agendamento</DialogTitle>
            <DialogDescription>
              Atualize as informações do agendamento
            </DialogDescription>
          </DialogHeader>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="grid gap-4 md:grid-cols-2">
              <div>
                <label className="block text-sm font-medium mb-1">Lead *</label>
                <Select
                  value={formData.lead_id}
                  onValueChange={(value) => setFormData({ ...formData, lead_id: value })}
                  required
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Selecione um lead" />
                  </SelectTrigger>
                  <SelectContent>
                    {leads.map((lead) => (
                      <SelectItem key={lead.id} value={lead.id.toString()}>
                        {lead.name} {lead.company ? `- ${lead.company}` : ''}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <label className="block text-sm font-medium mb-1">Título *</label>
                <Input
                  value={formData.title}
                  onChange={(e) => setFormData({ ...formData, title: e.target.value })}
                  required
                />
              </div>
            </div>
            <div>
              <label className="block text-sm font-medium mb-1">Descrição</label>
              <Textarea
                value={formData.description}
                onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                rows={3}
              />
            </div>
            <div className="grid gap-4 md:grid-cols-3">
              <div>
                <label className="block text-sm font-medium mb-1">Data *</label>
                <Input
                  type="date"
                  value={formData.scheduled_at}
                  onChange={(e) => setFormData({ ...formData, scheduled_at: e.target.value })}
                  required
                />
              </div>
              <div>
                <label className="block text-sm font-medium mb-1">Horário *</label>
                <Input
                  type="time"
                  value={formData.scheduled_time}
                  onChange={(e) => setFormData({ ...formData, scheduled_time: e.target.value })}
                  required
                />
              </div>
              <div>
                <label className="block text-sm font-medium mb-1">Duração (minutos)</label>
                <Input
                  type="number"
                  value={formData.duration_minutes}
                  onChange={(e) => setFormData({ ...formData, duration_minutes: parseInt(e.target.value) || 30 })}
                  min={15}
                  step={15}
                />
              </div>
            </div>
            <div className="grid gap-4 md:grid-cols-2">
              <div>
                <label className="block text-sm font-medium mb-1">Local</label>
                <Input
                  value={formData.location}
                  onChange={(e) => setFormData({ ...formData, location: e.target.value })}
                />
              </div>
              <div>
                <label className="block text-sm font-medium mb-1">URL da Reunião</label>
                <Input
                  value={formData.meeting_url}
                  onChange={(e) => setFormData({ ...formData, meeting_url: e.target.value })}
                />
              </div>
            </div>
            {editingAppointment && (
              <div>
                <label className="block text-sm font-medium mb-1">Status</label>
                <Select
                  value={editingAppointment.status}
                  onValueChange={(value) => handleStatusChange(editingAppointment.id, value)}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="scheduled">Agendada</SelectItem>
                    <SelectItem value="completed">Completada</SelectItem>
                    <SelectItem value="cancelled">Cancelada</SelectItem>
                    <SelectItem value="rescheduled">Reagendada</SelectItem>
                    <SelectItem value="no_show">Não Compareceu</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            )}
            <DialogFooter>
              <Button type="submit">Atualizar</Button>
              <Button type="button" variant="outline" onClick={() => setShowEditModal(false)}>
                Cancelar
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* Visualização de Calendário ou Lista */}
      {viewMode === 'calendar' ? (
        <Card>
          <CardHeader>
            <div className="flex items-center justify-between">
              <CardTitle className="capitalize">
                {currentMonth.toLocaleDateString('pt-BR', { month: 'long', year: 'numeric' })}
              </CardTitle>
              <div className="flex items-center gap-2">
                <Button variant="outline" size="sm" onClick={() => navigateMonth('prev')}>
                  <ChevronLeft className="h-4 w-4" />
                </Button>
                <Button variant="outline" size="sm" onClick={() => setCurrentMonth(new Date())}>
                  Hoje
                </Button>
                <Button variant="outline" size="sm" onClick={() => navigateMonth('next')}>
                  <ChevronRight className="h-4 w-4" />
                </Button>
              </div>
            </div>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-7 gap-1">
              {/* Cabeçalho dos dias da semana */}
              {['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb'].map((day, idx) => (
                <div key={idx} className="p-2 text-center text-sm font-medium text-muted-foreground">
                  {day}
                </div>
              ))}
              
              {/* Dias do calendário */}
              {getDaysInMonth(currentMonth).map((dayData, idx) => {
                const { date, appointments } = dayData
                const isCurrentMonthDay = isCurrentMonth(date)
                const isTodayDay = isToday(date)
                const dayAppointments = getAppointmentsForDate(date)
                const scheduledCount = dayAppointments.filter(a => a.status === 'scheduled').length
                const completedCount = dayAppointments.filter(a => a.status === 'completed').length
                const cancelledCount = dayAppointments.filter(a => a.status === 'cancelled').length
                const totalCount = dayAppointments.length
                
                return (
                  <div
                    key={idx}
                    className={`
                      min-h-[80px] p-1 border rounded-md
                      ${isCurrentMonthDay ? 'bg-background' : 'bg-muted/30'}
                      ${isTodayDay ? 'ring-2 ring-blue-500' : ''}
                      ${totalCount > 0 ? 'hover:bg-accent cursor-pointer' : ''}
                      transition-colors
                    `}
                  >
                    <div className={`text-sm font-medium mb-1 ${isCurrentMonthDay ? 'text-foreground' : 'text-muted-foreground'}`}>
                      {date.getDate()}
                    </div>
                    <div className="space-y-1">
                      {scheduledCount > 0 && (
                        <div className="text-xs bg-blue-100 dark:bg-blue-900 text-blue-800 dark:text-blue-200 px-1 py-0.5 rounded truncate">
                          {scheduledCount} agendada{scheduledCount > 1 ? 's' : ''}
                        </div>
                      )}
                      {completedCount > 0 && (
                        <div className="text-xs bg-green-100 dark:bg-green-900 text-green-800 dark:text-green-200 px-1 py-0.5 rounded truncate">
                          {completedCount} completada{completedCount > 1 ? 's' : ''}
                        </div>
                      )}
                      {cancelledCount > 0 && (
                        <div className="text-xs bg-red-100 dark:bg-red-900 text-red-800 dark:text-red-200 px-1 py-0.5 rounded truncate">
                          {cancelledCount} cancelada{cancelledCount > 1 ? 's' : ''}
                        </div>
                      )}
                      {totalCount > 3 && (
                        <div className="text-xs text-muted-foreground">
                          +{totalCount - 3} mais
                        </div>
                      )}
                    </div>
                  </div>
                )
              })}
            </div>
            
            {/* Legenda */}
            <div className="mt-4 flex items-center gap-4 text-xs text-muted-foreground">
              <div className="flex items-center gap-2">
                <div className="w-3 h-3 bg-blue-100 dark:bg-blue-900 rounded"></div>
                <span>Agendada</span>
              </div>
              <div className="flex items-center gap-2">
                <div className="w-3 h-3 bg-green-100 dark:bg-green-900 rounded"></div>
                <span>Completada</span>
              </div>
              <div className="flex items-center gap-2">
                <div className="w-3 h-3 bg-red-100 dark:bg-red-900 rounded"></div>
                <span>Cancelada</span>
              </div>
            </div>
          </CardContent>
        </Card>
      ) : (
        /* Lista de Agendamentos */
        <div className="space-y-6">
          {/* Próximas Reuniões */}
        {upcomingAppointments.length > 0 && (
          <div>
            <h2 className="text-xl font-semibold mb-4">Próximas Reuniões</h2>
            <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
              {upcomingAppointments.map((appointment) => (
                <Card key={appointment.id} className="hover:shadow-md transition-shadow">
                  <CardHeader>
                    <div className="flex items-start justify-between">
                      <div className="flex-1">
                        <CardTitle className="text-lg">{appointment.title}</CardTitle>
                        <p className="text-sm text-muted-foreground mt-1">
                          {appointment.lead_name} {appointment.lead_company && `- ${appointment.lead_company}`}
                        </p>
                      </div>
                      <span className={`px-2 py-1 rounded-full text-xs font-medium ${getStatusColor(appointment.status)}`}>
                        {getStatusLabel(appointment.status)}
                      </span>
                    </div>
                  </CardHeader>
                  <CardContent>
                    <div className="space-y-2">
                      <div className="flex items-center gap-2 text-sm">
                        <Calendar className="h-4 w-4 text-muted-foreground" />
                        <span>{formatDateTime(appointment.scheduled_at)}</span>
                      </div>
                      <div className="flex items-center gap-2 text-sm">
                        <Clock className="h-4 w-4 text-muted-foreground" />
                        <span>{appointment.duration_minutes} minutos</span>
                      </div>
                      {appointment.location && (
                        <div className="flex items-center gap-2 text-sm">
                          <MapPin className="h-4 w-4 text-muted-foreground" />
                          <span>{appointment.location}</span>
                        </div>
                      )}
                      {appointment.meeting_url && (
                        <div className="flex items-center gap-2 text-sm">
                          <LinkIcon className="h-4 w-4 text-muted-foreground" />
                          <a href={appointment.meeting_url} target="_blank" rel="noopener noreferrer" className="text-blue-600 hover:underline">
                            Link da reunião
                          </a>
                        </div>
                      )}
                      {appointment.description && (
                        <p className="text-sm text-muted-foreground mt-2">{appointment.description}</p>
                      )}
                    </div>
                    <div className="flex gap-2 mt-4">
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => handleEdit(appointment)}
                      >
                        <Edit className="h-4 w-4 mr-1" />
                        Editar
                      </Button>
                      {appointment.status === 'scheduled' && (
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => handleStatusChange(appointment.id, 'completed')}
                          className="text-green-600"
                        >
                          <CheckCircle2 className="h-4 w-4 mr-1" />
                          Completar
                        </Button>
                      )}
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => handleDelete(appointment.id)}
                        className="text-red-600"
                      >
                        <Trash2 className="h-4 w-4 mr-1" />
                        Deletar
                      </Button>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          </div>
        )}

        {/* Reuniões Passadas */}
        {pastAppointments.length > 0 && (
          <div>
            <h2 className="text-xl font-semibold mb-4">Reuniões Passadas</h2>
            <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
              {pastAppointments.map((appointment) => (
                <Card key={appointment.id} className="hover:shadow-md transition-shadow">
                  <CardHeader>
                    <div className="flex items-start justify-between">
                      <div className="flex-1">
                        <CardTitle className="text-lg">{appointment.title}</CardTitle>
                        <p className="text-sm text-muted-foreground mt-1">
                          {appointment.lead_name} {appointment.lead_company && `- ${appointment.lead_company}`}
                        </p>
                      </div>
                      <span className={`px-2 py-1 rounded-full text-xs font-medium ${getStatusColor(appointment.status)}`}>
                        {getStatusLabel(appointment.status)}
                      </span>
                    </div>
                  </CardHeader>
                  <CardContent>
                    <div className="space-y-2">
                      <div className="flex items-center gap-2 text-sm">
                        <Calendar className="h-4 w-4 text-muted-foreground" />
                        <span>{formatDateTime(appointment.scheduled_at)}</span>
                      </div>
                      {appointment.outcome && (
                        <div className="text-sm">
                          <strong>Resultado:</strong> {appointment.outcome}
                        </div>
                      )}
                      {appointment.notes && (
                        <div className="text-sm text-muted-foreground">
                          <strong>Notas:</strong> {appointment.notes}
                        </div>
                      )}
                    </div>
                    <div className="flex gap-2 mt-4">
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => handleEdit(appointment)}
                      >
                        <Edit className="h-4 w-4 mr-1" />
                        Editar
                      </Button>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => handleDelete(appointment.id)}
                        className="text-red-600"
                      >
                        <Trash2 className="h-4 w-4 mr-1" />
                        Deletar
                      </Button>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          </div>
        )}

        {filteredAppointments.length === 0 && (
          <Card>
            <CardContent className="py-12 text-center">
              <Calendar className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
              <p className="text-muted-foreground">Nenhum agendamento encontrado</p>
            </CardContent>
          </Card>
        )}
        </div>
      )}
    </div>
  )
}

