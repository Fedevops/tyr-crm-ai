import { useState, useEffect } from 'react'
import { financeApi } from '@/lib/api'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Input } from '@/components/ui/input'
import { Edit, Trash2, CheckCircle2, Repeat } from 'lucide-react'
import { useToast } from '@/components/ui/use-toast'
import { format } from 'date-fns'
import { ptBR } from 'date-fns/locale'

const formatCurrency = (value: number) => {
  return new Intl.NumberFormat('pt-BR', {
    style: 'currency',
    currency: 'BRL'
  }).format(value)
}

interface Transaction {
  id: number
  description: string
  amount: number
  type: 'income' | 'expense'
  status: 'pending' | 'paid' | 'overdue'
  category: string
  due_date: string
  payment_date?: string
  account_name?: string
  order_number?: string
  is_recurring?: boolean
  recurrence_interval?: string
}

interface TransactionListProps {
  accountId?: number | null
  filters?: {
    type?: 'income' | 'expense'
    status?: 'pending' | 'paid' | 'overdue'
    category?: string
  }
  onEdit?: (transaction: Transaction) => void
  onRefresh?: () => void
}

export function TransactionList({ accountId, filters = {}, onEdit, onRefresh }: TransactionListProps) {
  const { toast } = useToast()
  const [transactions, setTransactions] = useState<Transaction[]>([])
  const [loading, setLoading] = useState(true)
  const [localFilters, setLocalFilters] = useState({
    type: filters.type || undefined as 'income' | 'expense' | undefined,
    status: filters.status || undefined as 'pending' | 'paid' | 'overdue' | undefined,
  })

  const loadTransactions = async () => {
    try {
      setLoading(true)
      const response = await financeApi.getTransactions({
        account_id: accountId || undefined,
        type: localFilters.type,
        status: localFilters.status,
        category: filters.category,
      })
      setTransactions(response.data)
    } catch (error: any) {
      console.error('Erro ao carregar transações:', error)
      toast({
        title: 'Erro',
        description: error.response?.data?.detail || 'Erro ao carregar transações',
        variant: 'destructive'
      })
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    loadTransactions()
  }, [accountId, localFilters.type, localFilters.status, filters.category])

  const handleMarkAsPaid = async (transactionId: number) => {
    try {
      await financeApi.markTransactionPaid(transactionId)
      toast({
        title: 'Sucesso',
        description: 'Transação marcada como paga'
      })
      loadTransactions()
      onRefresh?.()
    } catch (error: any) {
      toast({
        title: 'Erro',
        description: error.response?.data?.detail || 'Erro ao marcar transação como paga',
        variant: 'destructive'
      })
    }
  }

  const handleDelete = async (transactionId: number) => {
    if (!confirm('Tem certeza que deseja excluir esta transação?')) {
      return
    }

    try {
      await financeApi.deleteTransaction(transactionId)
      toast({
        title: 'Sucesso',
        description: 'Transação excluída'
      })
      loadTransactions()
      onRefresh?.()
    } catch (error: any) {
      toast({
        title: 'Erro',
        description: error.response?.data?.detail || 'Erro ao excluir transação',
        variant: 'destructive'
      })
    }
  }

  const getStatusBadge = (status: string) => {
    const variants: Record<string, { variant: 'default' | 'secondary' | 'destructive' | 'outline', label: string }> = {
      pending: { variant: 'secondary', label: 'Pendente' },
      paid: { variant: 'default', label: 'Paga' },
      overdue: { variant: 'destructive', label: 'Vencida' },
    }
    const config = variants[status] || variants.pending
    return <Badge variant={config.variant}>{config.label}</Badge>
  }

  const getCategoryLabel = (category: string) => {
    const labels: Record<string, string> = {
      sales: 'Vendas',
      services: 'Serviços',
      suppliers: 'Fornecedores',
      salary: 'Salários',
      rent: 'Aluguel',
      utilities: 'Utilidades',
      marketing: 'Marketing',
      taxes: 'Impostos',
      other: 'Outros',
    }
    return labels[category] || category
  }

  if (loading) {
    return <div className="text-center py-8">Carregando transações...</div>
  }

  return (
    <div className="space-y-4">
      {/* Filtros */}
      <div className="flex flex-wrap gap-2">
        <Select
          value={localFilters.type || 'all'}
          onValueChange={(value) => setLocalFilters({ ...localFilters, type: value === 'all' ? undefined : value as 'income' | 'expense' })}
        >
          <SelectTrigger className="w-full sm:w-[180px]">
            <SelectValue placeholder="Tipo" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Todos os tipos</SelectItem>
            <SelectItem value="income">Receber</SelectItem>
            <SelectItem value="expense">Pagar</SelectItem>
          </SelectContent>
        </Select>

        <Select
          value={localFilters.status || 'all'}
          onValueChange={(value) => setLocalFilters({ ...localFilters, status: value === 'all' ? undefined : value as 'pending' | 'paid' | 'overdue' })}
        >
          <SelectTrigger className="w-full sm:w-[180px]">
            <SelectValue placeholder="Status" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Todos os status</SelectItem>
            <SelectItem value="pending">Pendente</SelectItem>
            <SelectItem value="paid">Paga</SelectItem>
            <SelectItem value="overdue">Vencida</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {/* Tabela */}
      <div className="rounded-md border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Descrição</TableHead>
              <TableHead>Tipo</TableHead>
              <TableHead>Categoria</TableHead>
              <TableHead>Valor</TableHead>
              <TableHead>Vencimento</TableHead>
              <TableHead>Status</TableHead>
              <TableHead>Conta</TableHead>
              <TableHead className="text-right">Ações</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {transactions.length === 0 ? (
              <TableRow>
                <TableCell colSpan={8} className="text-center py-8 text-muted-foreground">
                  Nenhuma transação encontrada
                </TableCell>
              </TableRow>
            ) : (
              transactions.map((transaction) => (
                <TableRow key={transaction.id}>
                  <TableCell className="font-medium">
                    <div className="flex items-center gap-2">
                      {transaction.description}
                      {transaction.is_recurring && (
                        <Badge variant="outline" className="text-xs">
                          <Repeat className="h-3 w-3 mr-1" />
                          Recorrente
                        </Badge>
                      )}
                    </div>
                  </TableCell>
                  <TableCell>
                    <Badge variant={transaction.type === 'income' ? 'default' : 'destructive'}>
                      {transaction.type === 'income' ? 'Receber' : 'Pagar'}
                    </Badge>
                  </TableCell>
                  <TableCell>{getCategoryLabel(transaction.category)}</TableCell>
                  <TableCell className={transaction.type === 'income' ? 'text-green-600 font-semibold' : 'text-red-600 font-semibold'}>
                    {transaction.type === 'income' ? '+' : '-'} {formatCurrency(transaction.amount)}
                  </TableCell>
                  <TableCell>
                    {format(new Date(transaction.due_date), "dd/MM/yyyy", { locale: ptBR })}
                  </TableCell>
                  <TableCell>
                    <Select
                      value={transaction.status}
                      onValueChange={async (value) => {
                        try {
                          await financeApi.updateTransactionStatus(transaction.id, value)
                          toast({
                            title: 'Sucesso',
                            description: 'Status atualizado com sucesso'
                          })
                          loadTransactions()
                          onRefresh?.()
                        } catch (error: any) {
                          toast({
                            title: 'Erro',
                            description: error.response?.data?.detail || 'Erro ao atualizar status',
                            variant: 'destructive'
                          })
                        }
                      }}
                    >
                      <SelectTrigger className="w-auto h-auto p-0 border-none shadow-none hover:opacity-80 cursor-pointer bg-transparent hover:bg-transparent focus:ring-0 focus:ring-offset-0">
                        <SelectValue>
                          {getStatusBadge(transaction.status)}
                        </SelectValue>
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="pending">Pendente</SelectItem>
                        <SelectItem value="paid">Paga</SelectItem>
                        <SelectItem value="overdue">Vencida</SelectItem>
                      </SelectContent>
                    </Select>
                  </TableCell>
                  <TableCell>{transaction.account_name || '-'}</TableCell>
                  <TableCell className="text-right">
                    <div className="flex justify-end gap-2">
                      {transaction.status !== 'paid' && (
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => handleMarkAsPaid(transaction.id)}
                          title="Marcar como paga"
                        >
                          <CheckCircle2 className="h-4 w-4 text-green-600" />
                        </Button>
                      )}
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => onEdit?.(transaction)}
                        title="Editar"
                      >
                        <Edit className="h-4 w-4" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => handleDelete(transaction.id)}
                        title="Excluir"
                      >
                        <Trash2 className="h-4 w-4 text-red-600" />
                      </Button>
                    </div>
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>
    </div>
  )
}

