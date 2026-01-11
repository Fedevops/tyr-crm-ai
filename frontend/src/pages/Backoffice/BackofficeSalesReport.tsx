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
import { Search, Download } from 'lucide-react'
import { backofficeApi } from '@/lib/api'

const formatCurrency = (value: number) => {
  return new Intl.NumberFormat('pt-BR', {
    style: 'currency',
    currency: 'BRL'
  }).format(value)
}

const formatDate = (dateString: string) => {
  const date = new Date(dateString)
  return date.toLocaleDateString('pt-BR', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
  })
}

interface SalesReportItem {
  tenant_id: number
  tenant_name: string
  company_name: string
  partner_id: number | null
  partner_nome: string | null
  partner_cnpj: string | null
  partner_nivel: string | null
  data_venda: string
  total_comissoes: number
  comissoes_pagas: number
  comissoes_pendentes: number
  total_comissoes_count: number
}

interface SalesReport {
  items: SalesReportItem[]
  total: number
  skip: number
  limit: number
}

export function BackofficeSalesReport() {
  const [loading, setLoading] = useState(true)
  const [report, setReport] = useState<SalesReport | null>(null)
  const [partners, setPartners] = useState<any[]>([])
  const [filters, setFilters] = useState({
    partner_id: 'all',
    data_inicio: '',
    data_fim: '',
  })
  const [currentPage, setCurrentPage] = useState(0)
  const itemsPerPage = 20

  useEffect(() => {
    loadPartners()
    loadReport()
  }, [currentPage])

  const loadPartners = async () => {
    try {
      const response = await backofficeApi.getPartners()
      setPartners(response.data)
    } catch (err) {
      console.error('Erro ao carregar parceiros:', err)
    }
  }

  const loadReport = async () => {
    try {
      setLoading(true)
      const params: any = {
        skip: currentPage * itemsPerPage,
        limit: itemsPerPage,
      }
      
      if (filters.partner_id && filters.partner_id !== 'all') {  // Adicionar verificação
        params.partner_id = parseInt(filters.partner_id)
      }
      if (filters.data_inicio) {
        params.data_inicio = filters.data_inicio
      }
      if (filters.data_fim) {
        params.data_fim = filters.data_fim
      }
  
      const response = await backofficeApi.getSalesReport(params)
      setReport(response.data)
    } catch (err: any) {
      console.error('Erro ao carregar relatório:', err)
    } finally {
      setLoading(false)
    }
  }

  const handleFilterChange = (field: string, value: string) => {
    setFilters({ ...filters, [field]: value })
  }

  const handleApplyFilters = () => {
    setCurrentPage(0)
    loadReport()
  }

  const handleClearFilters = () => {
    setFilters({
      partner_id: 'all',
      data_inicio: '',
      data_fim: '',
    })
    setCurrentPage(0)
    setTimeout(() => {
      loadReport()
    }, 100)
  }

  const totalPages = report ? Math.ceil(report.total / itemsPerPage) : 0

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold">Relatório de Vendas</h1>
        <p className="text-gray-600 mt-2">Licenças vendidas via parceiros</p>
      </div>

      {/* Filtros */}
      <Card>
        <CardHeader>
          <CardTitle>Filtros</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
            <div>
              <Label htmlFor="partner">Parceiro</Label>
              <Select
                value={filters.partner_id}
                onValueChange={(value) => handleFilterChange('partner_id', value)}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Todos os parceiros" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Todos os parceiros</SelectItem>
                  {partners.map((partner) => (
                    <SelectItem key={partner.id} value={partner.id.toString()}>
                      {partner.nome}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label htmlFor="data_inicio">Data Inicial</Label>
              <Input
                id="data_inicio"
                type="date"
                value={filters.data_inicio}
                onChange={(e) => handleFilterChange('data_inicio', e.target.value)}
              />
            </div>
            <div>
              <Label htmlFor="data_fim">Data Final</Label>
              <Input
                id="data_fim"
                type="date"
                value={filters.data_fim}
                onChange={(e) => handleFilterChange('data_fim', e.target.value)}
              />
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

      {/* Resumo */}
      {report && report.items.length > 0 && (
        <Card>
          <CardContent className="pt-6">
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div>
                <p className="text-sm text-gray-600">Total de Vendas</p>
                <p className="text-2xl font-bold">{report.total}</p>
              </div>
              <div>
                <p className="text-sm text-gray-600">Total de Comissões Pagas</p>
                <p className="text-2xl font-bold text-green-600">
                  {formatCurrency(
                    report.items.reduce((sum, item) => sum + item.comissoes_pagas, 0)
                  )}
                </p>
              </div>
              <div>
                <p className="text-sm text-gray-600">Total de Comissões Pendentes</p>
                <p className="text-2xl font-bold text-orange-600">
                  {formatCurrency(
                    report.items.reduce((sum, item) => sum + item.comissoes_pendentes, 0)
                  )}
                </p>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

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
                    <th className="text-left p-2">Parceiro</th>
                    <th className="text-left p-2">Nível</th>
                    <th className="text-left p-2">Data Venda</th>
                    <th className="text-left p-2">Comissões Pagas</th>
                    <th className="text-left p-2">Comissões Pendentes</th>
                    <th className="text-left p-2">Total</th>
                  </tr>
                </thead>
                <tbody>
                  {report?.items.map((item) => (
                    <tr key={item.tenant_id} className="border-b hover:bg-gray-50">
                      <td className="p-2">
                        <div>
                          <div className="font-medium">{item.tenant_name}</div>
                          <div className="text-sm text-gray-600">{item.company_name}</div>
                        </div>
                      </td>
                      <td className="p-2">
                        <div>
                          <div className="font-medium">{item.partner_nome || '-'}</div>
                          {item.partner_cnpj && (
                            <div className="text-sm text-gray-600">{item.partner_cnpj}</div>
                          )}
                        </div>
                      </td>
                      <td className="p-2">
                        {item.partner_nivel && (
                          <span
                            className={`px-2 py-1 rounded-full text-xs font-medium ${
                              item.partner_nivel === 'gold'
                                ? 'bg-yellow-100 text-yellow-800'
                                : item.partner_nivel === 'silver'
                                ? 'bg-gray-100 text-gray-800'
                                : 'bg-orange-100 text-orange-800'
                            }`}
                          >
                            {item.partner_nivel.charAt(0).toUpperCase() + item.partner_nivel.slice(1)}
                          </span>
                        )}
                      </td>
                      <td className="p-2">{formatDate(item.data_venda)}</td>
                      <td className="p-2 text-green-600 font-medium">
                        {formatCurrency(item.comissoes_pagas)}
                      </td>
                      <td className="p-2 text-orange-600 font-medium">
                        {formatCurrency(item.comissoes_pendentes)}
                      </td>
                      <td className="p-2 font-bold">
                        {formatCurrency(item.total_comissoes)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {(!report || report.items.length === 0) && (
                <div className="text-center py-8 text-gray-500">
                  Nenhuma venda encontrada
                </div>
              )}
            </div>

            {/* Paginação */}
            {report && report.total > itemsPerPage && (
              <div className="flex justify-between items-center mt-4">
                <div className="text-sm text-gray-600">
                  Mostrando {currentPage * itemsPerPage + 1} a{' '}
                  {Math.min((currentPage + 1) * itemsPerPage, report.total)} de {report.total}
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

