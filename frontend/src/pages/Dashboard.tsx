import { useState, useEffect } from 'react'
import { useTranslation } from 'react-i18next'
import { useAuth } from '@/contexts/AuthContext'
import { useKPI } from '@/contexts/KPIContext'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { TyrLoadingSpinner } from '@/components/TyrLoadingSpinner'
import { 
  Users, BookOpen, Sparkles, CheckCircle2, Clock, AlertCircle, 
  TrendingUp, Target, Briefcase, Phone, Mail, Calendar,
  DollarSign, BarChart3, PieChart
} from 'lucide-react'
import api from '@/lib/api'
import {
  BarChart,
  Bar,
  PieChart as RechartsPieChart,
  Pie,
  Cell,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer
} from 'recharts'

const formatDate = (date: Date) => {
  const day = date.getDate().toString().padStart(2, '0')
  const month = date.toLocaleDateString('pt-BR', { month: 'short' })
  const hours = date.getHours().toString().padStart(2, '0')
  const minutes = date.getMinutes().toString().padStart(2, '0')
  return `${day} de ${month} às ${hours}:${minutes}`
}

const formatDateShort = (date: Date) => {
  const day = date.getDate().toString().padStart(2, '0')
  const month = date.toLocaleDateString('pt-BR', { month: 'short' })
  return `${day} de ${month}`
}

const formatCurrency = (value: number, currency: string = 'BRL') => {
  return new Intl.NumberFormat('pt-BR', {
    style: 'currency',
    currency: currency
  }).format(value)
}

interface Task {
  id: number
  title: string
  type: string
  due_date: string
  status: string
  lead_id: number
  lead?: {
    name: string
    company?: string
  }
}

interface DashboardStats {
  leads: {
    total: number
    by_status: Record<string, number>
    by_source: Record<string, number>
    average_score: number
    assigned: number
    unassigned: number
  }
  tasks: {
    total: number
    by_status: Record<string, number>
    overdue: number
    upcoming: number
    completed: number
    pending: number
  }
  opportunities: {
    total: number
    by_stage: Record<string, number>
    total_value: number
    won: number
    lost: number
  }
  accounts: {
    total: number
  }
  contacts: {
    total: number
  }
}

interface FunnelData {
  funnel: {
    id: number
    name: string
    is_default: boolean
  } | null
  stages: Array<{
    id: number
    name: string
    order: number
    probability: number
    opportunity_count: number
    total_value: number
    opportunities: Array<{
      id: number
      name: string
      amount: number | null
      currency: string | null
      expected_close_date: string | null
    }>
  }>
}

