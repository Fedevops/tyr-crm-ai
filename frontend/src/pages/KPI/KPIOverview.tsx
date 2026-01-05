import React, { useState, useEffect, useMemo } from 'react'
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
import { Plus, Target, TrendingUp, Edit, Trash2, Calendar } from 'lucide-react'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from 'recharts'
import { cn } from '@/lib/utils'

const getMetricLabel = (type: string) => {
  const labels: Record<string, string> = {
    tasks_completed: 'Tarefas Completadas',
    leads_created: 'Leads Criados',
    leads_enriched: 'Leads Enriquecidos',
    leads_imported_from_linkedin: 'Leads Importados do LinkedIn',
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

type PeriodType = 'past' | 'future' | 'custom'

export function KPIOverview() {
  const { goals, loading, deleteGoal, refreshGoals } = useKPI()
  const [isGoalCreatorOpen, setIsGoalCreatorOpen] = useState(false)
  const [editingGoal, setEditingGoal] = useState<Goal | null>(null)
  const [completedGoal, setCompletedGoal] = useState<{ id: number; title: string } | null>(null)
  
  // Estados para filtro de período do gráfico
  const [periodType, setPeriodType] = useState<PeriodType>('past')
  const [periodDays, setPeriodDays] = useState<number>(30)
  const [customStartDate, setCustomStartDate] = useState<string>('')
  const [customEndDate, setCustomEndDate] = useState<string>('')

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

  // Dados para gráfico de tendência
  const chartData = useMemo(() => {
    const data = []
    const now = new Date()
    
    // Determinar período baseado no tipo selecionado
    let startDate: Date
    let endDate: Date
    let totalDays: number
    
    if (periodType === 'custom' && customStartDate && customEndDate) {
      startDate = new Date(customStartDate)
      endDate = new Date(customEndDate)
      totalDays = Math.ceil((endDate.getTime() - startDate.getTime()) / (1000 * 60 * 60 * 24)) + 1
    } else {
      const days = periodDays
      if (periodType === 'future') {
        startDate = new Date(now)
        endDate = new Date(now)
        endDate.setDate(endDate.getDate() + days - 1)
        totalDays = days
      } else {
        // past (padrão)
        startDate = new Date(now)
        startDate.setDate(startDate.getDate() - days + 1)
        endDate = new Date(now)
        totalDays = days
      }
    }
    
    if (totalDays <= 0 || totalDays > 365) {
      return []
    }

    // Agrupar metas por tipo de métrica
    const goalsByMetric = goals.reduce((acc, goal) => {
      if (!acc[goal.metric_type]) {
        acc[goal.metric_type] = []
      }
      acc[goal.metric_type].push(goal)
      return acc
    }, {} as Record<string, Goal[]>)

    // Gerar dados para cada dia no período
    for (let i = 0; i < totalDays; i++) {
      const date = new Date(startDate)
      date.setDate(date.getDate() + i)
      const dayLabel = date.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' })

      // Criar objeto de dados para este dia
      const dayData: Record<string, any> = {
        date: dayLabel,
      }

      // Calcular meta ideal para cada meta individual baseada na due_date
      goals.forEach((goal) => {
        const goalKey = `ideal_${goal.id}`
        const goalProgressKey = `progress_${goal.id}`
        
        // Determinar data de vencimento da meta
        const goalDueDate = goal.due_date 
          ? new Date(goal.due_date) 
          : new Date(goal.period_end)
        
        // Determinar data de início da meta
        const goalStartDate = new Date(goal.period_start)
        
        // Verificar se a data atual está dentro do período da meta
        const isDateInGoalPeriod = date >= goalStartDate && date <= goalDueDate
        
        if (isDateInGoalPeriod) {
          // Calcular dias totais da meta
          const goalTotalDays = Math.ceil((goalDueDate.getTime() - goalStartDate.getTime()) / (1000 * 60 * 60 * 24)) + 1
          
          // Calcular dias decorridos desde o início da meta até a data atual
          const daysElapsed = Math.ceil((date.getTime() - goalStartDate.getTime()) / (1000 * 60 * 60 * 24)) + 1
          
          // Calcular progresso ideal (linear baseado na data de vencimento)
          const idealProgress = Math.min(100, Math.max(0, (daysElapsed / goalTotalDays) * 100))
          dayData[goalKey] = Math.round(idealProgress)
        } else {
          // Se a data está fora do período da meta, não mostrar
          dayData[goalKey] = null
        }
        
        // Calcular progresso real da meta (sempre o mesmo, mas só mostrar se estiver no período)
        if (isDateInGoalPeriod) {
          const actualProgress = (goal.current_value / goal.target_value) * 100
          dayData[goalProgressKey] = Math.round(actualProgress)
        } else {
          dayData[goalProgressKey] = null
        }
      })

      // Calcular progresso agregado para cada tipo de métrica (para compatibilidade)
      if (periodType === 'future') {
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
      } else {
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
      }

      data.push(dayData)
    }

    return data
  }, [goals, periodType, periodDays, customStartDate, customEndDate])

  // Cores para cada tipo de métrica
  const metricColors: Record<string, string> = {
    'Tarefas Completadas': '#8884d8',
    'Leads Criados': '#82ca9d',
    'Receita Gerada': '#ffc658',
    'Chamadas Realizadas': '#ff7300',
  }

  // Paleta de cores distintas para as metas
  const goalColors = [
    '#3b82f6', // Azul
    '#10b981', // Verde
    '#f59e0b', // Amarelo/Laranja
    '#ef4444', // Vermelho
    '#8b5cf6', // Roxo
    '#06b6d4', // Ciano
    '#ec4899', // Rosa
    '#14b8a6', // Turquesa
    '#f97316', // Laranja
    '#84cc16', // Verde limão
    '#6366f1', // Índigo
    '#a855f7', // Roxo claro
    '#22c55e', // Verde esmeralda
    '#eab308', // Amarelo
    '#06b6d4', // Azul claro
  ]

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
                    {goal.daily_target !== null && goal.daily_target !== undefined && goal.daily_target > 0 && (
                      <div className="text-sm text-muted-foreground">
                        Meta diária: {goal.metric_type === 'revenue_generated'
                          ? formatCurrency(goal.daily_target)
                          : Math.round(goal.daily_target)}
                      </div>
                    )}
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
            <div className="flex items-center justify-between">
              <div>
                <CardTitle>Tendência de Progresso</CardTitle>
                <CardDescription>
                  {periodType === 'future' 
                    ? `Projeção para próximos ${periodDays} dias`
                    : periodType === 'custom' && customStartDate && customEndDate
                    ? `Período customizado: ${new Date(customStartDate).toLocaleDateString('pt-BR')} a ${new Date(customEndDate).toLocaleDateString('pt-BR')}`
                    : `Últimos ${periodDays} dias`}
                </CardDescription>
              </div>
            </div>
          </CardHeader>
          <CardContent>
            {/* Filtros de Período */}
            <div className="mb-6 space-y-4 p-4 border rounded-lg bg-muted/50">
              <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
                <div className="space-y-2">
                  <Label htmlFor="period-type">Tipo de Período</Label>
                  <Select
                    value={periodType}
                    onValueChange={(value) => {
                      setPeriodType(value as PeriodType)
                      if (value === 'custom') {
                        // Definir datas padrão se não estiverem definidas
                        if (!customStartDate) {
                          const start = new Date()
                          start.setDate(start.getDate() - 30)
                          setCustomStartDate(start.toISOString().split('T')[0])
                        }
                        if (!customEndDate) {
                          setCustomEndDate(new Date().toISOString().split('T')[0])
                        }
                      }
                    }}
                  >
                    <SelectTrigger id="period-type">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="past">Últimos X dias</SelectItem>
                      <SelectItem value="future">Próximos X dias</SelectItem>
                      <SelectItem value="custom">Período Customizado</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                
                {periodType !== 'custom' && (
                  <div className="space-y-2">
                    <Label htmlFor="period-days">Número de Dias</Label>
                    <Input
                      id="period-days"
                      type="number"
                      min="1"
                      max="365"
                      value={periodDays}
                      onChange={(e) => setPeriodDays(parseInt(e.target.value) || 30)}
                    />
                  </div>
                )}
                
                {periodType === 'custom' && (
                  <>
                    <div className="space-y-2">
                      <Label htmlFor="start-date">Data Inicial</Label>
                      <Input
                        id="start-date"
                        type="date"
                        value={customStartDate}
                        onChange={(e) => setCustomStartDate(e.target.value)}
                      />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="end-date">Data Final</Label>
                      <Input
                        id="end-date"
                        type="date"
                        value={customEndDate}
                        onChange={(e) => setCustomEndDate(e.target.value)}
                      />
                    </div>
                  </>
                )}
              </div>
            </div>
            {chartData.length === 0 ? (
              <div className="flex items-center justify-center h-96 text-muted-foreground">
                <div className="text-center">
                  <p>Nenhum dado disponível para o período selecionado.</p>
                  <p className="text-sm mt-2">Ajuste os filtros acima para visualizar os dados.</p>
                </div>
              </div>
            ) : (
              <ResponsiveContainer width="100%" height={400}>
              <LineChart data={chartData}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="date" />
                <YAxis domain={[0, 100]} />
                <Tooltip />
                <Legend />
                {/* Linhas de meta ideal para cada meta individual */}
                {goals.map((goal, index) => {
                  const goalKey = `ideal_${goal.id}`
                  const goalProgressKey = `progress_${goal.id}`
                  // Usar cores distintas da paleta, com variação para ideal vs progresso
                  const baseColor = goalColors[index % goalColors.length]
                  // Meta ideal: cor mais clara e com opacidade
                  const idealColor = baseColor + '80' // Adiciona transparência
                  // Progresso: cor sólida
                  const progressColor = baseColor
                  
                  return (
                    <React.Fragment key={`goal-${goal.id}`}>
                      <Line
                        type="monotone"
                        dataKey={goalKey}
                        stroke={idealColor}
                        name={`${goal.title} - Meta Ideal`}
                        strokeWidth={2}
                        strokeDasharray="5 5"
                        dot={false}
                        connectNulls={false}
                      />
                      <Line
                        type="monotone"
                        dataKey={goalProgressKey}
                        stroke={progressColor}
                        name={`${goal.title} - Progresso`}
                        strokeWidth={2.5}
                        dot={{ r: 4 }}
                        connectNulls={false}
                      />
                    </React.Fragment>
                  )
                })}
                {/* Linhas agregadas por tipo de métrica (opcional, pode ser removido se não for necessário) */}
                {uniqueMetricTypes.map((metricLabel, index) => (
                  <Line
                    key={metricLabel}
                    type="monotone"
                    dataKey={metricLabel}
                    stroke={metricColors[metricLabel] || `hsl(${index * 60}, 70%, 50%)`}
                    name={`${metricLabel} (Média)`}
                    strokeWidth={1}
                    strokeDasharray="2 2"
                    dot={false}
                    opacity={0.5}
                  />
                ))}
              </LineChart>
            </ResponsiveContainer>
            )}
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
                              {goal.daily_target !== null && goal.daily_target !== undefined && goal.daily_target > 0 && (
                                <div className="mt-1 text-xs font-medium">
                                  Meta diária: {goal.metric_type === 'revenue_generated'
                                    ? formatCurrency(goal.daily_target)
                                    : Math.round(goal.daily_target)}
                                </div>
                              )}
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


