import { useState, useEffect } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { TyrLoadingSpinner } from '@/components/TyrLoadingSpinner'
import { Users, DollarSign, TrendingUp, AlertCircle } from 'lucide-react'
import { backofficeApi } from '@/lib/api'
import { useTranslation } from 'react-i18next'

const formatCurrency = (value: number) => {
  return new Intl.NumberFormat('pt-BR', {
    style: 'currency',
    currency: 'BRL'
  }).format(value)
}

interface DashboardData {
  total_parceiros_ativos: number
  volume_vendas_mes: number
  comissoes_pagar: number
  total_parceiros: number
  parceiros_pendentes: number
  total_clientes_parceiros: number
  comissoes_pagas_mes: number
}

export function BackofficeDashboard() {
  const [loading, setLoading] = useState(true)
  const [data, setData] = useState<DashboardData | null>(null)
  const [error, setError] = useState<string | null>(null)
  const { t } = useTranslation()

  useEffect(() => {
    loadDashboard()
  }, [])

  const loadDashboard = async () => {
    try {
      setLoading(true)
      setError(null)
      const response = await backofficeApi.getDashboard()
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
          <AlertCircle className="h-12 w-12 text-red-500 mx-auto mb-4" />
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

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold">{t('backoffice-dashboard.title', 'Backoffice - Dashboard')}</h1>
        <p className="text-gray-600 mt-2">{t('backoffice-dashboard.generalOverview', 'Visão geral do sistema de parceiros')}</p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        {/* Total de Parceiros Ativos */}
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">{t('backoffice-dashboard.totalPartners', 'Total de Parceiros Ativos')}</CardTitle>
            <Users className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{data.total_parceiros_ativos}</div>
            <p className="text-xs text-muted-foreground">
              {t('backoffice-dashboard.totalPartners', 'Total Parceiros Ativos')} de {data.total_parceiros} total
            </p>
          </CardContent>
        </Card>

        {/* Volume de Vendas Este Mês */}
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">{t('backoffice-dashboard.totalSalesThisMonth', 'Total de Vendas Este Mês')}</CardTitle>
            <TrendingUp className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{formatCurrency(data.volume_vendas_mes)}</div>
            <p className="text-xs text-muted-foreground">
              {t('backoffice-dashboard.paidCommissions', 'Comissões pagas')}: {formatCurrency(data.comissoes_pagas_mes)}
            </p>
          </CardContent>
        </Card>

        {/* Comissões a Pagar */}
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">{t('backoffice-dashboard.pendingCommissions', 'Comissões a Pagar')}</CardTitle>
            <DollarSign className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-orange-600">
              {formatCurrency(data.comissoes_pagar)}
            </div>
            <p className="text-xs text-muted-foreground">
              {t('backoffice-dashboard.status', 'Status')}: {t('backoffice-dashboard.pending', 'Pendente')}
            </p>
          </CardContent>
        </Card>

        {/* Total de Clientes via Parceiros */}
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">{t('backoffice-dashboard.totalCustomersViaPartners', 'Total de Clientes via Parceiros')}</CardTitle>
            <Users className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{data.total_clientes_parceiros}</div>
            <p className="text-xs text-muted-foreground">
              {t('backoffice-dashboard.licensedSales', 'Licenças vendidas')}
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Informações Adicionais */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <Card>
          <CardHeader>
            <CardTitle>{t('backoffice-dashboard.totalPartnersPending', 'Total de Parceiros Pendentes')}</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold text-yellow-600">
              {data.parceiros_pendentes}
            </div>
            <p className="text-sm text-muted-foreground mt-2">
              {t('backoffice-dashboard.partnersWaitingApproval', 'Parceiros aguardando aprovação')}
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>{t('backoffice-dashboard.financialSummary', 'Resumo Financeiro')}</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-2">
              <div className="flex justify-between">
                <span className="text-sm text-muted-foreground">{t('backoffice-dashboard.paidCommissionsThisMonth', 'Comissões Pagas (Mês)')}:</span>
                <span className="font-semibold text-green-600">
                  {formatCurrency(data.comissoes_pagas_mes)}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-sm text-muted-foreground">{t('backoffice-dashboard.pendingCommissions', 'Comissões Pendentes')}:</span>
                <span className="font-semibold text-orange-600">
                  {formatCurrency(data.comissoes_pagar)}
                </span>
              </div>
              <div className="flex justify-between pt-2 border-t">
                <span className="text-sm font-medium">{t('backoffice-dashboard.totalVolumeThisMonth', 'Volume Total (Mês)')}:</span>
                <span className="font-bold text-lg">
                  {formatCurrency(data.volume_vendas_mes)}
                </span>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  )
}

