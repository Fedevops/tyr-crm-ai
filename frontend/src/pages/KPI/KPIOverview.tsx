import { useState, useEffect, useMemo } from 'react'
import { useKPI, Goal } from '@/contexts/KPIContext'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Progress } from '@/components/ui/progress'
import { RadialProgress } from './components/RadialProgress'
import { GoalCreator } from './components/GoalCreator'
import { ActivitySimulator } from './components/ActivitySimulator'
import { AchievementToast } from './components/AchievementToast'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { Plus, Target, TrendingUp, Edit, Trash2 } from 'lucide-react'
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from 'recharts'
import { cn } from '@/lib/utils'

const getMetricLabel = (type: string) => {
  const labels: Record<string, string> = {
    tasks_completed: 'Tarefas Completadas',
    leads_created: 'Leads Criados',
    revenue_generated: 'Receita Gerada',
    calls_made: 'Chamadas Realizadas',
  }
  return labels[type] || type
}

const getStatusBadge = (status: string) => {
  const colors = {
    completed: 'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200',
    on_track: 'bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200',
    at_risk: 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-200',
  }
  const labels = {
    completed: 'Concluída',
    on_track: 'No Prazo',
    at_risk: 'Em Risco',
  }
  return (
    <span
      className={cn(
        'inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium',
        colors[status as keyof typeof colors] || colors.on_track
      )}
    >
      {labels[status as keyof typeof labels] || status}
    </span>
  )
}

const formatCurrency = (value: number) => {
  return new Intl.NumberFormat('pt-BR', {
    style: 'currency',
    currency: 'BRL',
  }).format(value)
}

