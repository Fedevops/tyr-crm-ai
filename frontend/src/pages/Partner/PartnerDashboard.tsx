import { useState, useEffect } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { TyrLoadingSpinner } from '@/components/TyrLoadingSpinner'
import { Users, DollarSign, TrendingUp, Calendar } from 'lucide-react'
import { partnerPortalApi } from '@/lib/api'
import { usePartnerAuth } from '@/contexts/PartnerAuthContext'

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

interface DashboardData {
  partner_nome: string
  partner_nivel: string
  porcentagem_comissao: number
  total_clientes: number
  clientes_ativos: number
  comissoes_pendentes: number
  comissoes_pagas: number
  proxima_data_pagamento: string | null
  proximo_valor_pagamento: number | null
}

export function PartnerDashboard() {
  const { user } = usePartnerAuth()
  const [loading, setLoading] = useState(true)
  const [data, setData] = useState<DashboardData | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    loadDashboard()
  }, [])

  const loadDashboard = async () => {
    try {
      setLoading(true)
      setError(null)
      const response = await partnerPortalApi.getDashboard()
      setData(response.data)
    } catch (err: any) {
      setError(err.response?.data?.detail || 'Erro ao carregar dashboard')
      console.error('Erro ao carregar dashboard:', err)
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
          <button
            onClick={loadDashboard}
            className="mt-4 px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700"
          >
            Tentar novamente
          </button>
        </div>
      </div>
    )
  }

  if (!data) {
    return null
  }

  const getNivelColor = (nivel: string) => {
    const colors = {
      bronze: 'bg-orange-100 text-orange-800',
      silver: 'bg-gray-100 text-gray-800',
      gold: 'bg-yellow-100 text-yellow-800',
    }
    return colors[nivel as keyof typeof colors] || 'bg-gray-100 text-gray-800'
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold">Dashboard do Parceiro</h1>
        <p className="text-gray-600 mt-2">
          Bem-vindo, {user?.full_name} - {data.partner_nome}
        </p>
        <div className="mt-2">
          <span className={`px-3 py-1 rounded-full text-sm font-medium ${getNivelColor(data.partner_nivel)}`}>
            Nível {data.partner_nivel.charAt(0).toUpperCase() + data.partner_nivel.slice(1)}
          </span>
          <span className="ml-2 text-sm text-gray-600">
            Comissão: {data.porcentagem_comissao}%
          </span>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        {/* Total de Clientes */}
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Total de Clientes</CardTitle>
            <Users className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{data.total_clientes}</div>
            <p className="text-xs text-muted-foreground">
              {data.clientes_ativos} ativos
            </p>
          </CardContent>
        </Card>

        {/* Comissões Pendentes */}
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Comissões Pendentes</CardTitle>
            <DollarSign className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-orange-600">
              {formatCurrency(data.comissoes_pendentes)}
            </div>
            <p className="text-xs text-muted-foreground">
              Aguardando pagamento
            </p>
          </CardContent>
        </Card>

        {/* Comissões Pagas */}
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Comissões Pagas</CardTitle>
            <TrendingUp className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-green-600">
              {formatCurrency(data.comissoes_pagas)}
            </div>
            <p className="text-xs text-muted-foreground">
              Total recebido
            </p>
          </CardContent>
        </Card>

        {/* Próximo Pagamento */}
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Próximo Pagamento</CardTitle>
            <Calendar className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              {data.proxima_data_pagamento ? formatDate(data.proxima_data_pagamento) : '-'}
            </div>
            <p className="text-xs text-muted-foreground">
              {data.proximo_valor_pagamento ? formatCurrency(data.proximo_valor_pagamento) : 'Sem pagamentos pendentes'}
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Resumo */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <Card>
          <CardHeader>
            <CardTitle>Resumo Financeiro</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-2">
              <div className="flex justify-between">
                <span className="text-sm text-muted-foreground">Comissões Pagas:</span>
                <span className="font-semibold text-green-600">
                  {formatCurrency(data.comissoes_pagas)}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-sm text-muted-foreground">Comissões Pendentes:</span>
                <span className="font-semibold text-orange-600">
                  {formatCurrency(data.comissoes_pendentes)}
                </span>
              </div>
              <div className="flex justify-between pt-2 border-t">
                <span className="text-sm font-medium">Saldo Total:</span>
                <span className="font-bold text-lg">
                  {formatCurrency(data.comissoes_pagas + data.comissoes_pendentes)}
                </span>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Informações do Parceiro</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-2">
              <div className="flex justify-between">
                <span className="text-sm text-muted-foreground">Nível:</span>
                <span className="font-semibold">
                  {data.partner_nivel.charAt(0).toUpperCase() + data.partner_nivel.slice(1)}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-sm text-muted-foreground">Porcentagem de Comissão:</span>
                <span className="font-semibold">
                  {data.porcentagem_comissao}%
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-sm text-muted-foreground">Total de Clientes:</span>
                <span className="font-semibold">
                  {data.total_clientes}
                </span>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  )
}

