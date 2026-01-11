import { useState, useEffect } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
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
import { TyrLoadingSpinner } from '@/components/TyrLoadingSpinner'
import { Search, DollarSign, Calendar } from 'lucide-react'
import { partnerPortalApi } from '@/lib/api'

const formatCurrency = (value: number) => {
  return new Intl.NumberFormat('pt-BR', {
    style: 'currency',
    currency: 'BRL'
  }).format(value)
}

const formatDate = (dateString: string | null) => {
  if (!dateString) return '-'
  const date = new Date(dateString)
  return date.toLocaleDateString('pt-BR', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
  })
}

interface Commission {
  id: number
  customer_id: number
  customer_name: string | null
  valor_pago: number
  valor_venda: number | null
  porcentagem_aplicada: number | null
  data_pagamento: string | null
  status_comissao: string
  periodo_referencia: string | null
  created_at: string
}

interface FinancialStatement {
  items: Commission[]
  total: number
  skip: number
  limit: number
  summary: {
    total_pendente: number
    total_pago: number
    saldo_total: number
  }
}

export function PartnerFinancialStatement() {
  const [loading, setLoading] = useState(true)
  const [statement, setStatement] = useState<FinancialStatement | null>(null)
  const [filters, setFilters] = useState({
    start_date: '',
    end_date: '',
    status: 'all',
  })
  const [currentPage, setCurrentPage] = useState(0)
  const itemsPerPage = 20

  useEffect(() => {
    loadStatement()
  }, [currentPage])

  const loadStatement = async () => {
    try {
      setLoading(true)
      const params: any = {
        skip: currentPage * itemsPerPage,
        limit: itemsPerPage,
      }
      
      if (filters.start_date) params.start_date = filters.start_date
      if (filters.end_date) params.end_date = filters.end_date
      if (filters.status) params.status = filters.status

      const response = await partnerPortalApi.getFinancialStatement(params)
      setStatement(response.data)
    } catch (err: any) {
      console.error('Erro ao carregar extrato:', err)
    } finally {
      setLoading(false)
    }
  }

  const handleFilterChange = (field: string, value: string) => {
    setFilters({ ...filters, [field]: value })
  }

  const handleApplyFilters = () => {
    setCurrentPage(0)
    loadStatement()
  }

  const handleClearFilters = () => {
    setFilters({
      start_date: '',
      end_date: '',
      status: 'all',
    })
    setCurrentPage(0)
    setTimeout(() => {
      loadStatement()
    }, 100)
  }

  const getStatusBadge = (status: string) => {
    if (status === 'pago') {
      return (
        <span className="px-2 py-1 rounded-full text-xs font-medium bg-green-100 text-green-800">
          Pago
        </span>
      )
    }
    if (status === 'pendente') {
      return (
        <span className="px-2 py-1 rounded-full text-xs font-medium bg-orange-100 text-orange-800">
          Pendente
        </span>
      )
    }
    return (
      <span className="px-2 py-1 rounded-full text-xs font-medium bg-gray-100 text-gray-800">
        {status}
      </span>
    )
  }

  const totalPages = statement ? Math.ceil(statement.total / itemsPerPage) : 0

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold">Extrato Financeiro</h1>
        <p className="text-gray-600 mt-2">Histórico de comissões e pagamentos</p>
      </div>

      {/* Resumo */}
      {statement && (
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Comissões Pendentes</CardTitle>
              <DollarSign className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-orange-600">
                {formatCurrency(statement.summary.total_pendente)}
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Comissões Pagas</CardTitle>
              <DollarSign className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-green-600">
                {formatCurrency(statement.summary.total_pago)}
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Saldo Total</CardTitle>
              <DollarSign className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">
                {formatCurrency(statement.summary.saldo_total)}
              </div>
            </CardContent>
          </Card>
        </div>
      )}

      {/* Filtros */}
      <Card>
        <CardHeader>
          <CardTitle>Filtros</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
            <div>
              <Label htmlFor="start_date">Data Inicial</Label>
              <Input
                id="start_date"
                type="date"
                value={filters.start_date}
                onChange={(e) => handleFilterChange('start_date', e.target.value)}
              />
            </div>
            <div>
              <Label htmlFor="end_date">Data Final</Label>
              <Input
                id="end_date"
                type="date"
                value={filters.end_date}
                onChange={(e) => handleFilterChange('end_date', e.target.value)}
              />
            </div>
            <div>
              <Label htmlFor="status">Status</Label>
              <Select
                value={filters.status}
                onValueChange={(value) => handleFilterChange('status', value)}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Todos" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Todos</SelectItem>
                  <SelectItem value="pendente">Pendente</SelectItem>
                  <SelectItem value="pago">Pago</SelectItem>
                  <SelectItem value="cancelado">Cancelado</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="flex items-end gap-2">
              <Button onClick={handleApplyFilters} className="flex-1">
                <Search className="h-4 w-4 mr-2" />
                Filtrar
              </Button>
              <Button variant="outline" onClick={handleClearFilters}>
                Limpar
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Tabela */}
      {loading ? (
        <div className="flex items-center justify-center h-64">
          <TyrLoadingSpinner />
        </div>
      ) : (
        <Card>
          <CardContent className="pt-6">
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr className="border-b">
                    <th className="text-left p-2">Cliente</th>
                    <th className="text-left p-2">Valor</th>
                    <th className="text-left p-2">Data Pagamento</th>
                    <th className="text-left p-2">Status</th>
                    <th className="text-left p-2">Período</th>
                    <th className="text-left p-2">Data Criação</th>
                  </tr>
                </thead>
                <tbody>
                  {statement?.items.map((commission) => (
                    <tr key={commission.id} className="border-b hover:bg-gray-50">
                      <td className="p-2 font-medium">
                        {commission.customer_name || `Cliente #${commission.customer_id}`}
                      </td>
                      <td className="p-2 font-bold">{formatCurrency(commission.valor_pago)}</td>
                      <td className="p-2">{formatDate(commission.data_pagamento)}</td>
                      <td className="p-2">{getStatusBadge(commission.status_comissao)}</td>
                      <td className="p-2 text-sm text-gray-600">
                        {commission.periodo_referencia || '-'}
                      </td>
                      <td className="p-2 text-sm text-gray-600">
                        {formatDate(commission.created_at)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {(!statement || statement.items.length === 0) && (
                <div className="text-center py-8 text-gray-500">
                  Nenhuma comissão encontrada
                </div>
              )}
            </div>

            {/* Paginação */}
            {statement && statement.total > itemsPerPage && (
              <div className="flex justify-between items-center mt-4">
                <div className="text-sm text-gray-600">
                  Mostrando {currentPage * itemsPerPage + 1} a{' '}
                  {Math.min((currentPage + 1) * itemsPerPage, statement.total)} de {statement.total}
                </div>
                <div className="flex gap-2">
                  <Button
                    variant="outline"
                    onClick={() => setCurrentPage((p) => Math.max(0, p - 1))}
                    disabled={currentPage === 0}
                  >
                    Anterior
                  </Button>
                  <Button
                    variant="outline"
                    onClick={() => setCurrentPage((p) => Math.min(totalPages - 1, p + 1))}
                    disabled={currentPage >= totalPages - 1}
                  >
                    Próxima
                  </Button>
                </div>
              </div>
            )}
          </CardContent>
        </Card>
      )}
    </div>
  )
}

