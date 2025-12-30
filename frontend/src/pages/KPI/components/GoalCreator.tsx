import { useState, useEffect } from 'react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { useKPI, Goal, MetricType, GoalPeriod } from '@/contexts/KPIContext'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Switch } from '@/components/ui/switch'
import { Loader2 } from 'lucide-react'

const goalSchema = z.object({
  title: z.string().min(1, 'Título é obrigatório'),
  metric_type: z.enum(['tasks_completed', 'leads_created', 'revenue_generated', 'calls_made']),
  target_value: z.number().min(0.01, 'Valor da meta deve ser maior que zero'),
  period: z.enum(['monthly', 'weekly']),
  is_visible_on_wallboard: z.boolean().default(false),
})

type GoalFormData = z.infer<typeof goalSchema>

interface GoalCreatorProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  editingGoal?: Goal | null
  onSuccess?: () => void
}

export function GoalCreator({
  open,
  onOpenChange,
  editingGoal,
  onSuccess,
}: GoalCreatorProps) {
  const { createGoal, updateGoal } = useKPI()
  const [isSubmitting, setIsSubmitting] = useState(false)

  const {
    register,
    handleSubmit,
    formState: { errors },
    reset,
    setValue,
    watch,
  } = useForm<GoalFormData>({
    resolver: zodResolver(goalSchema),
    defaultValues: {
      title: '',
      metric_type: 'tasks_completed',
      target_value: 0,
      period: 'monthly',
      is_visible_on_wallboard: false,
    },
  })

  const metricType = watch('metric_type')
  const period = watch('period')
  const isVisibleOnWallboard = watch('is_visible_on_wallboard')

  useEffect(() => {
    if (editingGoal) {
      reset({
        title: editingGoal.title,
        metric_type: editingGoal.metric_type,
        target_value: editingGoal.target_value,
        period: editingGoal.period,
        is_visible_on_wallboard: editingGoal.is_visible_on_wallboard,
      })
    } else {
      reset({
        title: '',
        metric_type: 'tasks_completed',
        target_value: 0,
        period: 'monthly',
        is_visible_on_wallboard: false,
      })
    }
  }, [editingGoal, open, reset])

  const onSubmit = async (data: GoalFormData) => {
    setIsSubmitting(true)
    try {
      if (editingGoal) {
        await updateGoal(editingGoal.id, data)
      } else {
        await createGoal(data)
      }
      onSuccess?.()
      onOpenChange(false)
    } catch (error) {
      console.error('Error saving goal:', error)
    } finally {
      setIsSubmitting(false)
    }
  }

  const getMetricLabel = (type: MetricType) => {
    const labels: Record<MetricType, string> = {
      tasks_completed: 'Tarefas Completadas',
      leads_created: 'Leads Criados',
      revenue_generated: 'Receita Gerada',
      calls_made: 'Chamadas Realizadas',
    }
    return labels[type]
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>
            {editingGoal ? 'Editar Meta' : 'Criar Nova Meta'}
          </DialogTitle>
          <DialogDescription>
            {editingGoal
              ? 'Atualize os detalhes da sua meta de performance'
              : 'Defina uma nova meta para acompanhar seu desempenho'}
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
          <div className="space-y-2">
            <label htmlFor="title" className="text-sm font-medium">
              Título da Meta *
            </label>
            <Input
              id="title"
              {...register('title')}
              placeholder="Ex: Completar 100 tarefas este mês"
            />
            {errors.title && (
              <p className="text-sm text-destructive">{errors.title.message}</p>
            )}
          </div>

          <div className="space-y-2">
            <label htmlFor="metric_type" className="text-sm font-medium">
              O que você quer medir? *
            </label>
            <Select
              value={metricType}
              onValueChange={(value) => setValue('metric_type', value as MetricType)}
            >
              <SelectTrigger>
                <SelectValue placeholder="Selecione a métrica" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="tasks_completed">
                  {getMetricLabel('tasks_completed')}
                </SelectItem>
                <SelectItem value="leads_created">
                  {getMetricLabel('leads_created')}
                </SelectItem>
                <SelectItem value="revenue_generated">
                  {getMetricLabel('revenue_generated')}
                </SelectItem>
                <SelectItem value="calls_made">
                  {getMetricLabel('calls_made')}
                </SelectItem>
              </SelectContent>
            </Select>
            {errors.metric_type && (
              <p className="text-sm text-destructive">
                {errors.metric_type.message}
              </p>
            )}
          </div>

          <div className="space-y-2">
            <label htmlFor="target_value" className="text-sm font-medium">
              Qual o valor da meta? *
            </label>
            <Input
              id="target_value"
              type="number"
              step={metricType === 'revenue_generated' ? '0.01' : '1'}
              {...register('target_value', { valueAsNumber: true })}
              placeholder={
                metricType === 'revenue_generated' ? 'Ex: 50000' : 'Ex: 100'
              }
            />
            {errors.target_value && (
              <p className="text-sm text-destructive">
                {errors.target_value.message}
              </p>
            )}
            <p className="text-xs text-muted-foreground">
              {metricType === 'revenue_generated'
                ? 'Valor em reais (R$)'
                : 'Quantidade numérica'}
            </p>
          </div>

          <div className="space-y-2">
            <label htmlFor="period" className="text-sm font-medium">
              Período *
            </label>
            <Select
              value={period}
              onValueChange={(value) => setValue('period', value as GoalPeriod)}
            >
              <SelectTrigger>
                <SelectValue placeholder="Selecione o período" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="monthly">Mensal</SelectItem>
                <SelectItem value="weekly">Semanal</SelectItem>
              </SelectContent>
            </Select>
            {errors.period && (
              <p className="text-sm text-destructive">{errors.period.message}</p>
            )}
          </div>

          <div className="flex items-center justify-between">
            <div className="space-y-0.5">
              <label htmlFor="wallboard" className="text-sm font-medium">
                Visível no Wallboard?
              </label>
              <p className="text-xs text-muted-foreground">
                Exibir esta meta em painéis públicos
              </p>
            </div>
            <Switch
              id="wallboard"
              checked={isVisibleOnWallboard}
              onCheckedChange={(checked) =>
                setValue('is_visible_on_wallboard', checked)
              }
            />
          </div>

          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => onOpenChange(false)}
              disabled={isSubmitting}
            >
              Cancelar
            </Button>
            <Button type="submit" disabled={isSubmitting}>
              {isSubmitting ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  Salvando...
                </>
              ) : editingGoal ? (
                'Salvar Alterações'
              ) : (
                'Criar Meta'
              )}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}



