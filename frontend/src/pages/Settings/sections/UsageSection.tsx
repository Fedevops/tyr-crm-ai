import { useState, useEffect } from 'react'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog'
import { Progress } from '@/components/ui/progress'
import { settingsApi } from '@/lib/api'
import { useToast } from '@/components/ui/use-toast'
import { BarChart3, AlertTriangle, TrendingUp, Users, Package, Phone, Zap } from 'lucide-react'
import { cn } from '@/lib/utils'

interface UsageMetric {
  current: number
  max: number
  percentage: number
}

interface UsageData {
  plan_type: string
  limits: {
    leads: UsageMetric
    users: UsageMetric
    items: UsageMetric
    api_calls: UsageMetric
  }
}

interface AddOn {
  id: string
  name: string
  description: string
  price: number
  metric: 'leads' | 'users' | 'items'
  amount: number
}

const ADD_ONS: AddOn[] = [
  {
    id: 'leads-500',
    name: '+500 Leads',
    description: 'Adicione 500 leads ao seu plano atual',
    price: 49,
    metric: 'leads',
    amount: 500
  },
  {
    id: 'users-5',
    name: '+5 Usuários',
    description: 'Adicione 5 usuários à sua equipe',
    price: 29,
    metric: 'users',
    amount: 5
  },
  {
    id: 'items-100',
    name: '+100 Itens',
    description: 'Adicione 100 itens ao seu catálogo',
    price: 19,
    metric: 'items',
    amount: 100
  }
]

