import { useState, useEffect } from 'react'
import { useTranslation } from 'react-i18next'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { 
  Wallet, TrendingUp, TrendingDown, Calendar, DollarSign,
  Plus, Filter, ArrowUpRight, ArrowDownRight, Edit, Trash2, Building2, FileDown
} from 'lucide-react'
import { financeApi } from '@/lib/api'
import { TyrLoadingSpinner } from '@/components/TyrLoadingSpinner'
import { TransactionList } from './Finance/components/TransactionList'
import { TransactionModal } from './Finance/components/TransactionModal'
import { AccountModal } from './Finance/components/AccountModal'
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
  Line,
  ComposedChart
} from 'recharts'
import { useToast } from '@/components/ui/use-toast'

const formatCurrency = (value: number) => {
  return new Intl.NumberFormat('pt-BR', {
    style: 'currency',
    currency: 'BRL'
  }).format(value)
}

interface FinanceStats {
  month: number
  year: number
  total_to_receive: number
  total_to_pay: number
  current_month_to_receive?: number
  current_month_to_pay?: number
  total_received: number
  total_paid: number
  overdue_today: number
  cash_flow: Array<{
    month: string
    income: number
    expense: number
    balance: number
  }>
}

interface FinancialAccount {
  id: number
  name: string
  description?: string
  is_active: boolean
  balance: number
}

