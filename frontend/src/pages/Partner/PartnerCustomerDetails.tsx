import { useState, useEffect } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { TyrLoadingSpinner } from '@/components/TyrLoadingSpinner'
import { ArrowLeft, Users, DollarSign } from 'lucide-react'
import { partnerPortalApi } from '@/lib/api'

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

interface CustomerDetails {
  tenant_id: number
  tenant_name: string
  company_name: string
  created_at: string
  users: Array<{
    id: number
    email: string
    full_name: string
    is_active: boolean
  }>
  commissions: Array<{
    id: number
    valor_pago: number
    data_pagamento: string | null
    status_comissao: string
    created_at: string
  }>
}

export function PartnerCustomerDetails() {
  const { customerId } = useParams<{ customerId: string }>()
  const navigate = useNavigate()
  const [loading, setLoading] = useState(true)
  const [customer, setCustomer] = useState<CustomerDetails | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (customerId) {
      loadCustomerDetails()
    }
  }, [customerId])

  const loadCustomerDetails = async () => {
    try {
      setLoading(true)
      setError(null)
      const response = await partnerPortalApi.getCustomer(parseInt(customerId!))
      setCustomer(response.data)
    } catch (err: any) {
      setError(err.response?.data?.detail || 'Erro ao carregar detalhes do cliente')
      console.error('Erro ao carregar cliente:', err)
    } finally {
      setLoading(false)
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <TyrLoadingSpinner />
      </div>
    )
  }

  if (error) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="text-center">
          <p className="text-red-500">{error}</p>
          <Button onClick={() => navigate('/partner/customers')} className="mt-4">
            Voltar
          </Button>
        </div>
      </div>
    )
  }

  if (!customer) {
    return null
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-4">
        <Button variant="outline" onClick={() => navigate('/partner/customers')}>
          <ArrowLeft className="h-4 w-4 mr-2" />
          Voltar
        </Button>
        <div>
          <h1 className="text-3xl font-bold">{customer.tenant_name}</h1>
          <p className="text-gray-600 mt-2">{customer.company_name}</p>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {/* Informações do Cliente */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Users className="h-5 w-5" />
              Informações do Cliente
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div>
              <p className="text-sm text-gray-600">Nome do Tenant</p>
              <p className="font-medium">{customer.tenant_name}</p>
            </div>
            <div>
              <p className="text-sm text-gray-600">Nome da Empresa</p>
              <p className="font-medium">{customer.company_name}</p>
            </div>
            <div>
              <p className="text-sm text-gray-600">Data de Cadastro</p>
              <p className="font-medium">{formatDate(customer.created_at)}</p>
            </div>
            <div>
              <p className="text-sm text-gray-600">Total de Usuários</p>
              <p className="font-medium">{customer.users.length}</p>
            </div>
          </CardContent>
        </Card>

        {/* Usuários */}
        <Card>
          <CardHeader>
            <CardTitle>Usuários do Cliente</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-2">
              {customer.users.map((user) => (
                <div key={user.id} className="flex justify-between items-center p-2 border rounded">
                  <div>
                    <p className="font-medium">{user.full_name}</p>
                    <p className="text-sm text-gray-600">{user.email}</p>
                  </div>
                  <span className={`px-2 py-1 rounded-full text-xs ${user.is_active ? 'bg-green-100 text-green-800' : 'bg-gray-100 text-gray-800'}`}>
                    {user.is_active ? 'Ativo' : 'Inativo'}
                  </span>
                </div>
              ))}
              {customer.users.length === 0 && (
                <p className="text-sm text-gray-500 text-center py-4">Nenhum usuário encontrado</p>
              )}
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Comissões */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <DollarSign className="h-5 w-5" />
            Histórico de Comissões
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b">
                  <th className="text-left p-2">Valor</th>
                  <th className="text-left p-2">Data Pagamento</th>
                  <th className="text-left p-2">Status</th>
                  <th className="text-left p-2">Data Criação</th>
                </tr>
              </thead>
              <tbody>
                {customer.commissions.map((commission) => (
                  <tr key={commission.id} className="border-b hover:bg-gray-50">
                    <td className="p-2 font-bold">{formatCurrency(commission.valor_pago)}</td>
                    <td className="p-2">{formatDate(commission.data_pagamento || commission.created_at)}</td>
                    <td className="p-2">
                      <span className={`px-2 py-1 rounded-full text-xs font-medium ${
                        commission.status_comissao === 'pago' 
                          ? 'bg-green-100 text-green-800' 
                          : commission.status_comissao === 'pendente'
                          ? 'bg-orange-100 text-orange-800'
                          : 'bg-gray-100 text-gray-800'
                      }`}>
                        {commission.status_comissao.charAt(0).toUpperCase() + commission.status_comissao.slice(1)}
                      </span>
                    </td>
                    <td className="p-2 text-sm text-gray-600">{formatDate(commission.created_at)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            {customer.commissions.length === 0 && (
              <div className="text-center py-8 text-gray-500">
                Nenhuma comissão encontrada
              </div>
            )}
          </div>
        </CardContent>
      </Card>
    </div>
  )
}