export function UsageSection() {
  const { toast } = useToast()
  const [usage, setUsage] = useState<UsageData | null>(null)
  const [loading, setLoading] = useState(true)
  const [addOnModalOpen, setAddOnModalOpen] = useState(false)
  const [upgradeModalOpen, setUpgradeModalOpen] = useState(false)

  useEffect(() => {
    fetchUsage()
  }, [])

  const fetchUsage = async () => {
    try {
      setLoading(true)
      const response = await settingsApi.getUsage()
      setUsage(response.data)
    } catch (error: any) {
      console.error('Error fetching usage:', error)
      toast({
        variant: 'destructive',
        title: 'Erro',
        description: 'Não foi possível carregar os dados de uso.',
      })
    } finally {
      setLoading(false)
    }
  }

  const getProgressColor = (percentage: number) => {
    if (percentage >= 95) return 'bg-red-500'
    if (percentage >= 80) return 'bg-yellow-500'
    return 'bg-blue-500'
  }

  const getMetricIcon = (metric: string) => {
    switch (metric) {
      case 'leads':
        return TrendingUp
      case 'users':
        return Users
      case 'items':
        return Package
      case 'api_calls':
        return Zap
      default:
        return BarChart3
    }
  }

  const getMetricLabel = (metric: string) => {
    switch (metric) {
      case 'leads':
        return 'Leads Ativos'
      case 'users':
        return 'Usuários'
      case 'items':
        return 'Itens no Catálogo'
      case 'api_calls':
        return 'Chamadas de API (este mês)'
      default:
        return metric
    }
  }

  const formatMax = (max: number) => {
    if (max >= 999999999 || max === -1) return 'Ilimitado'
    return max.toLocaleString('pt-BR')
  }

  const handlePurchaseAddOn = (addOn: AddOn) => {
    // Simulação de compra
    toast({
      title: 'Add-on adicionado',
      description: `${addOn.name} foi adicionado ao seu plano.`,
    })
    setAddOnModalOpen(false)
    fetchUsage()
  }

  const handleUpgrade = () => {
    // Simulação de upgrade
    toast({
      title: 'Upgrade iniciado',
      description: 'Redirecionando para a página de upgrade...',
    })
    setUpgradeModalOpen(false)
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center p-8">
        <div className="text-muted-foreground">Carregando dados de uso...</div>
      </div>
    )
  }

  if (!usage) {
    return (
      <div className="flex items-center justify-center p-8">
        <div className="text-muted-foreground">Não foi possível carregar os dados de uso.</div>
      </div>
    )
  }

  const metrics = [
    { key: 'leads', data: usage.limits.leads },
    { key: 'users', data: usage.limits.users },
    { key: 'items', data: usage.limits.items },
    { key: 'api_calls', data: usage.limits.api_calls },
  ]

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-bold">Uso e Limites</h2>
        <p className="text-muted-foreground mt-1">
          Acompanhe o uso dos recursos do seu plano {usage.plan_type === 'starter' ? 'Starter' : usage.plan_type === 'professional' ? 'Professional' : 'Enterprise'}
        </p>
      </div>

      {/* Botão de Upgrade (apenas para Starter) */}
      {usage.plan_type === 'starter' && (
        <Card className="border-primary">
          <CardContent className="p-6">
            <div className="flex items-center justify-between">
              <div>
                <h3 className="text-lg font-semibold">Fazer Upgrade para Professional</h3>
                <p className="text-sm text-muted-foreground mt-1">
                  Desbloqueie mais recursos e limites maiores
                </p>
              </div>
              <Dialog open={upgradeModalOpen} onOpenChange={setUpgradeModalOpen}>
                <DialogTrigger asChild>
                  <Button>Fazer Upgrade</Button>
                </DialogTrigger>
                <DialogContent>
                  <DialogHeader>
                    <DialogTitle>Upgrade para Professional</DialogTitle>
                    <DialogDescription>
                      Compare os planos e escolha o melhor para você
                    </DialogDescription>
                  </DialogHeader>
                  <div className="space-y-4 mt-4">
                    <div className="grid grid-cols-2 gap-4">
                      <div className="p-4 border rounded-lg">
                        <h4 className="font-semibold mb-2">Starter</h4>
                        <ul className="text-sm space-y-1 text-muted-foreground">
                          <li>100 Leads</li>
                          <li>3 Usuários</li>
                          <li>50 Itens</li>
                          <li>1.000 API calls/mês</li>
                        </ul>
                      </div>
                      <div className="p-4 border rounded-lg border-primary bg-primary/5">
                        <h4 className="font-semibold mb-2">Professional</h4>
                        <ul className="text-sm space-y-1">
                          <li>1.000 Leads</li>
                          <li>10 Usuários</li>
                          <li>500 Itens</li>
                          <li>10.000 API calls/mês</li>
                        </ul>
                      </div>
                    </div>
                    <Button onClick={handleUpgrade} className="w-full">
                      Fazer Upgrade Agora
                    </Button>
                  </div>
                </DialogContent>
              </Dialog>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Cards de Métricas */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {metrics.map(({ key, data }) => {
          const Icon = getMetricIcon(key)
          const percentage = data.percentage
          const isUnlimited = data.max >= 999999999 || data.max === -1
          
          return (
            <Card key={key}>
              <CardHeader>
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <Icon className="h-5 w-5 text-muted-foreground" />
                    <CardTitle className="text-lg">{getMetricLabel(key)}</CardTitle>
                  </div>
                  {percentage >= 95 && (
                    <AlertTriangle className="h-5 w-5 text-red-500" />
                  )}
                </div>
              </CardHeader>
              <CardContent>
                <div className="space-y-3">
                  <div className="flex items-center justify-between text-sm">
                    <span className="text-muted-foreground">
                      {data.current.toLocaleString('pt-BR')} de {isUnlimited ? '∞' : formatMax(data.max)} utilizados
                    </span>
                    <span className={cn(
                      "font-semibold",
                      percentage >= 95 && "text-red-500",
                      percentage >= 80 && percentage < 95 && "text-yellow-500"
                    )}>
                      {percentage.toFixed(1)}%
                    </span>
                  </div>
                  <Progress 
                    value={isUnlimited ? 0 : Math.min(percentage, 100)} 
                    className={cn(
                      "h-2",
                      percentage >= 95 && "[&>div]:bg-red-500",
                      percentage >= 80 && percentage < 95 && "[&>div]:bg-yellow-500",
                      percentage < 80 && "[&>div]:bg-blue-500"
                    )}
                  />
                </div>
              </CardContent>
            </Card>
          )
        })}
      </div>

      {/* Botão de Add-ons */}
      <Card>
        <CardHeader>
          <CardTitle>Add-ons Disponíveis</CardTitle>
          <CardDescription>
            Adicione recursos extras ao seu plano atual
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Dialog open={addOnModalOpen} onOpenChange={setAddOnModalOpen}>
            <DialogTrigger asChild>
              <Button variant="outline">Ver Add-ons</Button>
            </DialogTrigger>
            <DialogContent className="max-w-2xl">
              <DialogHeader>
                <DialogTitle>Comprar Add-on</DialogTitle>
                <DialogDescription>
                  Escolha um add-on para adicionar ao seu plano
                </DialogDescription>
              </DialogHeader>
              <div className="grid gap-4 mt-4">
                {ADD_ONS.map((addOn) => (
                  <Card key={addOn.id}>
                    <CardContent className="p-4">
                      <div className="flex items-center justify-between">
                        <div>
                          <h4 className="font-semibold">{addOn.name}</h4>
                          <p className="text-sm text-muted-foreground">{addOn.description}</p>
                        </div>
                        <div className="flex items-center gap-4">
                          <div className="text-right">
                            <div className="font-semibold">R$ {addOn.price.toFixed(2)}</div>
                            <div className="text-xs text-muted-foreground">/mês</div>
                          </div>
                          <Button onClick={() => handlePurchaseAddOn(addOn)}>
                            Comprar
                          </Button>
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                ))}
              </div>
            </DialogContent>
          </Dialog>
        </CardContent>
      </Card>
    </div>
  )
}

