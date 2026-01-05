import { createContext, useContext, useState, useCallback, ReactNode, useEffect } from 'react'
import api from '@/lib/api'
import { useToast } from '@/components/ui/use-toast'
import { useAuth } from './AuthContext'

export type MetricType = 'tasks_completed' | 'leads_created' | 'leads_enriched' | 'leads_imported_from_linkedin' | 'revenue_generated' | 'calls_made'
export type GoalPeriod = 'monthly' | 'weekly'
export type GoalStatus = 'on_track' | 'at_risk' | 'completed'

export interface Goal {
  id: number
  tenant_id: number
  user_id: number
  title: string
  metric_type: MetricType
  target_value: number
  current_value: number
  period: GoalPeriod
  status: GoalStatus
  is_visible_on_wallboard: boolean
  period_start: string
  period_end: string
  due_date?: string | null
  daily_target?: number | null
  created_at: string
  updated_at: string
}

interface KPIContextType {
  goals: Goal[]
  loading: boolean
  error: string | null
  fetchGoals: () => Promise<void>
  createGoal: (goalData: Omit<Goal, 'id' | 'tenant_id' | 'user_id' | 'current_value' | 'status' | 'period_start' | 'period_end' | 'created_at' | 'updated_at'>) => Promise<Goal>
  updateGoal: (goalId: number, goalData: Partial<Goal>) => Promise<void>
  deleteGoal: (goalId: number) => Promise<void>
  trackActivity: (metricType: MetricType, value: number, entityType?: string, entityId?: number) => Promise<void>
  refreshGoals: () => Promise<void>
}

const KPIContext = createContext<KPIContextType | undefined>(undefined)

export function KPIProvider({ children }: { children: ReactNode }) {
  const [goals, setGoals] = useState<Goal[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const { toast } = useToast()
  const { isAuthenticated } = useAuth()

  const fetchGoals = useCallback(async () => {
    if (!isAuthenticated) {
      return
    }
    
    setLoading(true)
    setError(null)
    try {
      console.log('[KPI Frontend] Buscando goals...')
      const response = await api.get('/api/kpi/goals')
      console.log('[KPI Frontend] Resposta recebida:', response)
      console.log('[KPI Frontend] Dados recebidos:', response.data)
      console.log('[KPI Frontend] Tipo dos dados:', typeof response.data, Array.isArray(response.data))
      console.log('[KPI Frontend] Quantidade de goals:', Array.isArray(response.data) ? response.data.length : 'Não é array')
      
      if (Array.isArray(response.data)) {
        setGoals(response.data)
        console.log('[KPI Frontend] Goals definidos no estado:', response.data.length)
      } else {
        console.error('[KPI Frontend] Resposta não é um array:', response.data)
        setGoals([])
      }
    } catch (err: any) {
      const errorMsg = err.response?.data?.detail || 'Erro ao carregar metas'
      setError(errorMsg)
      console.error('[KPI Frontend] Erro ao buscar goals:', err)
      console.error('[KPI Frontend] Detalhes do erro:', err.response?.data)
      setGoals([])
    } finally {
      setLoading(false)
    }
  }, [isAuthenticated])

  const refreshGoals = useCallback(async () => {
    await fetchGoals()
  }, [fetchGoals])

  useEffect(() => {
    if (isAuthenticated) {
      fetchGoals()
    }
  }, [fetchGoals, isAuthenticated])

  const createGoal = useCallback(
    async (goalData: Omit<Goal, 'id' | 'tenant_id' | 'user_id' | 'current_value' | 'status' | 'period_start' | 'period_end' | 'created_at' | 'updated_at'>) => {
      try {
        console.log('[KPI Frontend] Criando goal:', goalData)
        const response = await api.post('/api/kpi/goals', goalData)
        console.log('[KPI Frontend] Resposta da criação:', response)
        console.log('[KPI Frontend] Goal criado:', response.data)
        const newGoal = response.data
        
        if (newGoal && newGoal.id) {
          // Recarregar todos os goals para garantir sincronização
          await fetchGoals()
          toast({
            variant: 'success',
            title: 'Meta criada',
            description: 'Sua meta foi criada com sucesso!',
          })
          return newGoal
        } else {
          throw new Error('Resposta inválida do servidor')
        }
      } catch (err: any) {
        const errorMsg = err.response?.data?.detail || 'Erro ao criar meta'
        console.error('[KPI Frontend] Erro ao criar goal:', err)
        console.error('[KPI Frontend] Detalhes do erro:', err.response?.data)
        setError(errorMsg)
        toast({
          variant: 'destructive',
          title: 'Erro',
          description: errorMsg,
        })
        throw err
      }
    },
    [toast, fetchGoals]
  )

  const updateGoal = useCallback(
    async (goalId: number, goalData: Partial<Goal>) => {
      try {
        await api.put(`/api/kpi/goals/${goalId}`, goalData)
        setGoals((prev) =>
          prev.map((goal) => (goal.id === goalId ? { ...goal, ...goalData } : goal))
        )
        toast({
          variant: 'success',
          title: 'Meta atualizada',
          description: 'Sua meta foi atualizada com sucesso!',
        })
      } catch (err: any) {
        const errorMsg = err.response?.data?.detail || 'Erro ao atualizar meta'
        setError(errorMsg)
        toast({
          variant: 'destructive',
          title: 'Erro',
          description: errorMsg,
        })
        throw err
      }
    },
    [toast]
  )

  const deleteGoal = useCallback(
    async (goalId: number) => {
      try {
        await api.delete(`/api/kpi/goals/${goalId}`)
        setGoals((prev) => prev.filter((goal) => goal.id !== goalId))
        toast({
          variant: 'success',
          title: 'Meta deletada',
          description: 'Sua meta foi deletada com sucesso!',
        })
      } catch (err: any) {
        const errorMsg = err.response?.data?.detail || 'Erro ao deletar meta'
        setError(errorMsg)
        toast({
          variant: 'destructive',
          title: 'Erro',
          description: errorMsg,
        })
        throw err
      }
    },
    [toast]
  )

  const trackActivity = useCallback(
    async (metricType: MetricType, value: number, entityType?: string, entityId?: number) => {
      try {
        const response = await api.post('/api/kpi/track', {
          metric_type: metricType,
          value,
          entity_type: entityType,
          entity_id: entityId,
        })

        // Atualizar metas localmente
        await fetchGoals()

        // Verificar se alguma meta foi completada
        const completedGoals = response.data.completed_goals || []
        if (completedGoals.length > 0) {
          completedGoals.forEach((goal: { id: number; title: string }) => {
            // Disparar evento customizado para notificação de conquista
            window.dispatchEvent(
              new CustomEvent('goal-completed', {
                detail: { goalId: goal.id, goalTitle: goal.title },
              })
            )
          })
        }
      } catch (err: any) {
        console.error('Error tracking activity:', err)
        // Não mostrar erro ao usuário para não interromper o fluxo
      }
    },
    [fetchGoals]
  )

  return (
    <KPIContext.Provider
      value={{
        goals,
        loading,
        error,
        fetchGoals,
        createGoal,
        updateGoal,
        deleteGoal,
        trackActivity,
        refreshGoals,
      }}
    >
      {children}
    </KPIContext.Provider>
  )
}

export function useKPI() {
  const context = useContext(KPIContext)
  if (context === undefined) {
    throw new Error('useKPI must be used within a KPIProvider')
  }
  return context
}