export function KPIOverview() {
  const { goals, loading, deleteGoal, refreshGoals } = useKPI()
  const [isGoalCreatorOpen, setIsGoalCreatorOpen] = useState(false)
  const [editingGoal, setEditingGoal] = useState<Goal | null>(null)
  const [completedGoal, setCompletedGoal] = useState<{ id: number; title: string } | null>(null)

  // Recarregar KPIs quando a página é montada
  useEffect(() => {
    refreshGoals()
  }, [refreshGoals])

  // Listener para eventos de meta completada
  useEffect(() => {
    const handleGoalCompleted = (event: CustomEvent) => {
      const { goalId, goalTitle } = event.detail
      setCompletedGoal({ id: goalId, title: goalTitle })
      refreshGoals()
    }

    window.addEventListener('goal-completed', handleGoalCompleted as EventListener)
    return () => {
      window.removeEventListener('goal-completed', handleGoalCompleted as EventListener)
    }
  }, [refreshGoals])

  // Top 3 metas principais
  const topGoals = useMemo(() => {
    return goals
      .sort((a, b) => {
        const progressA = (a.current_value / a.target_value) * 100
        const progressB = (b.current_value / b.target_value) * 100
        return progressB - progressA
      })
      .slice(0, 3)
  }, [goals])

  // Dados para gráfico de tendência (últimos 30 dias)
  const chartData = useMemo(() => {
    const days = 30
    const data = []
    const now = new Date()

    // Agrupar metas por tipo de métrica
    const goalsByMetric = goals.reduce((acc, goal) => {
      if (!acc[goal.metric_type]) {
        acc[goal.metric_type] = []
      }
      acc[goal.metric_type].push(goal)
      return acc
    }, {} as Record<string, Goal[]>)

    for (let i = days - 1; i >= 0; i--) {
      const date = new Date(now)
      date.setDate(date.getDate() - i)
      const dayLabel = date.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' })

      // Calcular meta ideal (progresso linear)
      const idealProgress = ((days - i) / days) * 100

      // Criar objeto de dados para este dia
      const dayData: Record<string, any> = {
        date: dayLabel,
        ideal: idealProgress,
      }

      // Calcular progresso para cada tipo de métrica
      Object.entries(goalsByMetric).forEach(([metricType, metricGoals]) => {
        if (metricGoals.length > 0) {
          const totalProgress = metricGoals.reduce((sum, goal) => {
            const goalProgress = (goal.current_value / goal.target_value) * 100
            return sum + goalProgress
          }, 0)
          const avgProgress = totalProgress / metricGoals.length
          dayData[getMetricLabel(metricType)] = Math.round(avgProgress)
        }
      })

      data.push(dayData)
    }

    return data
  }, [goals])

  // Cores para cada tipo de métrica
  const metricColors: Record<string, string> = {
    'Tarefas Completadas': '#8884d8',
    'Leads Criados': '#82ca9d',
    'Receita Gerada': '#ffc658',
    'Chamadas Realizadas': '#ff7300',
  }

  // Obter tipos de métricas únicos para criar as linhas do gráfico
  const uniqueMetricTypes = useMemo(() => {
    const types = new Set(goals.map(g => getMetricLabel(g.metric_type)))
    return Array.from(types)
  }, [goals])

  const handleDelete = async (goalId: number) => {
    if (confirm('Tem certeza que deseja deletar esta meta?')) {
      await deleteGoal(goalId)
    }
  }

  const handleEdit = (goal: Goal) => {
    setEditingGoal(goal)
    setIsGoalCreatorOpen(true)
  }

  if (loading && goals.length === 0) {
    return (
      <div className="flex-1 space-y-6 p-6">
        <div className="flex items-center justify-center h-64">
          <div className="text-muted-foreground">Carregando metas...</div>
        </div>
      </div>
    )
  }

  return (
    <div className="flex-1 space-y-6 p-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold">Gestão de Performance</h1>
          <p className="text-muted-foreground">
            Acompanhe suas metas e KPIs em tempo real
          </p>
        </div>
        <div className="flex gap-2">
          <Button onClick={() => {
            setEditingGoal(null)
            setIsGoalCreatorOpen(true)
          }}>
            <Plus className="h-4 w-4 mr-2" />
            Nova Meta
          </Button>
          {import.meta.env.DEV && <ActivitySimulator />}
        </div>
      </div>

      {/* Cards de Resumo */}
      {topGoals.length > 0 && (
        <div className="grid gap-4 md:grid-cols-3">
          {topGoals.map((goal) => {
            const progress = (goal.current_value / goal.target_value) * 100
            return (
              <Card key={goal.id}>
                <CardHeader>
                  <CardTitle className="text-lg">{goal.title}</CardTitle>
                  <CardDescription>{getMetricLabel(goal.metric_type)}</CardDescription>
                </CardHeader>
                <CardContent>
                  <div className="flex items-center justify-center mb-4">
                    <RadialProgress
                      value={Math.min(progress, 100)}
                      size={120}
                      label={goal.period === 'monthly' ? 'Mensal' : 'Semanal'}
                    />
                  </div>
                  <div className="space-y-2 text-center">
                    <div className="text-2xl font-bold">
                      {goal.metric_type === 'revenue_generated'
                        ? formatCurrency(goal.current_value)
                        : Math.round(goal.current_value)}
                      {' / '}
                      {goal.metric_type === 'revenue_generated'
                        ? formatCurrency(goal.target_value)
                        : Math.round(goal.target_value)}
                    </div>
                    <div>{getStatusBadge(goal.status)}</div>
                  </div>
                </CardContent>
              </Card>
            )
          })}
        </div>
      )}

      {/* Gráfico de Tendência */}
      {goals.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle>Tendência de Progresso</CardTitle>
            <CardDescription>
              Progresso por tipo de métrica (últimos 30 dias)
            </CardDescription>
          </CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={400}>
              <LineChart data={chartData}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="date" />
                <YAxis domain={[0, 100]} />
                <Tooltip />
                <Legend />
                <Line
                  type="monotone"
                  dataKey="ideal"
                  stroke="#94a3b8"
                  name="Meta Ideal"
                  strokeWidth={2}
                  strokeDasharray="5 5"
                  dot={false}
                />
                {uniqueMetricTypes.map((metricLabel, index) => (
                  <Line
                    key={metricLabel}
                    type="monotone"
                    dataKey={metricLabel}
                    stroke={metricColors[metricLabel] || `hsl(${index * 60}, 70%, 50%)`}
                    name={metricLabel}
                    strokeWidth={2}
                    dot={{ r: 4 }}
                  />
                ))}
              </LineChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
      )}

      {/* Lista de Metas */}
      <Card>
        <CardHeader>
          <CardTitle>Todas as Metas</CardTitle>
          <CardDescription>
            Gerencie suas metas de performance
          </CardDescription>
        </CardHeader>
        <CardContent>
          {goals.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground">
              <Target className="h-12 w-12 mx-auto mb-4 opacity-50" />
              <p>Nenhuma meta criada ainda.</p>
              <p className="text-sm mt-2">
                Clique em "Nova Meta" para começar a acompanhar seu desempenho.
              </p>
            </div>
          ) : (
            <div className="rounded-md border">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Meta</TableHead>
                    <TableHead>Tipo</TableHead>
                    <TableHead>Progresso</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead className="text-right">Ações</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {goals.map((goal) => {
                    const progress = (goal.current_value / goal.target_value) * 100
                    const progressColor =
                      progress >= 100
                        ? 'bg-green-500'
                        : progress >= 80
                        ? 'bg-green-400'
                        : progress >= 50
                        ? 'bg-yellow-500'
                        : 'bg-red-500'

                    return (
                      <TableRow key={goal.id}>
                        <TableCell className="font-medium">{goal.title}</TableCell>
                        <TableCell>{getMetricLabel(goal.metric_type)}</TableCell>
                        <TableCell className="w-48">
                          <div className="space-y-1">
                            <Progress value={Math.min(progress, 100)} className="h-2" />
                            <div className="text-xs text-muted-foreground">
                              {goal.metric_type === 'revenue_generated'
                                ? `${formatCurrency(goal.current_value)} / ${formatCurrency(goal.target_value)}`
                                : `${Math.round(goal.current_value)} / ${Math.round(goal.target_value)}`}
                              {' '}
                              ({Math.round(progress)}%)
                            </div>
                          </div>
                        </TableCell>
                        <TableCell>{getStatusBadge(goal.status)}</TableCell>
                        <TableCell className="text-right">
                          <div className="flex justify-end gap-2">
                            <Button
                              variant="ghost"
                              size="icon"
                              onClick={() => handleEdit(goal)}
                            >
                              <Edit className="h-4 w-4" />
                            </Button>
                            <Button
                              variant="ghost"
                              size="icon"
                              onClick={() => handleDelete(goal.id)}
                            >
                              <Trash2 className="h-4 w-4 text-destructive" />
                            </Button>
                          </div>
                        </TableCell>
                      </TableRow>
                    )
                  })}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Modals */}
      <GoalCreator
        open={isGoalCreatorOpen}
        onOpenChange={setIsGoalCreatorOpen}
        editingGoal={editingGoal}
        onSuccess={() => {
          setEditingGoal(null)
          setIsGoalCreatorOpen(false)
        }}
      />

      {completedGoal && (
        <AchievementToast
          goalTitle={completedGoal.title}
          onClose={() => setCompletedGoal(null)}
        />
      )}
    </div>
  )
}


