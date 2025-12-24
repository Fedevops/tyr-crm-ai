import { useState, useEffect } from 'react'
import { useTranslation } from 'react-i18next'
import { useAuth } from '@/contexts/AuthContext'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Users, BookOpen, Sparkles, CheckCircle2, Clock, AlertCircle } from 'lucide-react'
import api from '@/lib/api'

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

export function Dashboard() {
  const { t } = useTranslation()
  const { user } = useAuth()
  const [loading, setLoading] = useState(true)
  const [stats, setStats] = useState({
    totalLeads: 0,
    activePlaybooks: 0,
    suggestions: 0
  })
  const [upcomingTasks, setUpcomingTasks] = useState<Task[]>([])

  useEffect(() => {
    fetchDashboardData()
  }, [])

  const fetchDashboardData = async () => {
    try {
      setLoading(true)
      
      // Buscar estatísticas de leads
      const leadsStatsResponse = await api.get('/api/leads/stats/summary')
      const leadsStats = leadsStatsResponse.data
      
      // Buscar playbooks
      const playbooksResponse = await api.get('/api/playbooks')
      const playbooks = playbooksResponse.data || []
      const activePlaybooks = playbooks.filter((p: any) => p.is_active !== false).length
      
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
      
      setStats({
        totalLeads: leadsStats.total || 0,
        activePlaybooks: activePlaybooks,
        suggestions: 0 // Por enquanto mantém 0
      })
      setUpcomingTasks(tasksWithLeads)
    } catch (error) {
      console.error('Error fetching dashboard data:', error)
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="flex-1 space-y-6 p-6">
      <div>
        <h1 className="text-3xl font-bold">{t('dashboard.title')}</h1>
        <p className="text-muted-foreground">
          {t('dashboard.welcomeBack')}, {user?.full_name}
        </p>
      </div>

      <div className="grid gap-4 md:grid-cols-3">
        <Card className="border-l-4 border-l-blue-500 bg-gradient-to-br from-blue-50/50 to-white dark:from-blue-950/20 dark:to-background">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium text-blue-700 dark:text-blue-300">
              {t('dashboard.totalLeads')}
            </CardTitle>
            <div className="p-2 rounded-lg bg-blue-100 dark:bg-blue-900/30">
              <Users className="h-4 w-4 text-blue-600 dark:text-blue-400" />
            </div>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-blue-900 dark:text-blue-100">
              {loading ? '...' : stats.totalLeads}
            </div>
            <p className="text-xs text-blue-700/80 dark:text-blue-300/80">
              {stats.totalLeads === 0 ? 'Sem leads ainda' : `${stats.totalLeads} lead${stats.totalLeads !== 1 ? 's' : ''} cadastrado${stats.totalLeads !== 1 ? 's' : ''}`}
            </p>
          </CardContent>
        </Card>

        <Card className="border-l-4 border-l-teal-500 bg-gradient-to-br from-teal-50/50 to-white dark:from-teal-950/20 dark:to-background">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium text-teal-700 dark:text-teal-300">
              {t('dashboard.activePlaybooks')}
            </CardTitle>
            <div className="p-2 rounded-lg bg-teal-100 dark:bg-teal-900/30">
              <BookOpen className="h-4 w-4 text-teal-600 dark:text-teal-400" />
            </div>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-teal-900 dark:text-teal-100">
              {loading ? '...' : stats.activePlaybooks}
            </div>
            <p className="text-xs text-teal-700/80 dark:text-teal-300/80">
              {stats.activePlaybooks === 0 ? 'Crie seu primeiro playbook' : `${stats.activePlaybooks} playbook${stats.activePlaybooks !== 1 ? 's' : ''} ativo${stats.activePlaybooks !== 1 ? 's' : ''}`}
            </p>
          </CardContent>
        </Card>

        <Card className="border-l-4 border-l-purple-500 bg-gradient-to-br from-purple-50/50 to-white dark:from-purple-950/20 dark:to-background">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium text-purple-700 dark:text-purple-300">
              {t('dashboard.suggestions')}
            </CardTitle>
            <div className="p-2 rounded-lg bg-purple-100 dark:bg-purple-900/30">
              <Sparkles className="h-4 w-4 text-purple-600 dark:text-purple-400" />
            </div>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-purple-900 dark:text-purple-100">
              {loading ? '...' : stats.suggestions}
            </div>
            <p className="text-xs text-purple-700/80 dark:text-purple-300/80">Nenhuma sugestão ainda</p>
          </CardContent>
        </Card>
      </div>

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





