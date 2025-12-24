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
  Search, 
  Building,
  User,
  TrendingUp,
  DollarSign,
  Calendar,
  Target
} from 'lucide-react'

interface Opportunity {
  id: number
  account_id: number
  contact_id: number | null
  stage_id: number
  name: string
  description: string | null
  amount: number | null
  currency: string
  expected_close_date: string | null
  actual_close_date: string | null
  status: 'open' | 'won' | 'lost' | 'on_hold'
  probability: number | null
  notes: string | null
  owner_id: number | null
  owner?: {
    id: number
    full_name: string
    email: string
  }
  created_by_id: number
  created_at: string
  updated_at: string
}

interface Account {
  id: number
  name: string
}

interface Contact {
  id: number
  first_name: string
  last_name: string
}

interface SalesStage {
  id: number
  funnel_id: number
  name: string
  order: number
  probability: number
}

interface SalesFunnel {
  id: number
  name: string
  is_default: boolean
}

export function Opportunities() {
  const { t } = useTranslation()
  const [opportunities, setOpportunities] = useState<Opportunity[]>([])
  const [accounts, setAccounts] = useState<Account[]>([])
  const [contacts, setContacts] = useState<Contact[]>([])
  const [funnels, setFunnels] = useState<SalesFunnel[]>([])
  const [stages, setStages] = useState<Record<number, SalesStage[]>>({})
  const [loading, setLoading] = useState(true)
  const [showForm, setShowForm] = useState(false)
  const [editingId, setEditingId] = useState<number | null>(null)
  const [searchTerm, setSearchTerm] = useState('')
  const [funnelFilter, setFunnelFilter] = useState<number | 'all'>('all')
  const [statusFilter, setStatusFilter] = useState<'all' | 'open' | 'won' | 'lost' | 'on_hold'>('all')
  const [currentPage, setCurrentPage] = useState(1)
  const [pageSize, setPageSize] = useState(20)
  const [totalOpportunities, setTotalOpportunities] = useState(0)
  
  const [formData, setFormData] = useState({
    account_id: null as number | null,
    contact_id: null as number | null,
    stage_id: null as number | null,
    name: '',
    description: '',
    amount: '',
    currency: 'BRL',
    expected_close_date: '',
    probability: null as number | null,
    notes: '',
    owner_id: null as number | null
  })
  const [users, setUsers] = useState<Array<{id: number, full_name: string, email: string}>>([])

  useEffect(() => {
    fetchUsers()
    fetchAccounts()
    fetchContacts()
    fetchFunnels()
    fetchOpportunities()
  }, [currentPage, pageSize, searchTerm, funnelFilter, statusFilter])

  const fetchUsers = async () => {
    try {
      const response = await api.get('/api/users')
      setUsers(response.data)
    } catch (error) {
      console.error('Error fetching users:', error)
    }
  }

  useEffect(() => {
    if (funnels.length > 0) {
      const defaultFunnel = funnels.find(f => f.is_default) || funnels[0]
      if (defaultFunnel) {
        fetchStages(defaultFunnel.id)
        if (!formData.stage_id) {
          // Selecionar primeiro estágio do funil padrão
          fetchStages(defaultFunnel.id).then(() => {
            // Isso será atualizado quando stages forem carregados
          })
        }
      }
    }
  }, [funnels])

  useEffect(() => {
    if (formData.stage_id && stages[Object.keys(stages)[0] as any]) {
      const selectedStage = Object.values(stages).flat().find(s => s.id === formData.stage_id)
      if (selectedStage && !formData.probability) {
        setFormData(prev => ({ ...prev, probability: selectedStage.probability }))
      }
    }
  }, [formData.stage_id, stages])

  const fetchAccounts = async () => {
    try {
      const response = await api.get('/api/accounts?limit=1000')
      setAccounts(response.data)
    } catch (error) {
      console.error('Error fetching accounts:', error)
    }
  }

  const fetchContacts = async () => {
    try {
      const response = await api.get('/api/contacts?limit=1000')
      setContacts(response.data)
    } catch (error) {
      console.error('Error fetching contacts:', error)
    }
  }

  const fetchFunnels = async () => {
    try {
      const response = await api.get('/api/sales-funnels')
      setFunnels(response.data)
    } catch (error) {
      console.error('Error fetching funnels:', error)
    }
  }

  const fetchStages = async (funnelId: number) => {
    try {
      const response = await api.get(`/api/sales-funnels/${funnelId}/stages`)
      setStages(prev => ({ ...prev, [funnelId]: response.data.sort((a: SalesStage, b: SalesStage) => a.order - b.order) }))
    } catch (error) {
      console.error('Error fetching stages:', error)
    }
  }

  const fetchOpportunities = async () => {
    try {
      setLoading(true)
      const params = new URLSearchParams({
        skip: String((currentPage - 1) * pageSize),
        limit: String(pageSize)
      })
      
      if (searchTerm) {
        params.append('search', searchTerm)
      }
      
      if (funnelFilter !== 'all') {
        params.append('funnel_id', String(funnelFilter))
      }
      
      if (statusFilter !== 'all') {
        params.append('status_filter', statusFilter)
      }
      
      const response = await api.get(`/api/opportunities?${params.toString()}`)
      setOpportunities(response.data)
      setTotalOpportunities(response.data.length)
      
      // Carregar stages para as opportunities
      const uniqueFunnelIds = new Set<number>()
      response.data.forEach((opp: Opportunity) => {
        // Precisamos descobrir qual funil o stage pertence
        // Por enquanto, vamos carregar todos os funis
        funnels.forEach(f => uniqueFunnelIds.add(f.id))
      })
      uniqueFunnelIds.forEach(funnelId => {
        if (!stages[funnelId]) {
          fetchStages(funnelId)
        }
      })
    } catch (error) {
      console.error('Error fetching opportunities:', error)
    } finally {
      setLoading(false)
    }
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!formData.account_id || !formData.stage_id) {
      alert('Empresa e Estágio são obrigatórios')
      return
    }
    
    try {
      const payload = {
        ...formData,
        account_id: formData.account_id,
        stage_id: formData.stage_id,
        contact_id: formData.contact_id || null,
        amount: formData.amount ? parseFloat(formData.amount) : null,
        expected_close_date: formData.expected_close_date || null,
        probability: formData.probability || null,
        owner_id: formData.owner_id || null
      }
      
      if (editingId) {
        await api.put(`/api/opportunities/${editingId}`, payload)
      } else {
        await api.post('/api/opportunities', payload)
      }
      resetForm()
      fetchOpportunities()
    } catch (error: any) {
      console.error('Error saving opportunity:', error)
      alert(error.response?.data?.detail || 'Erro ao salvar oportunidade')
    }
  }

  const handleEdit = (opportunity: Opportunity) => {
    setEditingId(opportunity.id)
    setFormData({
      account_id: opportunity.account_id,
      contact_id: opportunity.contact_id,
      stage_id: opportunity.stage_id,
      name: opportunity.name || '',
      description: opportunity.description || '',
      amount: opportunity.amount ? String(opportunity.amount) : '',
      currency: opportunity.currency || 'BRL',
      expected_close_date: opportunity.expected_close_date ? opportunity.expected_close_date.split('T')[0] : '',
      probability: opportunity.probability,
      notes: opportunity.notes || '',
      owner_id: opportunity.owner_id || null
    })
    
    // Carregar stages do funil relacionado
    const stage = Object.values(stages).flat().find(s => s.id === opportunity.stage_id)
    if (stage) {
      fetchStages(stage.funnel_id)
    }
    
    setShowForm(true)
  }

  const handleDelete = async (id: number) => {
    if (!confirm('Tem certeza que deseja excluir esta oportunidade?')) return
    
    try {
      await api.delete(`/api/opportunities/${id}`)
      fetchOpportunities()
    } catch (error: any) {
      console.error('Error deleting opportunity:', error)
      alert(error.response?.data?.detail || 'Erro ao excluir oportunidade')
    }
  }

  const handleStatusChange = async (id: number, newStatus: 'open' | 'won' | 'lost' | 'on_hold') => {
    try {
      await api.patch(`/api/opportunities/${id}/status?new_status=${newStatus}`)
      fetchOpportunities()
    } catch (error: any) {
      console.error('Error updating status:', error)
      alert(error.response?.data?.detail || 'Erro ao atualizar status')
    }
  }

  const handleStageChange = async (id: number, newStageId: number) => {
    try {
      await api.patch(`/api/opportunities/${id}/stage?new_stage_id=${newStageId}`)
      fetchOpportunities()
    } catch (error: any) {
      console.error('Error updating stage:', error)
      alert(error.response?.data?.detail || 'Erro ao atualizar estágio')
    }
  }

  const resetForm = () => {
    setFormData({
      account_id: null,
      contact_id: null,
      stage_id: null,
      name: '',
      description: '',
      amount: '',
      currency: 'BRL',
      expected_close_date: '',
      probability: null,
      notes: '',
      owner_id: null
    })
    setEditingId(null)
    setShowForm(false)
  }

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'won': return 'bg-gradient-to-r from-emerald-500 to-emerald-600 text-white'
      case 'lost': return 'bg-gradient-to-r from-red-500 to-red-600 text-white'
      case 'on_hold': return 'bg-gradient-to-r from-yellow-500 to-yellow-600 text-white'
      default: return 'bg-gradient-to-r from-blue-500 to-blue-600 text-white'
    }
  }

  if (loading && opportunities.length === 0) {
    return <div className="flex-1 space-y-6 p-6">Carregando...</div>
  }

  const allStages = Object.values(stages).flat()

  return (
    <div className="flex-1 space-y-6 p-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold">Oportunidades</h1>
          <p className="text-muted-foreground">Gerencie suas oportunidades de negócio</p>
        </div>
        <Button 
          onClick={() => setShowForm(!showForm)}
          className="bg-gradient-to-r from-emerald-600 to-emerald-700 hover:from-emerald-700 hover:to-emerald-800 text-white shadow-md hover:shadow-lg transition-all duration-200"
        >
          <Plus className="mr-2 h-4 w-4" />
          Nova Oportunidade
        </Button>
      </div>

      {showForm && (
        <Card className="border-t-4 border-t-emerald-500 bg-gradient-to-br from-emerald-50/30 to-white dark:from-emerald-950/10 dark:to-background">
          <CardHeader className="bg-gradient-to-r from-emerald-50/50 to-transparent dark:from-emerald-950/20">
            <CardTitle className="text-emerald-900 dark:text-emerald-100">
              {editingId ? 'Editar' : 'Nova'} Oportunidade
            </CardTitle>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleSubmit} className="space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium mb-1">Empresa *</label>
                  <select
                    value={formData.account_id || ''}
                    onChange={(e) => {
                      const accountId = e.target.value ? Number(e.target.value) : null
                      setFormData({ ...formData, account_id: accountId })
                      // Filtrar contatos da empresa selecionada
                    }}
                    required
                    className="w-full px-3 py-2 border rounded-md focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500 transition-all duration-200"
                  >
                    <option value="">Selecione uma empresa</option>
                    {accounts.map(account => (
                      <option key={account.id} value={account.id}>{account.name}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-medium mb-1">Contato</label>
                  <select
                    value={formData.contact_id || ''}
                    onChange={(e) => setFormData({ ...formData, contact_id: e.target.value ? Number(e.target.value) : null })}
                    className="w-full px-3 py-2 border rounded-md focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500 transition-all duration-200"
                  >
                    <option value="">Nenhum</option>
                    {contacts
                      .filter(c => !formData.account_id || c.account_id === formData.account_id)
                      .map(contact => (
                        <option key={contact.id} value={contact.id}>
                          {contact.first_name} {contact.last_name}
                        </option>
                      ))}
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-medium mb-1">Nome da Oportunidade *</label>
                  <Input
                    value={formData.name}
                    onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                    required
                    className="focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500 transition-all duration-200"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium mb-1">Estágio *</label>
                  <select
                    value={formData.stage_id || ''}
                    onChange={(e) => {
                      const stageId = e.target.value ? Number(e.target.value) : null
                      const selectedStage = allStages.find(s => s.id === stageId)
                      setFormData({ 
                        ...formData, 
                        stage_id: stageId,
                        probability: selectedStage?.probability || null
                      })
                    }}
                    required
                    className="w-full px-3 py-2 border rounded-md focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500 transition-all duration-200"
                  >
                    <option value="">Selecione um estágio</option>
                    {funnels.map(funnel => {
                      const funnelStages = stages[funnel.id] || []
                      return (
                        <optgroup key={funnel.id} label={funnel.name}>
                          {funnelStages.map(stage => (
                            <option key={stage.id} value={stage.id}>
                              {stage.name} ({stage.probability}%)
                            </option>
                          ))}
                        </optgroup>
                      )
                    })}
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-medium mb-1">Valor</label>
                  <div className="flex gap-2">
                    <Input
                      type="number"
                      step="0.01"
                      value={formData.amount}
                      onChange={(e) => setFormData({ ...formData, amount: e.target.value })}
                      placeholder="0.00"
                      className="focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500 transition-all duration-200"
                    />
                    <select
                      value={formData.currency}
                      onChange={(e) => setFormData({ ...formData, currency: e.target.value })}
                      className="w-24 px-3 py-2 border rounded-md focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500 transition-all duration-200"
                    >
                      <option value="BRL">BRL</option>
                      <option value="USD">USD</option>
                      <option value="EUR">EUR</option>
                    </select>
                  </div>
                </div>
                <div>
                  <label className="block text-sm font-medium mb-1">Data Prevista de Fechamento</label>
                  <Input
                    type="date"
                    value={formData.expected_close_date}
                    onChange={(e) => setFormData({ ...formData, expected_close_date: e.target.value })}
                    className="focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500 transition-all duration-200"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium mb-1">Probabilidade (%)</label>
                  <Input
                    type="number"
                    min="0"
                    max="100"
                    value={formData.probability || ''}
                    onChange={(e) => setFormData({ ...formData, probability: e.target.value ? Number(e.target.value) : null })}
                    className="focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500 transition-all duration-200"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium mb-1">Responsável</label>
                  <select
                    value={formData.owner_id || ''}
                    onChange={(e) => setFormData({ ...formData, owner_id: e.target.value ? parseInt(e.target.value) : null })}
                    className="w-full px-3 py-2 border rounded-md focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500 transition-all duration-200"
                  >
                    <option value="">Sem responsável</option>
                    {users.map((user) => (
                      <option key={user.id} value={user.id}>
                        {user.full_name} ({user.email})
                      </option>
                    ))}
                  </select>
                </div>
              </div>
              <div>
                <label className="block text-sm font-medium mb-1">Descrição</label>
                <Textarea
                  value={formData.description}
                  onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                  rows={3}
                  className="focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500 transition-all duration-200"
                />
              </div>
              <div>
                <label className="block text-sm font-medium mb-1">Notas</label>
                <Textarea
                  value={formData.notes}
                  onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
                  rows={2}
                  className="focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500 transition-all duration-200"
                />
              </div>
              <div className="flex gap-2">
                <Button 
                  type="submit"
                  className="bg-gradient-to-r from-emerald-600 to-emerald-700 hover:from-emerald-700 hover:to-emerald-800 text-white shadow-md hover:shadow-lg transition-all duration-200"
                >
                  Salvar
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  onClick={resetForm}
                  className="border-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800"
                >
                  Cancelar
                </Button>
              </div>
            </form>
          </CardContent>
        </Card>
      )}

      <Card className="border-t-4 border-t-emerald-500 bg-gradient-to-br from-emerald-50/30 to-white dark:from-emerald-950/10 dark:to-background">
        <CardHeader className="bg-gradient-to-r from-emerald-50/50 to-transparent dark:from-emerald-950/20">
          <CardTitle className="text-emerald-900 dark:text-emerald-100">Filtros</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div>
              <Input
                placeholder="Buscar oportunidades..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500 transition-all duration-200"
              />
            </div>
            <div>
              <select
                value={funnelFilter}
                onChange={(e) => setFunnelFilter(e.target.value === 'all' ? 'all' : Number(e.target.value))}
                className="w-full px-3 py-2 border rounded-md focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500 transition-all duration-200"
              >
                <option value="all">Todos os funis</option>
                {funnels.map(funnel => (
                  <option key={funnel.id} value={funnel.id}>{funnel.name}</option>
                ))}
              </select>
            </div>
            <div>
              <select
                value={statusFilter}
                onChange={(e) => setStatusFilter(e.target.value as any)}
                className="w-full px-3 py-2 border rounded-md focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500 transition-all duration-200"
              >
                <option value="all">Todos os status</option>
                <option value="open">Aberta</option>
                <option value="won">Ganha</option>
                <option value="lost">Perdida</option>
                <option value="on_hold">Em Espera</option>
              </select>
            </div>
          </div>
        </CardContent>
      </Card>

      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
        {opportunities.map((opportunity) => {
          const account = accounts.find(a => a.id === opportunity.account_id)
          const contact = contacts.find(c => c.id === opportunity.contact_id)
          const stage = allStages.find(s => s.id === opportunity.stage_id)
          
          return (
            <Card 
              key={opportunity.id}
              className="border-l-4 border-l-emerald-400 hover:border-l-emerald-600 transition-all duration-200 bg-gradient-to-r from-white to-emerald-50/30 dark:from-background dark:to-emerald-950/20 hover:shadow-lg"
            >
              <CardHeader>
                <div className="flex items-start justify-between">
                  <div className="flex-1">
                    <CardTitle className="text-emerald-900 dark:text-emerald-100">{opportunity.name}</CardTitle>
                    {account && (
                      <CardDescription className="text-emerald-700/80 dark:text-emerald-300/80">
                        {account.name}
                      </CardDescription>
                    )}
                    {opportunity.owner && (
                      <CardDescription className="text-xs text-muted-foreground mt-1 flex items-center gap-1">
                        <User className="h-3 w-3" />
                        Responsável: {opportunity.owner.full_name}
                      </CardDescription>
                    )}
                    {opportunity.owner_id && !opportunity.owner && (
                      <CardDescription className="text-xs text-muted-foreground mt-1 flex items-center gap-1">
                        <User className="h-3 w-3" />
                        Responsável: {users.find(u => u.id === opportunity.owner_id)?.full_name || `ID: ${opportunity.owner_id}`}
                      </CardDescription>
                    )}
                  </div>
                  <div className="flex gap-2">
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() => handleEdit(opportunity)}
                    >
                      <Edit className="h-4 w-4" />
                    </Button>
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() => handleDelete(opportunity.id)}
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                </div>
              </CardHeader>
              <CardContent className="space-y-3">
                <div className="flex items-center gap-2">
                  <span className={`text-xs px-2 py-1 rounded ${getStatusColor(opportunity.status)}`}>
                    {opportunity.status === 'open' ? 'Aberta' : 
                     opportunity.status === 'won' ? 'Ganha' : 
                     opportunity.status === 'lost' ? 'Perdida' : 'Em Espera'}
                  </span>
                  {stage && (
                    <span className="text-xs bg-blue-100 text-blue-700 dark:bg-blue-900 dark:text-blue-200 px-2 py-1 rounded">
                      {stage.name}
                    </span>
                  )}
                </div>
                {opportunity.amount && (
                  <div className="flex items-center gap-2 text-sm">
                    <DollarSign className="h-4 w-4 text-emerald-600" />
                    <span className="font-semibold">
                      {new Intl.NumberFormat('pt-BR', { style: 'currency', currency: opportunity.currency }).format(opportunity.amount)}
                    </span>
                  </div>
                )}
                {opportunity.probability !== null && (
                  <div className="flex items-center gap-2 text-sm">
                    <Target className="h-4 w-4 text-emerald-600" />
                    <span className="text-muted-foreground">Probabilidade: {opportunity.probability}%</span>
                  </div>
                )}
                {opportunity.expected_close_date && (
                  <div className="flex items-center gap-2 text-sm">
                    <Calendar className="h-4 w-4 text-emerald-600" />
                    <span className="text-muted-foreground">
                      Fechamento previsto: {new Date(opportunity.expected_close_date).toLocaleDateString('pt-BR')}
                    </span>
                  </div>
                )}
                {contact && (
                  <div className="flex items-center gap-2 text-sm">
                    <User className="h-4 w-4 text-emerald-600" />
                    <span className="text-muted-foreground">{contact.first_name} {contact.last_name}</span>
                  </div>
                )}
                <div className="flex gap-2 pt-2 border-t">
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => {
                      const newStatus = opportunity.status === 'open' ? 'won' : 'open'
                      handleStatusChange(opportunity.id, newStatus)
                    }}
                    className="text-xs"
                  >
                    {opportunity.status === 'open' ? 'Marcar como Ganha' : 'Reabrir'}
                  </Button>
                </div>
              </CardContent>
            </Card>
          )
        })}
      </div>

      {opportunities.length === 0 && !loading && (
        <Card>
          <CardContent className="py-8 text-center">
            <p className="text-muted-foreground">Nenhuma oportunidade encontrada</p>
          </CardContent>
        </Card>
      )}

      {/* Pagination */}
      {totalOpportunities > pageSize && (
        <div className="flex items-center justify-between">
          <div className="text-sm text-muted-foreground">
            Mostrando {((currentPage - 1) * pageSize) + 1} a {Math.min(currentPage * pageSize, totalOpportunities)} de {totalOpportunities}
          </div>
          <div className="flex gap-2">
            <Button
              variant="outline"
              onClick={() => setCurrentPage(p => Math.max(1, p - 1))}
              disabled={currentPage === 1}
            >
              Anterior
            </Button>
            <Button
              variant="outline"
              onClick={() => setCurrentPage(p => p + 1)}
              disabled={currentPage * pageSize >= totalOpportunities}
            >
              Próxima
            </Button>
          </div>
        </div>
      )}
    </div>
  )
}

