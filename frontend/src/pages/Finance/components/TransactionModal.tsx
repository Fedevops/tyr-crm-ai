import { useState, useEffect } from 'react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
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
import { Label } from '@/components/ui/label'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Textarea } from '@/components/ui/textarea'
import { Switch } from '@/components/ui/switch'
import { financeApi } from '@/lib/api'
import { useToast } from '@/components/ui/use-toast'

const transactionSchema = z.object({
  account_id: z.number().min(1, 'Conta é obrigatória'),
  description: z.string().min(1, 'Descrição é obrigatória'),
  amount: z.number().min(0.01, 'Valor deve ser maior que zero'),
  type: z.enum(['income', 'expense']),
  category: z.string().min(1, 'Categoria é obrigatória'),
  due_date: z.string().min(1, 'Data de vencimento é obrigatória'),
  payment_date: z.string().optional(),
  status: z.enum(['pending', 'paid', 'overdue']).optional(),
  is_recurring: z.boolean().optional().default(false),
  recurrence_interval: z.enum(['weekly', 'monthly', 'quarterly', 'yearly']).optional(),
  recurrence_start: z.string().optional(),
  recurrence_end: z.string().optional(),
}).refine((data) => {
  // Se é recorrente, intervalo é obrigatório
  if (data.is_recurring && !data.recurrence_interval) {
    return false
  }
  return true
}, {
  message: 'Intervalo de recorrência é obrigatório para transações recorrentes',
  path: ['recurrence_interval']
}).refine((data) => {
  // Se é recorrente, data de início é obrigatória
  if (data.is_recurring && !data.recurrence_start) {
    return false
  }
  return true
}, {
  message: 'Data de início é obrigatória para transações recorrentes',
  path: ['recurrence_start']
})

type TransactionFormData = z.infer<typeof transactionSchema>

interface TransactionModalProps {
  open: boolean
  onClose: () => void
  transaction?: any
  accounts: Array<{ id: number; name: string }>
  onSaved: () => void
}

const categories = [
  { value: 'sales', label: 'Vendas' },
  { value: 'services', label: 'Serviços' },
  { value: 'suppliers', label: 'Fornecedores' },
  { value: 'salary', label: 'Salários' },
  { value: 'rent', label: 'Aluguel' },
  { value: 'utilities', label: 'Utilidades' },
  { value: 'marketing', label: 'Marketing' },
  { value: 'taxes', label: 'Impostos' },
  { value: 'other', label: 'Outros' },
]

