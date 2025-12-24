import { useState, useEffect } from 'react'
import { useTranslation } from 'react-i18next'
import api from '@/lib/api'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { 
  Plus, 
  Trash2, 
  Edit, 
  GripVertical,
  TrendingUp,
  CheckCircle2,
  DollarSign,
  Target,
  Users,
  BarChart3,
  ArrowRight,
  Eye,
  EyeOff
} from 'lucide-react'
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
  Cell
} from 'recharts'

interface SalesFunnel {
  id: number
  name: string
  description: string | null
  is_default: boolean
  created_at: string
  updated_at: string
}

interface SalesStage {
  id: number
  funnel_id: number
  name: string
  description: string | null
  order: number
  probability: number
  created_at: string
  updated_at: string
}

interface FunnelStats {
  funnel: {
    id: number
    name: string
    is_default: boolean
  }
  stages: Array<{
    stage_id: number
    stage_name: string
    order: number
    probability: number
    opportunity_count: number
    total_value: number
    average_value: number
    weighted_value: number
    opportunities: Array<{
      id: number
      name: string
      amount: number | null
      currency: string | null
      expected_close_date: string | null
      account_id: number | null
      contact_id: number | null
      owner_id: number | null
    }>
  }>
  summary: {
    total_opportunities: number
    total_value: number
    weighted_value: number
    conversion_rates: Array<{
      from_stage: string
      to_stage: string
      rate: number
    }>
  }
}

const COLORS = ['#8b5cf6', '#6366f1', '#3b82f6', '#10b981', '#f59e0b', '#ef4444', '#ec4899']

const formatCurrency = (value: number, currency: string = 'BRL') => {
  return new Intl.NumberFormat('pt-BR', {
    style: 'currency',
    currency: currency
  }).format(value)
}

