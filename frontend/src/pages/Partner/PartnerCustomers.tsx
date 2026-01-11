import { useState, useEffect } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { TyrLoadingSpinner } from '@/components/TyrLoadingSpinner'
import { Search, Eye, CheckCircle, XCircle } from 'lucide-react'
import { partnerPortalApi } from '@/lib/api'
import { useNavigate } from 'react-router-dom'
import { Button } from '@/components/ui/button'

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

interface Customer {
  tenant_id: number
  tenant_name: string
  company_name: string
  created_at: string
  status: 'ativo' | 'inativo'
  total_users: number
  total_comissoes: number
  data_venda: string
}

export function PartnerCustomers() {
  const navigate = useNavigate()
  const [loading, setLoading] = useState(true)
  const [customers, setCustomers] = useState<Customer[]>([])
  const [searchTerm, setSearchTerm] = useState('')
  const [currentPage, setCurrentPage] = useState(0)
  const [total, setTotal] = useState(0)
  const itemsPerPage = 20

  useEffect(() => {
    loadCustomers()
  }, [currentPage])

  const loadCustomers = async () => {
    try {
      setLoading(true)
      const response = await partnerPortalApi.getCustomers({
        skip: currentPage * itemsPerPage,
        limit: itemsPerPage,
      })
      setCustomers(response.data.items)
      setTotal(response.data.total)
    } catch (err: any) {
      console.error('Erro ao carregar clientes:', err)
    } finally {
      setLoading(false)
    }
  }

  const filteredCustomers = customers.filter(
    (customer) =>
      customer.tenant_name.toLowerCase().includes(searchTerm.toLowerCase()) ||
      customer.company_name.toLowerCase().includes(searchTerm.toLowerCase())
  )

  const getStatusBadge = (status: string) => {
    if (status === 'ativo') {
      return (
        <span className="flex items-center gap-1 px-2 py-1 rounded-full text-xs font-medium bg-green-100 text-green-800">
          <CheckCircle className="h-3 w-3" />
          Ativo
        </span>
      )
    }
    return (
      <span className="flex items-center gap-1 px-2 py-1 rounded-full text-xs font-medium bg-gray-100 text-gray-800">
        <XCircle className="h-3 w-3" />
        Inativo
      </span>
    )
  }

  const totalPages = Math.ceil(total / itemsPerPage)

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold">Gestão de Clientes</h1>
        <p className="text-gray-600 mt-2">Clientes que você trouxe para a plataforma</p>
      </div>

      {/* Busca */}
      <Card>
        <CardContent className="pt-6">
          <div className="relative">
            <Search className="absolute left-3 top-3 h-4 w-4 text-gray-400" />
            <Input
              placeholder="Buscar por nome da empresa ou tenant..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="pl-10"
            />
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
                    <th className="text-left p-2">Empresa</th>
                    <th className="text-left p-2">Status</th>
                    <th className="text-left p-2">Usuários</th>
                    <th className="text-left p-2">Data Venda</th>
                    <th className="text-left p-2">Total Comissões</th>
                    <th className="text-right p-2">Ações</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredCustomers.map((customer) => (
                    <tr key={customer.tenant_id} className="border-b hover:bg-gray-50">
                      <td className="p-2 font-medium">{customer.tenant_name}</td>
                      <td className="p-2 text-sm text-gray-600">{customer.company_name}</td>
                      <td className="p-2">{getStatusBadge(customer.status)}</td>
                      <td className="p-2">{customer.total_users}</td>
                      <td className="p-2">{formatDate(customer.data_venda)}</td>
                      <td className="p-2 font-medium">{formatCurrency(customer.total_comissoes)}</td>
                      <td className="p-2">
                        <div className="flex justify-end">
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => navigate(`/partner/customers/${customer.tenant_id}`)}
                          >
                            <Eye className="h-4 w-4 mr-2" />
                            Ver Detalhes
                          </Button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {filteredCustomers.length === 0 && (
                <div className="text-center py-8 text-gray-500">
                  Nenhum cliente encontrado
                </div>
              )}
            </div>

            {/* Paginação */}
            {total > itemsPerPage && (
              <div className="flex justify-between items-center mt-4">
                <div className="text-sm text-gray-600">
                  Mostrando {currentPage * itemsPerPage + 1} a{' '}
                  {Math.min((currentPage + 1) * itemsPerPage, total)} de {total}
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