export function Finance() {
  const { t } = useTranslation()
  const { toast } = useToast()
  const [loading, setLoading] = useState(true)
  const [stats, setStats] = useState<FinanceStats | null>(null)
  const [accounts, setAccounts] = useState<FinancialAccount[]>([])
  const [selectedAccount, setSelectedAccount] = useState<number | null>(null)
  const [isTransactionModalOpen, setIsTransactionModalOpen] = useState(false)
  const [editingTransaction, setEditingTransaction] = useState<any>(null)
  const [isAccountModalOpen, setIsAccountModalOpen] = useState(false)
  const [editingAccount, setEditingAccount] = useState<FinancialAccount | null>(null)
  const [filters, setFilters] = useState<{
    type?: 'income' | 'expense'
    status?: 'pending' | 'paid' | 'overdue'
    category?: string
  }>({})
  const [dateRange, setDateRange] = useState<{
    start_date: string
    end_date: string
  }>({
    start_date: new Date(new Date().getFullYear(), new Date().getMonth(), 1).toISOString().split('T')[0],
    end_date: new Date(new Date().getFullYear(), new Date().getMonth() + 6, 0).toISOString().split('T')[0]
  })

  const loadData = async () => {
    try {
      setLoading(true)
      const [statsResponse, accountsResponse] = await Promise.all([
        financeApi.getStats({
          start_date: dateRange.start_date,
          end_date: dateRange.end_date
        }),
        financeApi.getAccounts(true)
      ])
      
      setStats(statsResponse.data)
      setAccounts(accountsResponse.data)
      
      // Selecionar primeira conta por padrão
      if (accountsResponse.data.length > 0 && !selectedAccount) {
        setSelectedAccount(accountsResponse.data[0].id)
      }
    } catch (error: any) {
      console.error('Erro ao carregar dados financeiros:', error)
      toast({
        title: 'Erro',
        description: error.response?.data?.detail || 'Erro ao carregar dados financeiros',
        variant: 'destructive'
      })
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    loadData()
  }, [dateRange.start_date, dateRange.end_date])

  const handleCreateTransaction = () => {
    setEditingTransaction(null)
    setIsTransactionModalOpen(true)
  }

  const handleEditTransaction = (transaction: any) => {
    setEditingTransaction(transaction)
    setIsTransactionModalOpen(true)
  }

  const handleTransactionSaved = () => {
    setIsTransactionModalOpen(false)
    setEditingTransaction(null)
    loadData()
  }

  const handleCreateAccount = () => {
    setEditingAccount(null)
    setIsAccountModalOpen(true)
  }

  const handleEditAccount = (account: FinancialAccount) => {
    setEditingAccount(account)
    setIsAccountModalOpen(true)
  }

  const handleAccountSaved = () => {
    setIsAccountModalOpen(false)
    setEditingAccount(null)
    loadData()
  }

  const handleDeleteAccount = async (accountId: number) => {
    if (!confirm('Tem certeza que deseja excluir esta conta? Esta ação não pode ser desfeita.')) {
      return
    }

    try {
      await financeApi.deleteAccount(accountId)
      toast({
        title: 'Sucesso',
        description: 'Conta excluída com sucesso'
      })
      loadData()
    } catch (error: any) {
      toast({
        title: 'Erro',
        description: error.response?.data?.detail || 'Erro ao excluir conta',
        variant: 'destructive'
      })
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center h-screen">
        <TyrLoadingSpinner />
      </div>
    )
  }

  const totalBalance = accounts.reduce((sum, acc) => sum + acc.balance, 0)

  return (
    <div className="space-y-6 p-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold">Gestão Financeira</h1>
          <p className="text-muted-foreground mt-1">
            Controle de contas a pagar e receber
          </p>
        </div>
        <div className="flex gap-2">
          <Button 
            variant="outline" 
            onClick={async () => {
              try {
                const now = new Date()
                const response = await financeApi.exportMonthlyReport(now.getMonth() + 1, now.getFullYear())
                const blob = new Blob([response.data], { type: 'application/pdf' })
                const url = window.URL.createObjectURL(blob)
                const link = document.createElement('a')
                link.href = url
                link.download = `relatorio_financeiro_${now.getMonth() + 1}_${now.getFullYear()}.pdf`
                document.body.appendChild(link)
                link.click()
                document.body.removeChild(link)
                window.URL.revokeObjectURL(url)
                toast({
                  title: 'Sucesso',
                  description: 'Relatório exportado com sucesso'
                })
              } catch (error: any) {
                toast({
                  title: 'Erro',
                  description: error.response?.data?.detail || 'Erro ao exportar relatório',
                  variant: 'destructive'
                })
              }
            }}
          >
            <FileDown className="h-4 w-4 mr-2" />
            Exportar PDF
          </Button>
          <Button variant="outline" onClick={handleCreateAccount}>
            <Building2 className="h-4 w-4 mr-2" />
            Nova Conta
          </Button>
          <Button onClick={handleCreateTransaction}>
            <Plus className="h-4 w-4 mr-2" />
            Nova Transação
          </Button>
        </div>
      </div>

      {/* Cards de Estatísticas */}
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Saldo em Conta</CardTitle>
            <Wallet className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              {formatCurrency(totalBalance)}
            </div>
            <p className="text-xs text-muted-foreground mt-1">
              {accounts.length} conta{accounts.length !== 1 ? 's' : ''} ativa{accounts.length !== 1 ? 's' : ''}
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">A Receber (Mês)</CardTitle>
            <TrendingUp className="h-4 w-4 text-green-600" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-green-600">
              {formatCurrency(stats?.current_month_to_receive || stats?.total_to_receive || 0)}
            </div>
            <p className="text-xs text-muted-foreground mt-1">
              {stats?.overdue_today || 0} vencida{stats?.overdue_today !== 1 ? 's' : ''} hoje
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">A Pagar (Mês)</CardTitle>
            <TrendingDown className="h-4 w-4 text-red-600" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-red-600">
              {formatCurrency(stats?.current_month_to_pay || stats?.total_to_pay || 0)}
            </div>
            <p className="text-xs text-muted-foreground mt-1">
              Vencimentos do mês
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Fluxo do Mês</CardTitle>
            <DollarSign className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              {formatCurrency((stats?.total_received || 0) - (stats?.total_paid || 0))}
            </div>
            <div className="flex items-center gap-2 mt-1">
              <span className="text-xs text-green-600">
                <ArrowUpRight className="h-3 w-3 inline" /> {formatCurrency(stats?.total_received || 0)}
              </span>
              <span className="text-xs text-red-600">
                <ArrowDownRight className="h-3 w-3 inline" /> {formatCurrency(stats?.total_paid || 0)}
              </span>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Filtro de Data Range */}
      <Card>
        <CardHeader>
          <CardTitle>Filtro de Período</CardTitle>
          <CardDescription>
            Selecione o período para visualizar as transações no gráfico
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex items-center gap-4">
            <div className="flex-1 space-y-2">
              <label className="text-sm font-medium">Data Inicial</label>
              <input
                type="date"
                value={dateRange.start_date}
                onChange={(e) => setDateRange({ ...dateRange, start_date: e.target.value })}
                className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
              />
            </div>
            <div className="flex-1 space-y-2">
              <label className="text-sm font-medium">Data Final</label>
              <input
                type="date"
                value={dateRange.end_date}
                onChange={(e) => setDateRange({ ...dateRange, end_date: e.target.value })}
                className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
              />
            </div>
            <div className="flex items-end">
              <Button
                variant="outline"
                onClick={() => {
                  const today = new Date()
                  const sixMonthsLater = new Date(today.getFullYear(), today.getMonth() + 6, 0)
                  setDateRange({
                    start_date: new Date(today.getFullYear(), today.getMonth(), 1).toISOString().split('T')[0],
                    end_date: sixMonthsLater.toISOString().split('T')[0]
                  })
                }}
              >
                <Calendar className="h-4 w-4 mr-2" />
                Resetar
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Gráfico de Fluxo de Caixa */}
      {stats?.cash_flow && stats.cash_flow.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle>Fluxo de Caixa</CardTitle>
            <CardDescription>
              Entradas vs Saídas por mês (incluindo transações futuras)
            </CardDescription>
          </CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={300}>
              <ComposedChart data={stats.cash_flow}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis 
                  dataKey="month" 
                  tick={{ fontSize: 12 }}
                  angle={-45}
                  textAnchor="end"
                  height={80}
                />
                <YAxis 
                  yAxisId="left"
                  tick={{ fontSize: 12 }}
                  tickFormatter={(value) => `R$ ${(value / 1000).toFixed(0)}k`}
                />
                <YAxis 
                  yAxisId="right"
                  orientation="right"
                  tick={{ fontSize: 12 }}
                  tickFormatter={(value) => `R$ ${(value / 1000).toFixed(0)}k`}
                />
                <Tooltip 
                  formatter={(value: number, name: string) => {
                    if (name === 'Saldo') {
                      return [formatCurrency(value), name]
                    }
                    return [formatCurrency(value), name]
                  }}
                  labelStyle={{ color: '#000' }}
                  contentStyle={{ backgroundColor: '#fff', border: '1px solid #ccc' }}
                />
                <Legend />
                <Bar yAxisId="left" dataKey="income" fill="#22c55e" name="Entradas" />
                <Bar yAxisId="left" dataKey="expense" fill="#ef4444" name="Saídas" />
                <Line 
                  yAxisId="right"
                  type="monotone" 
                  dataKey="balance" 
                  stroke="#3b82f6" 
                  strokeWidth={2}
                  name="Saldo"
                  dot={{ fill: '#3b82f6', r: 4 }}
                  activeDot={{ r: 6 }}
                />
              </ComposedChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
      )}

      {/* Lista de Contas Financeiras */}
      <Card>
        <CardHeader>
          <CardTitle>Contas Financeiras</CardTitle>
          <CardDescription>
            Gerencie suas contas e caixas financeiras
          </CardDescription>
        </CardHeader>
        <CardContent>
          {accounts.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground">
              <Building2 className="h-12 w-12 mx-auto mb-4 opacity-50" />
              <p>Nenhuma conta financeira cadastrada</p>
              <Button 
                variant="outline" 
                className="mt-4" 
                onClick={handleCreateAccount}
              >
                <Plus className="h-4 w-4 mr-2" />
                Criar Primeira Conta
              </Button>
            </div>
          ) : (
            <div className="space-y-2">
              {accounts.map((account) => (
                <div
                  key={account.id}
                  className={`flex items-center justify-between p-4 border rounded-lg ${
                    selectedAccount === account.id ? 'border-primary bg-primary/5' : ''
                  }`}
                >
                  <div className="flex-1">
                    <div className="flex items-center gap-2">
                      <h3 className="font-semibold">{account.name}</h3>
                      {!account.is_active && (
                        <Badge variant="secondary">Inativa</Badge>
                      )}
                    </div>
                    {account.description && (
                      <p className="text-sm text-muted-foreground mt-1">
                        {account.description}
                      </p>
                    )}
                    <div className="flex items-center gap-4 mt-2">
                      <span className="text-sm font-medium">
                        Saldo: <span className={account.balance >= 0 ? 'text-green-600' : 'text-red-600'}>
                          {formatCurrency(account.balance)}
                        </span>
                      </span>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => setSelectedAccount(account.id)}
                      className={selectedAccount === account.id ? 'bg-primary text-primary-foreground' : ''}
                    >
                      Selecionar
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => handleEditAccount(account)}
                    >
                      <Edit className="h-4 w-4" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => handleDeleteAccount(account.id)}
                    >
                      <Trash2 className="h-4 w-4 text-red-600" />
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Lista de Transações */}
      <Card>
        <CardHeader>
          <CardTitle>Transações</CardTitle>
          <CardDescription>
            Contas a pagar e receber
            {selectedAccount && (
              <span className="ml-2">
                - {accounts.find(a => a.id === selectedAccount)?.name}
              </span>
            )}
          </CardDescription>
        </CardHeader>
        <CardContent>
          <TransactionList
            accountId={selectedAccount}
            filters={filters}
            onEdit={handleEditTransaction}
            onRefresh={loadData}
          />
        </CardContent>
      </Card>

      {/* Modal de Conta */}
      <AccountModal
        open={isAccountModalOpen}
        onClose={() => {
          setIsAccountModalOpen(false)
          setEditingAccount(null)
        }}
        account={editingAccount || undefined}
        onSaved={handleAccountSaved}
      />

      {/* Modal de Transação */}
      <TransactionModal
        open={isTransactionModalOpen}
        onClose={() => {
          setIsTransactionModalOpen(false)
          setEditingTransaction(null)
        }}
        transaction={editingTransaction}
        accounts={accounts}
        onSaved={handleTransactionSaved}
      />
    </div>
  )
}