export function SalesFunnels() {
  const { t } = useTranslation()
  const [funnels, setFunnels] = useState<SalesFunnel[]>([])
  const [stages, setStages] = useState<Record<number, SalesStage[]>>({})
  const [funnelStats, setFunnelStats] = useState<FunnelStats | null>(null)
  const [loading, setLoading] = useState(true)
  const [showForm, setShowForm] = useState(false)
  const [editingId, setEditingId] = useState<number | null>(null)
  const [selectedFunnelId, setSelectedFunnelId] = useState<number | null>(null)
  const [showStageForm, setShowStageForm] = useState(false)
  const [editingStageId, setEditingStageId] = useState<number | null>(null)
  const [showStats, setShowStats] = useState(true)
  const [expandedStages, setExpandedStages] = useState<Set<number>>(new Set())
  
  const [funnelFormData, setFunnelFormData] = useState({
    name: '',
    description: '',
    is_default: false
  })
  
  const [stageFormData, setStageFormData] = useState({
    name: '',
    description: '',
    order: 1,
    probability: 0
  })

  const [initialStages, setInitialStages] = useState<Array<{
    name: string
    description: string
    order: number
    probability: number
  }>>([
    { name: 'Qualificação', description: 'Lead qualificado e interessado', order: 1, probability: 10 },
    { name: 'Proposta', description: 'Proposta comercial enviada', order: 2, probability: 30 },
    { name: 'Negociação', description: 'Em negociação de termos', order: 3, probability: 60 },
    { name: 'Fechamento', description: 'Pronto para fechar', order: 4, probability: 90 },
    { name: 'Ganho', description: 'Oportunidade ganha', order: 5, probability: 100 }
  ])

  useEffect(() => {
    fetchFunnels()
  }, [])

  useEffect(() => {
    if (selectedFunnelId) {
      fetchStages(selectedFunnelId)
      fetchFunnelStats(selectedFunnelId)
    }
  }, [selectedFunnelId])

  const fetchFunnels = async () => {
    try {
      setLoading(true)
      const response = await api.get('/api/sales-funnels')
      setFunnels(response.data)
      if (response.data.length > 0 && !selectedFunnelId) {
        setSelectedFunnelId(response.data[0].id)
      }
    } catch (error) {
      console.error('Error fetching funnels:', error)
    } finally {
      setLoading(false)
    }
  }

  const fetchStages = async (funnelId: number) => {
    try {
      const response = await api.get(`/api/sales-funnels/${funnelId}/stages`)
      setStages(prev => ({ ...prev, [funnelId]: response.data }))
    } catch (error) {
      console.error('Error fetching stages:', error)
    }
  }

  const fetchFunnelStats = async (funnelId: number) => {
    try {
      const response = await api.get(`/api/sales-funnels/${funnelId}/stats`)
      setFunnelStats(response.data)
    } catch (error) {
      console.error('Error fetching funnel stats:', error)
    }
  }

  const handleFunnelSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    try {
      let newFunnelId: number
      
      if (editingId) {
        const response = await api.put(`/api/sales-funnels/${editingId}`, funnelFormData)
        newFunnelId = response.data.id
      } else {
        const response = await api.post('/api/sales-funnels', funnelFormData)
        newFunnelId = response.data.id
        
        // Criar estágios iniciais se for um novo funil
        if (initialStages.length > 0) {
          try {
            for (const stage of initialStages) {
              // Remover funnel_id do payload se existir (vem do path parameter)
              const { funnel_id, ...stagePayload } = stage as any
              await api.post(`/api/sales-funnels/${newFunnelId}/stages`, stagePayload)
            }
          } catch (stageError: any) {
            console.error('Error creating initial stages:', stageError)
            // Não falhar completamente, apenas avisar
            alert('Funil criado, mas alguns estágios podem não ter sido criados. Verifique e crie manualmente se necessário.')
          }
        }
      }
      
      resetFunnelForm()
      fetchFunnels()
      
      // Selecionar o funil recém-criado/editado
      if (newFunnelId) {
        setSelectedFunnelId(newFunnelId)
      }
    } catch (error: any) {
      console.error('Error saving funnel:', error)
      alert(error.response?.data?.detail || 'Erro ao salvar funil')
    }
  }

  const handleStageSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!selectedFunnelId) {
      alert('Selecione um funil primeiro')
      return
    }
    
    try {
      // Não enviar funnel_id no payload (vem do path parameter)
      const payload = {
        name: stageFormData.name,
        description: stageFormData.description,
        order: stageFormData.order,
        probability: stageFormData.probability
      }
      
      if (editingStageId) {
        await api.put(`/api/sales-funnels/${selectedFunnelId}/stages/${editingStageId}`, payload)
      } else {
        await api.post(`/api/sales-funnels/${selectedFunnelId}/stages`, payload)
      }
      resetStageForm()
      if (selectedFunnelId) {
        fetchStages(selectedFunnelId)
        fetchFunnelStats(selectedFunnelId)
      }
    } catch (error: any) {
      console.error('Error saving stage:', error)
      alert(error.response?.data?.detail || 'Erro ao salvar estágio')
    }
  }

  const handleEditFunnel = (funnel: SalesFunnel) => {
    setEditingId(funnel.id)
    setFunnelFormData({
      name: funnel.name,
      description: funnel.description || '',
      is_default: funnel.is_default
    })
    setShowForm(true)
  }

  const handleEditStage = (stage: SalesStage) => {
    setEditingStageId(stage.id)
    setStageFormData({
      name: stage.name,
      description: stage.description || '',
      order: stage.order,
      probability: stage.probability
    })
    setShowStageForm(true)
  }

  const handleDeleteFunnel = async (id: number) => {
    if (!confirm('Tem certeza que deseja excluir este funil? Todos os estágios serão excluídos também.')) return
    
    try {
      await api.delete(`/api/sales-funnels/${id}`)
      if (selectedFunnelId === id) {
        setSelectedFunnelId(null)
        setFunnelStats(null)
      }
      fetchFunnels()
    } catch (error: any) {
      console.error('Error deleting funnel:', error)
      alert(error.response?.data?.detail || 'Erro ao excluir funil')
    }
  }

  const handleDeleteStage = async (stageId: number) => {
    if (!selectedFunnelId) return
    if (!confirm('Tem certeza que deseja excluir este estágio?')) return
    
    try {
      await api.delete(`/api/sales-funnels/${selectedFunnelId}/stages/${stageId}`)
      fetchStages(selectedFunnelId)
      fetchFunnelStats(selectedFunnelId)
    } catch (error: any) {
      console.error('Error deleting stage:', error)
      alert(error.response?.data?.detail || 'Erro ao excluir estágio')
    }
  }

  const resetFunnelForm = () => {
    setFunnelFormData({
      name: '',
      description: '',
      is_default: false
    })
    setInitialStages([
      { name: 'Qualificação', description: 'Lead qualificado e interessado', order: 1, probability: 10 },
      { name: 'Proposta', description: 'Proposta comercial enviada', order: 2, probability: 30 },
      { name: 'Negociação', description: 'Em negociação de termos', order: 3, probability: 60 },
      { name: 'Fechamento', description: 'Pronto para fechar', order: 4, probability: 90 },
      { name: 'Ganho', description: 'Oportunidade ganha', order: 5, probability: 100 }
    ])
    setEditingId(null)
    setShowForm(false)
  }

  const resetStageForm = () => {
    setStageFormData({
      name: '',
      description: '',
      order: 1,
      probability: 0
    })
    setEditingStageId(null)
    setShowStageForm(false)
  }

  const toggleStageExpanded = (stageId: number) => {
    setExpandedStages(prev => {
      const newSet = new Set(prev)
      if (newSet.has(stageId)) {
        newSet.delete(stageId)
      } else {
        newSet.add(stageId)
      }
      return newSet
    })
  }

  if (loading) {
    return <div className="flex-1 space-y-6 p-6">Carregando...</div>
  }

  // Preparar dados para gráficos
  const funnelChartData = funnelStats?.stages.map(stage => ({
    name: stage.stage_name,
    oportunidades: stage.opportunity_count,
    valor: stage.total_value,
    valorPonderado: stage.weighted_value,
    probabilidade: stage.probability
  })) || []

  return (
    <div className="flex-1 space-y-6 p-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold">Funil de Vendas</h1>
          <p className="text-muted-foreground">Configure seus funis de vendas e estágios</p>
        </div>
        <Button 
          onClick={() => setShowForm(!showForm)}
          className="bg-gradient-to-r from-violet-600 to-violet-700 hover:from-violet-700 hover:to-violet-800 text-white shadow-md hover:shadow-lg transition-all duration-200"
        >
          <Plus className="mr-2 h-4 w-4" />
          Novo Funil
        </Button>
      </div>

      {showForm && (
        <Card className="border-t-4 border-t-violet-500 bg-gradient-to-br from-violet-50/30 to-white dark:from-violet-950/10 dark:to-background">
          <CardHeader className="bg-gradient-to-r from-violet-50/50 to-transparent dark:from-violet-950/20">
            <CardTitle className="text-violet-900 dark:text-violet-100">
              {editingId ? 'Editar' : 'Novo'} Funil
            </CardTitle>
            {!editingId && (
              <CardDescription>
                Configure o funil e seus estágios iniciais. Você poderá adicionar mais estágios depois.
              </CardDescription>
            )}
          </CardHeader>
          <CardContent>
            <form onSubmit={handleFunnelSubmit} className="space-y-6">
              {/* Informações Básicas do Funil */}
              <div className="space-y-4">
                <h3 className="font-semibold text-violet-900 dark:text-violet-100">Informações do Funil</h3>
                <div>
                  <label className="block text-sm font-medium mb-1">Nome do Funil *</label>
                  <Input
                    value={funnelFormData.name}
                    onChange={(e) => setFunnelFormData({ ...funnelFormData, name: e.target.value })}
                    required
                    placeholder="Ex: Funil de Vendas B2B"
                    className="focus:ring-2 focus:ring-violet-500 focus:border-violet-500 transition-all duration-200"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium mb-1">Descrição</label>
                  <Textarea
                    value={funnelFormData.description}
                    onChange={(e) => setFunnelFormData({ ...funnelFormData, description: e.target.value })}
                    rows={3}
                    placeholder="Descreva o propósito deste funil de vendas..."
                    className="focus:ring-2 focus:ring-violet-500 focus:border-violet-500 transition-all duration-200"
                  />
                </div>
                <div className="flex items-center gap-2">
                  <input
                    type="checkbox"
                    id="is_default"
                    checked={funnelFormData.is_default}
                    onChange={(e) => setFunnelFormData({ ...funnelFormData, is_default: e.target.checked })}
                    className="h-4 w-4"
                  />
                  <label htmlFor="is_default" className="text-sm font-medium">
                    Marcar como funil padrão
                  </label>
                </div>
              </div>

              {/* Estágios Iniciais (apenas para novo funil) */}
              {!editingId && (
                <div className="space-y-4 border-t pt-6">
                  <div className="flex items-center justify-between">
                    <h3 className="font-semibold text-violet-900 dark:text-violet-100">Estágios Iniciais</h3>
                    <Button
                      type="button"
                      size="sm"
                      variant="outline"
                      onClick={() => {
                        setInitialStages([...initialStages, { name: '', description: '', order: initialStages.length + 1, probability: 0 }])
                      }}
                    >
                      <Plus className="h-4 w-4 mr-1" />
                      Adicionar Estágio
                    </Button>
                  </div>
                  <p className="text-sm text-muted-foreground">
                    Defina os estágios do funil. Cada estágio deve ter uma ordem e probabilidade de fechamento.
                  </p>
                  
                  <div className="space-y-3">
                    {initialStages.map((stage, index) => (
                      <Card key={index} className="border-violet-200">
                        <CardContent className="pt-4">
                          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                            <div>
                              <label className="block text-sm font-medium mb-1">Nome do Estágio *</label>
                              <Input
                                value={stage.name}
                                onChange={(e) => {
                                  const newStages = [...initialStages]
                                  newStages[index].name = e.target.value
                                  setInitialStages(newStages)
                                }}
                                placeholder="Ex: Qualificação"
                                required
                                className="focus:ring-2 focus:ring-violet-500 focus:border-violet-500 transition-all duration-200"
                              />
                            </div>
                            <div>
                              <label className="block text-sm font-medium mb-1">Descrição</label>
                              <Input
                                value={stage.description}
                                onChange={(e) => {
                                  const newStages = [...initialStages]
                                  newStages[index].description = e.target.value
                                  setInitialStages(newStages)
                                }}
                                placeholder="Breve descrição do estágio"
                                className="focus:ring-2 focus:ring-violet-500 focus:border-violet-500 transition-all duration-200"
                              />
                            </div>
                            <div>
                              <label className="block text-sm font-medium mb-1">Ordem *</label>
                              <Input
                                type="number"
                                min="1"
                                value={stage.order}
                                onChange={(e) => {
                                  const newStages = [...initialStages]
                                  newStages[index].order = Number(e.target.value)
                                  setInitialStages(newStages)
                                }}
                                required
                                className="focus:ring-2 focus:ring-violet-500 focus:border-violet-500 transition-all duration-200"
                              />
                            </div>
                            <div>
                              <label className="block text-sm font-medium mb-1">Probabilidade (%) *</label>
                              <div className="flex items-center gap-2">
                                <Input
                                  type="number"
                                  min="0"
                                  max="100"
                                  value={stage.probability}
                                  onChange={(e) => {
                                    const newStages = [...initialStages]
                                    newStages[index].probability = Number(e.target.value)
                                    setInitialStages(newStages)
                                  }}
                                  required
                                  className="focus:ring-2 focus:ring-violet-500 focus:border-violet-500 transition-all duration-200"
                                />
                                <div className="w-16 h-10 rounded border flex items-center justify-center text-xs font-medium bg-violet-50 dark:bg-violet-950/20">
                                  {stage.probability}%
                                </div>
                              </div>
                            </div>
                          </div>
                          <div className="flex justify-end mt-3">
                            <Button
                              type="button"
                              size="sm"
                              variant="ghost"
                              onClick={() => {
                                const newStages = initialStages.filter((_, i) => i !== index)
                                // Reordenar
                                newStages.forEach((s, i) => { s.order = i + 1 })
                                setInitialStages(newStages)
                              }}
                              className="text-red-600 hover:text-red-700"
                            >
                              <Trash2 className="h-4 w-4" />
                            </Button>
                          </div>
                        </CardContent>
                      </Card>
                    ))}
                  </div>
                  
                  {initialStages.length === 0 && (
                    <p className="text-sm text-muted-foreground text-center py-4">
                      Nenhum estágio definido. Clique em "Adicionar Estágio" para começar.
                    </p>
                  )}
                </div>
              )}

              <div className="flex gap-2 pt-4 border-t">
                <Button 
                  type="submit"
                  className="bg-gradient-to-r from-violet-600 to-violet-700 hover:from-violet-700 hover:to-violet-800 text-white shadow-md hover:shadow-lg transition-all duration-200"
                >
                  {editingId ? 'Atualizar' : 'Criar'} Funil
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  onClick={resetFunnelForm}
                  className="border-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800"
                >
                  Cancelar
                </Button>
              </div>
            </form>
          </CardContent>
        </Card>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Lista de Funis */}
        <Card className="border-t-4 border-t-violet-500 bg-gradient-to-br from-violet-50/30 to-white dark:from-violet-950/10 dark:to-background">
          <CardHeader className="bg-gradient-to-r from-violet-50/50 to-transparent dark:from-violet-950/20">
            <CardTitle className="text-violet-900 dark:text-violet-100">Funis de Vendas</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-2">
              {funnels.map((funnel) => (
                <div
                  key={funnel.id}
                  onClick={() => setSelectedFunnelId(funnel.id)}
                  className={`p-3 rounded-lg border cursor-pointer transition-all ${
                    selectedFunnelId === funnel.id
                      ? 'border-violet-500 bg-violet-50 dark:bg-violet-950/20'
                      : 'border-gray-200 hover:border-violet-300 bg-white dark:bg-background'
                  }`}
                >
                  <div className="flex items-center justify-between">
                    <div className="flex-1">
                      <div className="flex items-center gap-2">
                        <h3 className="font-semibold">{funnel.name}</h3>
                        {funnel.is_default && (
                          <span className="text-xs bg-violet-100 text-violet-700 dark:bg-violet-900 dark:text-violet-200 px-2 py-1 rounded">
                            Padrão
                          </span>
                        )}
                      </div>
                      {funnel.description && (
                        <p className="text-sm text-muted-foreground mt-1">{funnel.description}</p>
                      )}
                    </div>
                    <div className="flex gap-2">
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={(e) => {
                          e.stopPropagation()
                          handleEditFunnel(funnel)
                        }}
                      >
                        <Edit className="h-4 w-4" />
                      </Button>
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={(e) => {
                          e.stopPropagation()
                          handleDeleteFunnel(funnel.id)
                        }}
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
            {funnels.length === 0 && (
              <p className="text-center text-muted-foreground py-4">Nenhum funil criado</p>
            )}
          </CardContent>
        </Card>

        {/* Estágios e Estatísticas */}
        {selectedFunnelId && (
          <div className="lg:col-span-2 space-y-6">
            {/* Estatísticas Gerais */}
            {funnelStats && showStats && (
              <Card className="border-t-4 border-t-violet-500 bg-gradient-to-br from-violet-50/30 to-white dark:from-violet-950/10 dark:to-background">
                <CardHeader className="bg-gradient-to-r from-violet-50/50 to-transparent dark:from-violet-950/20">
                  <div className="flex items-center justify-between">
                    <CardTitle className="text-violet-900 dark:text-violet-100">
                      Estatísticas do Funil: {funnelStats.funnel.name}
                    </CardTitle>
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() => setShowStats(!showStats)}
                    >
                      {showStats ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                    </Button>
                  </div>
                </CardHeader>
                <CardContent className="space-y-6">
                  {/* Resumo Geral */}
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                    <div className="p-4 rounded-lg bg-gradient-to-br from-violet-50 to-white dark:from-violet-950/20 dark:to-background border border-violet-200">
                      <div className="flex items-center gap-2 mb-2">
                        <Target className="h-5 w-5 text-violet-600" />
                        <span className="text-sm font-medium text-violet-700 dark:text-violet-300">Total de Oportunidades</span>
                      </div>
                      <p className="text-2xl font-bold text-violet-900 dark:text-violet-100">
                        {funnelStats.summary.total_opportunities}
                      </p>
                    </div>
                    <div className="p-4 rounded-lg bg-gradient-to-br from-emerald-50 to-white dark:from-emerald-950/20 dark:to-background border border-emerald-200">
                      <div className="flex items-center gap-2 mb-2">
                        <DollarSign className="h-5 w-5 text-emerald-600" />
                        <span className="text-sm font-medium text-emerald-700 dark:text-emerald-300">Valor Total</span>
                      </div>
                      <p className="text-2xl font-bold text-emerald-900 dark:text-emerald-100">
                        {formatCurrency(funnelStats.summary.total_value)}
                      </p>
                    </div>
                    <div className="p-4 rounded-lg bg-gradient-to-br from-blue-50 to-white dark:from-blue-950/20 dark:to-background border border-blue-200">
                      <div className="flex items-center gap-2 mb-2">
                        <TrendingUp className="h-5 w-5 text-blue-600" />
                        <span className="text-sm font-medium text-blue-700 dark:text-blue-300">Valor Ponderado</span>
                      </div>
                      <p className="text-2xl font-bold text-blue-900 dark:text-blue-100">
                        {formatCurrency(funnelStats.summary.weighted_value)}
                      </p>
                    </div>
                  </div>

                  {/* Gráfico de Oportunidades por Estágio */}
                  {funnelChartData.length > 0 && (
                    <div>
                      <h3 className="text-lg font-semibold mb-4 flex items-center gap-2">
                        <BarChart3 className="h-5 w-5 text-violet-600" />
                        Oportunidades por Estágio
                      </h3>
                      <ResponsiveContainer width="100%" height={300}>
                        <BarChart data={funnelChartData}>
                          <CartesianGrid strokeDasharray="3 3" />
                          <XAxis dataKey="name" />
                          <YAxis />
                          <Tooltip />
                          <Legend />
                          <Bar dataKey="oportunidades" fill="#8b5cf6" name="Oportunidades" />
                        </BarChart>
                      </ResponsiveContainer>
                    </div>
                  )}

                  {/* Gráfico de Valor por Estágio */}
                  {funnelChartData.length > 0 && (
                    <div>
                      <h3 className="text-lg font-semibold mb-4 flex items-center gap-2">
                        <DollarSign className="h-5 w-5 text-emerald-600" />
                        Valor por Estágio
                      </h3>
                      <ResponsiveContainer width="100%" height={300}>
                        <BarChart data={funnelChartData}>
                          <CartesianGrid strokeDasharray="3 3" />
                          <XAxis dataKey="name" />
                          <YAxis />
                          <Tooltip 
                            formatter={(value: number) => formatCurrency(value)}
                          />
                          <Legend />
                          <Bar dataKey="valor" fill="#10b981" name="Valor Total" />
                          <Bar dataKey="valorPonderado" fill="#3b82f6" name="Valor Ponderado" />
                        </BarChart>
                      </ResponsiveContainer>
                    </div>
                  )}

                  {/* Taxas de Conversão */}
                  {funnelStats.summary.conversion_rates.length > 0 && (
                    <div>
                      <h3 className="text-lg font-semibold mb-4 flex items-center gap-2">
                        <ArrowRight className="h-5 w-5 text-blue-600" />
                        Taxas de Conversão
                      </h3>
                      <div className="space-y-2">
                        {funnelStats.summary.conversion_rates.map((rate, index) => (
                          <div
                            key={index}
                            className="p-3 rounded-lg bg-gradient-to-r from-blue-50 to-white dark:from-blue-950/20 dark:to-background border border-blue-200"
                          >
                            <div className="flex items-center justify-between">
                              <div className="flex items-center gap-2">
                                <span className="font-medium">{rate.from_stage}</span>
                                <ArrowRight className="h-4 w-4 text-blue-600" />
                                <span className="font-medium">{rate.to_stage}</span>
                              </div>
                              <span className="text-lg font-bold text-blue-900 dark:text-blue-100">
                                {rate.rate.toFixed(1)}%
                              </span>
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </CardContent>
              </Card>
            )}

            {/* Estágios do Funil */}
            <Card className="border-t-4 border-t-violet-500 bg-gradient-to-br from-violet-50/30 to-white dark:from-violet-950/10 dark:to-background">
              <CardHeader className="bg-gradient-to-r from-violet-50/50 to-transparent dark:from-violet-950/20">
                <div className="flex items-center justify-between">
                  <CardTitle className="text-violet-900 dark:text-violet-100">
                    Estágios do Funil
                  </CardTitle>
                  <div className="flex gap-2">
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() => setShowStats(!showStats)}
                    >
                      {showStats ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                    </Button>
                    <Button
                      size="sm"
                      onClick={() => setShowStageForm(!showStageForm)}
                      className="bg-gradient-to-r from-violet-600 to-violet-700 hover:from-violet-700 hover:to-violet-800 text-white"
                    >
                      <Plus className="mr-2 h-4 w-4" />
                      Novo Estágio
                    </Button>
                  </div>
                </div>
              </CardHeader>
              <CardContent>
                {showStageForm && (
                  <Card className="mb-4 border-violet-200">
                    <CardContent className="pt-4">
                      <form onSubmit={handleStageSubmit} className="space-y-3">
                        <div>
                          <label className="block text-sm font-medium mb-1">Nome do Estágio *</label>
                          <Input
                            value={stageFormData.name}
                            onChange={(e) => setStageFormData({ ...stageFormData, name: e.target.value })}
                            required
                            className="focus:ring-2 focus:ring-violet-500 focus:border-violet-500 transition-all duration-200"
                          />
                        </div>
                        <div>
                          <label className="block text-sm font-medium mb-1">Descrição</label>
                          <Textarea
                            value={stageFormData.description}
                            onChange={(e) => setStageFormData({ ...stageFormData, description: e.target.value })}
                            rows={2}
                            className="focus:ring-2 focus:ring-violet-500 focus:border-violet-500 transition-all duration-200"
                          />
                        </div>
                        <div className="grid grid-cols-2 gap-3">
                          <div>
                            <label className="block text-sm font-medium mb-1">Ordem *</label>
                            <Input
                              type="number"
                              min="1"
                              value={stageFormData.order}
                              onChange={(e) => setStageFormData({ ...stageFormData, order: Number(e.target.value) })}
                              required
                              className="focus:ring-2 focus:ring-violet-500 focus:border-violet-500 transition-all duration-200"
                            />
                          </div>
                          <div>
                            <label className="block text-sm font-medium mb-1">Probabilidade (%) *</label>
                            <Input
                              type="number"
                              min="0"
                              max="100"
                              value={stageFormData.probability}
                              onChange={(e) => setStageFormData({ ...stageFormData, probability: Number(e.target.value) })}
                              required
                              className="focus:ring-2 focus:ring-violet-500 focus:border-violet-500 transition-all duration-200"
                            />
                          </div>
                        </div>
                        <div className="flex gap-2">
                          <Button 
                            type="submit"
                            size="sm"
                            className="bg-gradient-to-r from-violet-600 to-violet-700 hover:from-violet-700 hover:to-violet-800 text-white"
                          >
                            Salvar
                          </Button>
                          <Button
                            type="button"
                            size="sm"
                            variant="outline"
                            onClick={resetStageForm}
                          >
                            Cancelar
                          </Button>
                        </div>
                      </form>
                    </CardContent>
                  </Card>
                )}

                <div className="space-y-4">
                  {funnelStats?.stages.sort((a, b) => a.order - b.order).map((stageStat, index) => {
                    const stage = stages[selectedFunnelId]?.find(s => s.id === stageStat.stage_id)
                    const isExpanded = expandedStages.has(stageStat.stage_id)
                    
                    return (
                      <Card
                        key={stageStat.stage_id}
                        className="border-l-4 border-l-violet-500 bg-gradient-to-r from-white to-violet-50/30 dark:from-background dark:to-violet-950/20"
                      >
                        <CardHeader>
                          <div className="flex items-start justify-between">
                            <div className="flex-1">
                              <div className="flex items-center gap-3 mb-2">
                                <div className="flex items-center justify-center w-8 h-8 rounded-full bg-violet-100 dark:bg-violet-900/30 text-violet-700 dark:text-violet-300 font-bold">
                                  {stageStat.order}
                                </div>
                                <div>
                                  <CardTitle className="text-lg">{stageStat.stage_name}</CardTitle>
                                  {stage?.description && (
                                    <CardDescription className="mt-1">{stage.description}</CardDescription>
                                  )}
                                </div>
                              </div>
                              
                              {/* Estatísticas do Estágio */}
                              <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mt-4">
                                <div className="p-2 rounded-lg bg-blue-50 dark:bg-blue-950/20 border border-blue-200">
                                  <div className="flex items-center gap-2 mb-1">
                                    <Target className="h-4 w-4 text-blue-600" />
                                    <span className="text-xs font-medium text-blue-700 dark:text-blue-300">Probabilidade</span>
                                  </div>
                                  <p className="text-lg font-bold text-blue-900 dark:text-blue-100">
                                    {stageStat.probability}%
                                  </p>
                                </div>
                                <div className="p-2 rounded-lg bg-violet-50 dark:bg-violet-950/20 border border-violet-200">
                                  <div className="flex items-center gap-2 mb-1">
                                    <Users className="h-4 w-4 text-violet-600" />
                                    <span className="text-xs font-medium text-violet-700 dark:text-violet-300">Oportunidades</span>
                                  </div>
                                  <p className="text-lg font-bold text-violet-900 dark:text-violet-100">
                                    {stageStat.opportunity_count}
                                  </p>
                                </div>
                                <div className="p-2 rounded-lg bg-emerald-50 dark:bg-emerald-950/20 border border-emerald-200">
                                  <div className="flex items-center gap-2 mb-1">
                                    <DollarSign className="h-4 w-4 text-emerald-600" />
                                    <span className="text-xs font-medium text-emerald-700 dark:text-emerald-300">Valor Total</span>
                                  </div>
                                  <p className="text-sm font-bold text-emerald-900 dark:text-emerald-100">
                                    {formatCurrency(stageStat.total_value, stageStat.opportunities[0]?.currency || 'BRL')}
                                  </p>
                                </div>
                                <div className="p-2 rounded-lg bg-orange-50 dark:bg-orange-950/20 border border-orange-200">
                                  <div className="flex items-center gap-2 mb-1">
                                    <TrendingUp className="h-4 w-4 text-orange-600" />
                                    <span className="text-xs font-medium text-orange-700 dark:text-orange-300">Valor Médio</span>
                                  </div>
                                  <p className="text-sm font-bold text-orange-900 dark:text-orange-100">
                                    {formatCurrency(stageStat.average_value, stageStat.opportunities[0]?.currency || 'BRL')}
                                  </p>
                                </div>
                              </div>
                            </div>
                            
                            <div className="flex gap-2">
                              {stage && (
                                <>
                                  <Button
                                    size="sm"
                                    variant="ghost"
                                    onClick={() => handleEditStage(stage)}
                                  >
                                    <Edit className="h-4 w-4" />
                                  </Button>
                                  <Button
                                    size="sm"
                                    variant="ghost"
                                    onClick={() => handleDeleteStage(stage.id)}
                                  >
                                    <Trash2 className="h-4 w-4" />
                                  </Button>
                                </>
                              )}
                              {stageStat.opportunities.length > 0 && (
                                <Button
                                  size="sm"
                                  variant="ghost"
                                  onClick={() => toggleStageExpanded(stageStat.stage_id)}
                                >
                                  {isExpanded ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                                </Button>
                              )}
                            </div>
                          </div>
                        </CardHeader>
                        
                        {/* Lista de Oportunidades do Estágio */}
                        {isExpanded && stageStat.opportunities.length > 0 && (
                          <CardContent className="pt-0">
                            <div className="mt-4 pt-4 border-t">
                              <h4 className="font-semibold mb-3 text-sm">Oportunidades neste estágio:</h4>
                              <div className="space-y-2">
                                {stageStat.opportunities.map((opp) => (
                                  <div
                                    key={opp.id}
                                    className="p-3 rounded-lg bg-gray-50 dark:bg-gray-900 border border-gray-200 dark:border-gray-800"
                                  >
                                    <div className="flex items-center justify-between">
                                      <div className="flex-1">
                                        <p className="font-medium text-sm">{opp.name}</p>
                                        {opp.amount && (
                                          <p className="text-xs text-muted-foreground mt-1">
                                            {formatCurrency(opp.amount, opp.currency || 'BRL')}
                                          </p>
                                        )}
                                        {opp.expected_close_date && (
                                          <p className="text-xs text-muted-foreground mt-1">
                                            Fechamento previsto: {new Date(opp.expected_close_date).toLocaleDateString('pt-BR')}
                                          </p>
                                        )}
                                      </div>
                                    </div>
                                  </div>
                                ))}
                              </div>
                            </div>
                          </CardContent>
                        )}
                      </Card>
                    )
                  })}
                </div>
                
                {(!funnelStats || funnelStats.stages.length === 0) && (
                  <p className="text-center text-muted-foreground py-4">Nenhum estágio criado</p>
                )}
              </CardContent>
            </Card>
          </div>
        )}
      </div>
    </div>
  )
}