const COLORS = ['#3b82f6', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6', '#06b6d4', '#ec4899']

export function Dashboard() {
  const { t } = useTranslation()
  const { user } = useAuth()
  const { goals, refreshGoals } = useKPI()
  const [loading, setLoading] = useState(true)
  const [stats, setStats] = useState<DashboardStats | null>(null)
  const [funnelData, setFunnelData] = useState<FunnelData | null>(null)
  const [upcomingTasks, setUpcomingTasks] = useState<Task[]>([])

  useEffect(() => {
    fetchDashboardData()
    refreshGoals()
  }, [refreshGoals])

  const fetchDashboardData = async () => {
    try {
      setLoading(true)
      
      // Buscar estatísticas completas
      const statsResponse = await api.get('/api/dashboard/stats')
      setStats(statsResponse.data)
      
      // Buscar funil de vendas
      try {
        const funnelResponse = await api.get('/api/dashboard/funnel')
        setFunnelData(funnelResponse.data)
      } catch (error) {
        console.warn('Funnel data not available:', error)
        setFunnelData(null)
      }
      
      // Buscar próximas tarefas (próximos 7 dias)
      const tasksResponse = await api.get('/api/tasks/upcoming?days=7')
      const tasks = tasksResponse.data || []
      
      // Buscar informações dos leads para as tarefas
      const tasksWithLeads = await Promise.all(
        tasks.map(async (task: Task) => {
          try {
            const leadResponse = await api.get(`/api/leads/${task.lead_id}`)
            return { ...task, lead: leadResponse.data }
          } catch {
            return task
          }
        })
      )
      
      setUpcomingTasks(tasksWithLeads)
    } catch (error) {
      console.error('Error fetching dashboard data:', error)
    } finally {
      setLoading(false)
    }
  }

  // Preparar dados para gráficos
  const leadsByStatusData = stats?.leads.by_status 
    ? Object.entries(stats.leads.by_status).map(([name, value]) => ({ name, value }))
    : []

  const leadsBySourceData = stats?.leads.by_source
    ? Object.entries(stats.leads.by_source).map(([name, value]) => ({ name, value }))
    : []

  const opportunitiesByStageData = stats?.opportunities.by_stage
    ? Object.entries(stats.opportunities.by_stage).map(([name, value]) => ({ name, value }))
    : []

  const funnelStagesData = funnelData?.stages.map(stage => ({
    name: stage.name,
    value: stage.opportunity_count,
    amount: stage.total_value,
    probability: stage.probability
  })) || []

  if (loading) {
    return <TyrLoadingSpinner />
  }

  return (
    <div className="flex-1 space-y-6 p-6">
      <div>
        <h1 className="text-3xl font-bold">{t('dashboard.title')}</h1>
        <p className="text-muted-foreground">
          {t('dashboard.welcomeBack')}, {user?.full_name}
        </p>
      </div>

      {/* Cards de Estatísticas */}
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-5">
        <Card className="border-l-4 border-l-blue-500 bg-gradient-to-br from-blue-50/50 to-white dark:from-blue-950/20 dark:to-background">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium text-blue-700 dark:text-blue-300">
              Leads
            </CardTitle>
            <div className="p-2 rounded-lg bg-blue-100 dark:bg-blue-900/30">
              <Users className="h-4 w-4 text-blue-600 dark:text-blue-400" />
            </div>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-blue-900 dark:text-blue-100">
              {loading ? '...' : stats?.leads.total || 0}
            </div>
            <p className="text-xs text-blue-700/80 dark:text-blue-300/80">
              {stats?.leads.assigned || 0} atribuídos
            </p>
          </CardContent>
        </Card>

        <Card className="border-l-4 border-l-teal-500 bg-gradient-to-br from-teal-50/50 to-white dark:from-teal-950/20 dark:to-background">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium text-teal-700 dark:text-teal-300">
              Tarefas
            </CardTitle>
            <div className="p-2 rounded-lg bg-teal-100 dark:bg-teal-900/30">
              <CheckCircle2 className="h-4 w-4 text-teal-600 dark:text-teal-400" />
            </div>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-teal-900 dark:text-teal-100">
              {loading ? '...' : stats?.tasks.total || 0}
            </div>
            <p className="text-xs text-teal-700/80 dark:text-teal-300/80">
              {stats?.tasks.overdue || 0} atrasadas
            </p>
          </CardContent>
        </Card>

        <Card className="border-l-4 border-l-purple-500 bg-gradient-to-br from-purple-50/50 to-white dark:from-purple-950/20 dark:to-background">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium text-purple-700 dark:text-purple-300">
              Oportunidades
            </CardTitle>
            <div className="p-2 rounded-lg bg-purple-100 dark:bg-purple-900/30">
              <Target className="h-4 w-4 text-purple-600 dark:text-purple-400" />
            </div>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-purple-900 dark:text-purple-100">
              {loading ? '...' : stats?.opportunities.total || 0}
            </div>
            <p className="text-xs text-purple-700/80 dark:text-purple-300/80">
              {formatCurrency(stats?.opportunities.total_value || 0)}
            </p>
          </CardContent>
        </Card>

        <Card className="border-l-4 border-l-indigo-500 bg-gradient-to-br from-indigo-50/50 to-white dark:from-indigo-950/20 dark:to-background">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium text-indigo-700 dark:text-indigo-300">
              Contas
            </CardTitle>
            <div className="p-2 rounded-lg bg-indigo-100 dark:bg-indigo-900/30">
              <Briefcase className="h-4 w-4 text-indigo-600 dark:text-indigo-400" />
            </div>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-indigo-900 dark:text-indigo-100">
              {loading ? '...' : stats?.accounts.total || 0}
            </div>
            <p className="text-xs text-indigo-700/80 dark:text-indigo-300/80">
              Empresas cadastradas
            </p>
          </CardContent>
        </Card>

        <Card className="border-l-4 border-l-pink-500 bg-gradient-to-br from-pink-50/50 to-white dark:from-pink-950/20 dark:to-background">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium text-pink-700 dark:text-pink-300">
              Contatos
            </CardTitle>
            <div className="p-2 rounded-lg bg-pink-100 dark:bg-pink-900/30">
              <Users className="h-4 w-4 text-pink-600 dark:text-pink-400" />
            </div>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-pink-900 dark:text-pink-100">
              {loading ? '...' : stats?.contacts.total || 0}
            </div>
            <p className="text-xs text-pink-700/80 dark:text-pink-300/80">
              Pessoas cadastradas
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Metas Diárias dos KPIs */}
      {goals && goals.length > 0 && goals.some(g => g.daily_target && g.daily_target > 0) && (
        <Card className="border-t-4 border-t-orange-500 bg-gradient-to-br from-orange-50/30 to-white dark:from-orange-950/10 dark:to-background">
          <CardHeader className="bg-gradient-to-r from-orange-50/50 to-transparent dark:from-orange-950/20">
            <CardTitle className="flex items-center gap-2 text-orange-900 dark:text-orange-100">
              <Target className="h-5 w-5 text-orange-600 dark:text-orange-400" />
              Metas Diárias
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
              {goals
                .filter(g => g.daily_target && g.daily_target > 0)
                .map((goal) => {
                  const getMetricLabel = (type: string) => {
                    const labels: Record<string, string> = {
                      tasks_completed: 'Tarefas Completadas',
                      leads_created: 'Leads Criados',
                      leads_enriched: 'Leads Enriquecidos',
                      revenue_generated: 'Receita Gerada',
                      calls_made: 'Chamadas Realizadas',
                    }
                    return labels[type] || type
                  }
                  
                  return (
                    <div
                      key={goal.id}
                      className="p-4 rounded-lg border bg-card text-card-foreground shadow-sm"
                    >
                      <div className="flex items-center justify-between mb-2">
                        <h3 className="font-semibold text-sm">{goal.title}</h3>
                        <span className="text-xs text-muted-foreground">
                          {goal.period === 'monthly' ? 'Mensal' : 'Semanal'}
                        </span>
                      </div>
                      <p className="text-xs text-muted-foreground mb-2">
                        {getMetricLabel(goal.metric_type)}
                      </p>
                      <div className="text-2xl font-bold">
                        {goal.metric_type === 'revenue_generated'
                          ? formatCurrency(goal.daily_target || 0)
                          : Math.round(goal.daily_target || 0)}
                      </div>
                      <p className="text-xs text-muted-foreground mt-1">
                        Meta diária para atingir o objetivo
                      </p>
                    </div>
                  )
                })}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Gráficos */}
      <div className="grid gap-4 md:grid-cols-2">
        {/* Leads por Status */}
        <Card className="border-t-4 border-t-blue-500 bg-gradient-to-br from-blue-50/30 to-white dark:from-blue-950/10 dark:to-background">
          <CardHeader className="bg-gradient-to-r from-blue-50/50 to-transparent dark:from-blue-950/20">
            <CardTitle className="flex items-center gap-2 text-blue-900 dark:text-blue-100">
              <BarChart3 className="h-5 w-5 text-blue-600 dark:text-blue-400" />
              Leads por Status
            </CardTitle>
          </CardHeader>
          <CardContent>
            {loading ? (
              <p className="text-sm text-muted-foreground">Carregando...</p>
            ) : leadsByStatusData.length === 0 ? (
              <p className="text-sm text-muted-foreground">Nenhum dado disponível</p>
            ) : (
              <ResponsiveContainer width="100%" height={300}>
                <BarChart data={leadsByStatusData}>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis dataKey="name" />
                  <YAxis />
                  <Tooltip />
                  <Legend />
                  <Bar dataKey="value" fill="#3b82f6" />
                </BarChart>
              </ResponsiveContainer>
            )}
          </CardContent>
        </Card>

        {/* Leads por Fonte */}
        <Card className="border-t-4 border-t-teal-500 bg-gradient-to-br from-teal-50/30 to-white dark:from-teal-950/10 dark:to-background">
          <CardHeader className="bg-gradient-to-r from-teal-50/50 to-transparent dark:from-teal-950/20">
            <CardTitle className="flex items-center gap-2 text-teal-900 dark:text-teal-100">
              <PieChart className="h-5 w-5 text-teal-600 dark:text-teal-400" />
              Leads por Fonte
            </CardTitle>
          </CardHeader>
          <CardContent>
            {loading ? (
              <p className="text-sm text-muted-foreground">Carregando...</p>
            ) : leadsBySourceData.length === 0 ? (
              <p className="text-sm text-muted-foreground">Nenhum dado disponível</p>
            ) : (
              <ResponsiveContainer width="100%" height={300}>
                <RechartsPieChart>
                  <Pie
                    data={leadsBySourceData}
                    cx="50%"
                    cy="50%"
                    labelLine={false}
                    label={({ name, percent }) => `${name}: ${(percent * 100).toFixed(0)}%`}
                    outerRadius={80}
                    fill="#8884d8"
                    dataKey="value"
                  >
                    {leadsBySourceData.map((entry, index) => (
                      <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                    ))}
                  </Pie>
                  <Tooltip />
                </RechartsPieChart>
              </ResponsiveContainer>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Funil de Vendas */}
      {funnelData && funnelData.funnel && (
        <Card className="border-t-4 border-t-purple-500 bg-gradient-to-br from-purple-50/30 to-white dark:from-purple-950/10 dark:to-background">
          <CardHeader className="bg-gradient-to-r from-purple-50/50 to-transparent dark:from-purple-950/20">
            <CardTitle className="flex items-center gap-2 text-purple-900 dark:text-purple-100">
              <TrendingUp className="h-5 w-5 text-purple-600 dark:text-purple-400" />
              Funil de Vendas: {funnelData.funnel.name}
            </CardTitle>
          </CardHeader>
          <CardContent>
            {loading ? (
              <p className="text-sm text-muted-foreground">Carregando...</p>
            ) : funnelStagesData.length === 0 ? (
              <p className="text-sm text-muted-foreground">Nenhuma oportunidade no funil</p>
            ) : (
              <div className="space-y-4">
                {/* Visualização do Funil */}
                <ResponsiveContainer width="100%" height={400}>
                  <BarChart data={funnelStagesData} layout="vertical">
                    <CartesianGrid strokeDasharray="3 3" />
                    <XAxis type="number" />
                    <YAxis dataKey="name" type="category" width={150} />
                    <Tooltip 
                      formatter={(value: number, name: string) => {
                        if (name === 'value') return [`${value} oportunidades`, 'Quantidade']
                        if (name === 'amount') return [formatCurrency(value), 'Valor Total']
                        return [value, name]
                      }}
                    />
                    <Legend />
                    <Bar dataKey="value" fill="#8b5cf6" name="Oportunidades" />
                    <Bar dataKey="amount" fill="#10b981" name="Valor Total" />
                  </BarChart>
                </ResponsiveContainer>

                {/* Detalhes por Estágio */}
                <div className="grid gap-3 md:grid-cols-2 lg:grid-cols-3">
                  {funnelData.stages.map((stage) => (
                    <div
                      key={stage.id}
                      className="p-4 rounded-lg border bg-gradient-to-br from-white to-gray-50 dark:from-gray-900 dark:to-gray-800"
                    >
                      <div className="flex items-center justify-between mb-2">
                        <h4 className="font-semibold text-sm">{stage.name}</h4>
                        <span className="text-xs px-2 py-1 rounded bg-purple-100 text-purple-800 dark:bg-purple-900 dark:text-purple-200">
                          {stage.probability}%
                        </span>
                      </div>
                      <div className="space-y-1">
                        <p className="text-2xl font-bold text-purple-900 dark:text-purple-100">
                          {stage.opportunity_count}
                        </p>
                        <p className="text-xs text-muted-foreground">
                          {formatCurrency(stage.total_value, stage.opportunities[0]?.currency || 'BRL')}
                        </p>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {/* Oportunidades por Estágio */}
      {opportunitiesByStageData.length > 0 && (
        <Card className="border-t-4 border-t-orange-500 bg-gradient-to-br from-orange-50/30 to-white dark:from-orange-950/10 dark:to-background">
          <CardHeader className="bg-gradient-to-r from-orange-50/50 to-transparent dark:from-orange-950/20">
            <CardTitle className="flex items-center gap-2 text-orange-900 dark:text-orange-100">
              <Target className="h-5 w-5 text-orange-600 dark:text-orange-400" />
              Oportunidades por Estágio
            </CardTitle>
          </CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={300}>
              <BarChart data={opportunitiesByStageData}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="name" />
                <YAxis />
                <Tooltip />
                <Legend />
                <Bar dataKey="value" fill="#f59e0b" />
              </BarChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
      )}

      {/* Próximas Tarefas */}
      <Card className="border-t-4 border-t-indigo-500 bg-gradient-to-br from-indigo-50/30 to-white dark:from-indigo-950/10 dark:to-background">
        <CardHeader className="bg-gradient-to-r from-indigo-50/50 to-transparent dark:from-indigo-950/20">
          <CardTitle className="flex items-center gap-2 text-indigo-900 dark:text-indigo-100">
            <Clock className="h-5 w-5 text-indigo-600 dark:text-indigo-400" />
            Próximas Tarefas
          </CardTitle>
        </CardHeader>
        <CardContent>
          {loading ? (
            <p className="text-sm text-muted-foreground">Carregando...</p>
          ) : upcomingTasks.length === 0 ? (
            <p className="text-sm text-muted-foreground">Nenhuma tarefa pendente nos próximos 7 dias</p>
          ) : (
            <div className="space-y-3">
              {upcomingTasks.slice(0, 10).map((task) => {
                const dueDate = new Date(task.due_date)
                const isOverdue = dueDate < new Date() && task.status !== 'completed'
                const isToday = dueDate.toDateString() === new Date().toDateString()
                
                return (
                  <div
                    key={task.id}
                    className={`flex items-center justify-between p-3 rounded-lg border ${
                      isOverdue
                        ? 'bg-red-50 border-red-200 dark:bg-red-950 dark:border-red-800'
                        : isToday
                        ? 'bg-yellow-50 border-yellow-200 dark:bg-yellow-950 dark:border-yellow-800'
                        : 'bg-gray-50 border-gray-200 dark:bg-gray-900 dark:border-gray-800'
                    }`}
                  >
                    <div className="flex-1">
                      <div className="flex items-center gap-2">
                        <span className="text-sm font-medium">{task.title}</span>
                        <span className="text-xs px-2 py-1 rounded bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200">
                          {task.type}
                        </span>
                      </div>
                      {task.lead && (
                        <p className="text-xs text-muted-foreground mt-1">
                          {task.lead.name}
                          {task.lead.company && ` - ${task.lead.company}`}
                        </p>
                      )}
                    </div>
                    <div className="flex items-center gap-3">
                      <div className="text-right">
                        <p className={`text-xs font-medium ${
                          isOverdue ? 'text-red-600 dark:text-red-400' : 
                          isToday ? 'text-yellow-600 dark:text-yellow-400' : 
                          'text-muted-foreground'
                        }`}>
                          {isOverdue ? (
                            <span className="flex items-center gap-1">
                              <AlertCircle className="h-3 w-3" />
                              Atrasada
                            </span>
                          ) : isToday ? (
                            'Hoje'
                          ) : (
                            formatDate(dueDate)
                          )}
                        </p>
                        <p className="text-xs text-muted-foreground">
                          {formatDateShort(dueDate)}
                        </p>
                      </div>
                      {task.status === 'completed' && (
                        <CheckCircle2 className="h-5 w-5 text-green-500" />
                      )}
                    </div>
                  </div>
                )
              })}
              {upcomingTasks.length > 10 && (
                <p className="text-xs text-muted-foreground text-center pt-2">
                  E mais {upcomingTasks.length - 10} tarefa(s)...
                </p>
              )}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