export function TransactionModal({ open, onClose, transaction, accounts, onSaved }: TransactionModalProps) {
  const { toast } = useToast()
  const [loading, setLoading] = useState(false)
  
  const {
    register,
    handleSubmit,
    formState: { errors },
    reset,
    setValue,
    watch,
  } = useForm<TransactionFormData>({
    resolver: zodResolver(transactionSchema),
    defaultValues: {
      type: 'income',
      category: 'sales',
    }
  })

  const type = watch('type')
  const isRecurring = watch('is_recurring')

  useEffect(() => {
    if (transaction) {
      reset({
        account_id: transaction.account_id,
        description: transaction.description,
        amount: transaction.amount,
        type: transaction.type,
        category: transaction.category,
        due_date: transaction.due_date ? new Date(transaction.due_date).toISOString().split('T')[0] : '',
        payment_date: transaction.payment_date ? new Date(transaction.payment_date).toISOString().split('T')[0] : '',
        status: transaction.status || 'pending',
        is_recurring: transaction.is_recurring || false,
        recurrence_interval: transaction.recurrence_interval || undefined,
        recurrence_start: transaction.recurrence_start ? new Date(transaction.recurrence_start).toISOString().split('T')[0] : '',
        recurrence_end: transaction.recurrence_end ? new Date(transaction.recurrence_end).toISOString().split('T')[0] : '',
      })
    } else {
      reset({
        account_id: accounts[0]?.id || 0,
        description: '',
        amount: 0,
        type: 'income',
        category: 'sales',
        due_date: new Date().toISOString().split('T')[0],
        payment_date: '',
        status: 'pending',
        is_recurring: false,
        recurrence_interval: undefined,
        recurrence_start: '',
        recurrence_end: '',
      })
    }
  }, [transaction, accounts, reset, open])

  const onSubmit = async (data: TransactionFormData) => {
    try {
      setLoading(true)
      
      // Se status for "paid" e payment_date não estiver preenchido, usar data atual
      const paymentDate = data.status === 'paid' && !data.payment_date 
        ? new Date().toISOString() 
        : data.payment_date ? new Date(data.payment_date).toISOString() : null

      const payload = {
        ...data,
        due_date: new Date(data.due_date).toISOString(),
        payment_date: paymentDate,
        status: data.status || 'pending',
        recurrence_start: data.recurrence_start ? new Date(data.recurrence_start).toISOString() : null,
        recurrence_end: data.recurrence_end ? new Date(data.recurrence_end).toISOString() : null,
      }

      if (transaction) {
        await financeApi.updateTransaction(transaction.id, payload)
        toast({
          title: 'Sucesso',
          description: 'Transação atualizada com sucesso'
        })
      } else {
        await financeApi.createTransaction(payload)
        toast({
          title: 'Sucesso',
          description: 'Transação criada com sucesso'
        })
      }

      onSaved()
      onClose()
    } catch (error: any) {
      console.error('Erro ao salvar transação:', error)
      toast({
        title: 'Erro',
        description: error.response?.data?.detail || 'Erro ao salvar transação',
        variant: 'destructive'
      })
    } finally {
      setLoading(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>
            {transaction ? 'Editar Transação' : 'Nova Transação'}
          </DialogTitle>
          <DialogDescription>
            {transaction ? 'Atualize os dados da transação' : 'Preencha os dados da nova transação'}
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="account_id">Conta *</Label>
              <Select
                value={watch('account_id')?.toString() || ''}
                onValueChange={(value) => setValue('account_id', parseInt(value))}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Selecione a conta" />
                </SelectTrigger>
                <SelectContent>
                  {accounts.map((account) => (
                    <SelectItem key={account.id} value={account.id.toString()}>
                      {account.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {errors.account_id && (
                <p className="text-sm text-red-500">{errors.account_id.message}</p>
              )}
            </div>

            <div className="space-y-2">
              <Label htmlFor="type">Tipo *</Label>
              <Select
                value={type}
                onValueChange={(value) => setValue('type', value as 'income' | 'expense')}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="income">Contas a Receber</SelectItem>
                  <SelectItem value="expense">Contas a Pagar</SelectItem>
                </SelectContent>
              </Select>
              {errors.type && (
                <p className="text-sm text-red-500">{errors.type.message}</p>
              )}
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="description">Descrição *</Label>
            <Textarea
              id="description"
              {...register('description')}
              placeholder="Ex: Venda de produto X"
            />
            {errors.description && (
              <p className="text-sm text-red-500">{errors.description.message}</p>
            )}
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="amount">Valor (R$) *</Label>
              <Input
                id="amount"
                type="number"
                step="0.01"
                {...register('amount', { valueAsNumber: true })}
                placeholder="0.00"
              />
              {errors.amount && (
                <p className="text-sm text-red-500">{errors.amount.message}</p>
              )}
            </div>

            <div className="space-y-2">
              <Label htmlFor="category">Categoria *</Label>
              <Select
                value={watch('category') || ''}
                onValueChange={(value) => setValue('category', value)}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Selecione a categoria" />
                </SelectTrigger>
                <SelectContent>
                  {categories.map((cat) => (
                    <SelectItem key={cat.value} value={cat.value}>
                      {cat.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {errors.category && (
                <p className="text-sm text-red-500">{errors.category.message}</p>
              )}
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="due_date">Data de Vencimento *</Label>
              <Input
                id="due_date"
                type="date"
                {...register('due_date')}
              />
              {errors.due_date && (
                <p className="text-sm text-red-500">{errors.due_date.message}</p>
              )}
            </div>

            <div className="space-y-2">
              <Label htmlFor="payment_date">Data de Pagamento (opcional)</Label>
              <Input
                id="payment_date"
                type="date"
                {...register('payment_date')}
              />
              {errors.payment_date && (
                <p className="text-sm text-red-500">{errors.payment_date.message}</p>
              )}
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="status">Status *</Label>
            <Select
              value={watch('status') || 'pending'}
              onValueChange={(value) => setValue('status', value as 'pending' | 'paid' | 'overdue')}
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="pending">Pendente</SelectItem>
                <SelectItem value="paid">Paga</SelectItem>
                <SelectItem value="overdue">Vencida</SelectItem>
              </SelectContent>
            </Select>
            {errors.status && (
              <p className="text-sm text-red-500">{errors.status.message}</p>
            )}
            <p className="text-xs text-muted-foreground">
              {watch('status') === 'paid' && 'Ao marcar como paga, a data de pagamento será atualizada automaticamente se não estiver preenchida.'}
            </p>
          </div>

          {/* Seção de Recorrência */}
          <div className="space-y-4 pt-4 border-t">
            <div className="flex items-center space-x-2">
              <Switch
                id="is_recurring"
                checked={isRecurring}
                onCheckedChange={(checked) => setValue('is_recurring', checked)}
              />
              <Label htmlFor="is_recurring" className="cursor-pointer font-medium">
                Transação Recorrente
              </Label>
            </div>

            {isRecurring && (
              <div className="space-y-4 pl-6 border-l-2">
                <div className="space-y-2">
                  <Label htmlFor="recurrence_interval">Intervalo de Recorrência *</Label>
                  <Select
                    value={watch('recurrence_interval') || ''}
                    onValueChange={(value) => setValue('recurrence_interval', value as 'weekly' | 'monthly' | 'quarterly' | 'yearly')}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Selecione o intervalo" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="weekly">Semanal</SelectItem>
                      <SelectItem value="monthly">Mensal</SelectItem>
                      <SelectItem value="quarterly">Trimestral</SelectItem>
                      <SelectItem value="yearly">Anual</SelectItem>
                    </SelectContent>
                  </Select>
                  {errors.recurrence_interval && (
                    <p className="text-sm text-red-500">{errors.recurrence_interval.message}</p>
                  )}
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label htmlFor="recurrence_start">Data de Início *</Label>
                    <Input
                      id="recurrence_start"
                      type="date"
                      {...register('recurrence_start')}
                    />
                    {errors.recurrence_start && (
                      <p className="text-sm text-red-500">{errors.recurrence_start.message}</p>
                    )}
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="recurrence_end">Data de Término (opcional)</Label>
                    <Input
                      id="recurrence_end"
                      type="date"
                      {...register('recurrence_end')}
                    />
                    {errors.recurrence_end && (
                      <p className="text-sm text-red-500">{errors.recurrence_end.message}</p>
                    )}
                  </div>
                </div>
              </div>
            )}
          </div>

          <DialogFooter>
            <Button type="button" variant="outline" onClick={onClose} disabled={loading}>
              Cancelar
            </Button>
            <Button type="submit" disabled={loading}>
              {loading ? 'Salvando...' : transaction ? 'Atualizar' : 'Criar'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}

