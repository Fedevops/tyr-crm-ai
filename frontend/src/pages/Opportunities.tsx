import { useState, useEffect } from 'react'
import { useTranslation } from 'react-i18next'
import api from '@/lib/api'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { AdvancedFilters } from '@/components/AdvancedFilters'
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
  Target,
  Filter,
  FileText,
  XCircle
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
  
  // Selection and bulk actions
  const [selectedOpportunities, setSelectedOpportunities] = useState<Set<number>>(new Set())
  
  // Detail modal
  const [showOpportunityDetailModal, setShowOpportunityDetailModal] = useState(false)
  const [selectedOpportunityDetail, setSelectedOpportunityDetail] = useState<Opportunity | null>(null)
  const [activeTab, setActiveTab] = useState<'basicas' | 'empresa' | 'propostas' | 'comentarios'>('basicas')
  const [opportunityProposals, setOpportunityProposals] = useState<any[]>([])
  const [loadingProposals, setLoadingProposals] = useState(false)
  const [opportunityComments, setOpportunityComments] = useState<any[]>([])
  const [loadingComments, setLoadingComments] = useState(false)
  const [newComment, setNewComment] = useState('')
  const [addingComment, setAddingComment] = useState(false)
  
  // Advanced filters
  const [advancedFilters, setAdvancedFilters] = useState<Array<{
    id: string
    field: string
    operator: string
    value: string | number | boolean | null
    value2?: string | number | null
  }>>([])
  const [filterLogic, setFilterLogic] = useState<'AND' | 'OR'>('AND')
  
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
  }, [currentPage, pageSize, searchTerm, funnelFilter, statusFilter, advancedFilters, filterLogic])

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
      
      // Se houver filtros avançados, usar o endpoint de filtros
      if (advancedFilters.length > 0) {
        const validFilters = advancedFilters.filter(f => {
          if (f.operator === 'is_null' || f.operator === 'is_not_null') {
            return true
          }
          if (f.operator === 'between') {
            return f.value !== null && f.value !== '' && f.value2 !== null && f.value2 !== ''
          }
          return f.value !== null && f.value !== ''
        })
        
        if (validFilters.length === 0) {
          // Usar endpoint padrão se não houver filtros válidos
          const params: any = {
            skip: (currentPage - 1) * pageSize,
            limit: pageSize
          }
          
          if (searchTerm) {
            params.search = searchTerm
          }
          
          if (funnelFilter !== 'all') {
            params.funnel_id = funnelFilter
          }
          
          if (statusFilter !== 'all') {
            params.status_filter = statusFilter
          }
          
          const queryString = new URLSearchParams(params).toString()
          const response = await api.get(`/api/opportunities${queryString ? `?${queryString}` : ''}`)
          setOpportunities(response.data)
          
          const totalCount = response.headers['x-total-count']
          if (totalCount) {
            setTotalOpportunities(parseInt(totalCount, 10))
          } else {
            setTotalOpportunities(response.data.length)
          }
          
          // Carregar stages
          const uniqueFunnelIds = new Set<number>()
          funnels.forEach(f => uniqueFunnelIds.add(f.id))
          uniqueFunnelIds.forEach(funnelId => {
            if (!stages[funnelId]) {
              fetchStages(funnelId)
            }
          })
          return
        }
        
        const filtersRequest = {
          filters: validFilters.map(f => ({
            field: f.field,
            operator: f.operator,
            value: f.value,
            value2: f.value2
          })),
          logic: filterLogic,
          search: searchTerm || undefined,
          skip: (currentPage - 1) * pageSize,
          limit: pageSize
        }
        
        const response = await api.post('/api/opportunities/filter', filtersRequest)
        setOpportunities(response.data)
        
        const totalCount = response.headers['x-total-count']
        if (totalCount) {
          setTotalOpportunities(parseInt(totalCount, 10))
        } else {
          setTotalOpportunities(response.data.length)
        }
        
        // Carregar stages
        const uniqueFunnelIds = new Set<number>()
        funnels.forEach(f => uniqueFunnelIds.add(f.id))
        uniqueFunnelIds.forEach(funnelId => {
          if (!stages[funnelId]) {
            fetchStages(funnelId)
          }
        })
      } else {
        // Usar endpoint padrão se não houver filtros avançados
        const params: any = {
          skip: (currentPage - 1) * pageSize,
          limit: pageSize
        }
        
        if (searchTerm) {
          params.search = searchTerm
        }
        
        if (funnelFilter !== 'all') {
          params.funnel_id = funnelFilter
        }
        
        if (statusFilter !== 'all') {
          params.status_filter = statusFilter
        }
        
        const queryString = new URLSearchParams(params).toString()
        const response = await api.get(`/api/opportunities${queryString ? `?${queryString}` : ''}`)
        setOpportunities(response.data)
        
        const totalCount = response.headers['x-total-count']
        if (totalCount) {
          setTotalOpportunities(parseInt(totalCount, 10))
        } else {
          if (response.data.length < pageSize) {
            setTotalOpportunities((currentPage - 1) * pageSize + response.data.length)
          } else {
            setTotalOpportunities(currentPage * pageSize + 1)
          }
        }
        
        // Carregar stages
        const uniqueFunnelIds = new Set<number>()
        funnels.forEach(f => uniqueFunnelIds.add(f.id))
        uniqueFunnelIds.forEach(funnelId => {
          if (!stages[funnelId]) {
            fetchStages(funnelId)
          }
        })
      }
    } catch (error) {
      console.error('Error fetching opportunities:', error)
    } finally {
      setLoading(false)
    }
  }
  
  // Selection handlers
  const handleSelectAll = () => {
    if (selectedOpportunities.size === opportunities.length) {
      setSelectedOpportunities(new Set())
    } else {
      setSelectedOpportunities(new Set(opportunities.map(o => o.id)))
    }
  }
  
  const handleSelectOpportunity = (opportunityId: number) => {
    const newSelected = new Set(selectedOpportunities)
    if (newSelected.has(opportunityId)) {
      newSelected.delete(opportunityId)
    } else {
      newSelected.add(opportunityId)
    }
    setSelectedOpportunities(newSelected)
  }
  
  // Bulk actions
  const handleBulkDelete = async () => {
    const selected = Array.from(selectedOpportunities)
    if (selected.length === 0) {
      alert('Selecione pelo menos uma oportunidade')
      return
    }
    
    if (!confirm(`Tem certeza que deseja excluir ${selected.length} oportunidade(s)?`)) return
    
    try {
      await Promise.all(selected.map(id => api.delete(`/api/opportunities/${id}`)))
      setSelectedOpportunities(new Set())
      fetchOpportunities()
    } catch (error: any) {
      console.error('Error bulk deleting opportunities:', error)
      alert('Erro ao excluir oportunidades. Tente novamente.')
    }
  }
  
  const handleExportSelected = () => {
    const selected = opportunities.filter(o => selectedOpportunities.has(o.id))
    if (selected.length === 0) {
      alert('Selecione pelo menos uma oportunidade')
      return
    }
    
    // Criar CSV
    const headers = ['Nome', 'Empresa', 'Valor', 'Status', 'Probabilidade', 'Data Prevista']
    const rows = selected.map(o => [
      o.name || '',
      accounts.find(a => a.id === o.account_id)?.name || '',
      o.amount ? `${o.currency} ${o.amount}` : '',
      o.status,
      o.probability?.toString() || '',
      o.expected_close_date ? new Date(o.expected_close_date).toLocaleDateString('pt-BR') : ''
    ])
    
    const csv = [headers.join(','), ...rows.map(r => r.map(cell => `"${cell}"`).join(','))].join('\n')
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8-sig;' })
    const url = window.URL.createObjectURL(blob)
    const link = document.createElement('a')
    link.href = url
    link.setAttribute('download', `oportunidades_${new Date().toISOString().split('T')[0]}.csv`)
    document.body.appendChild(link)
    link.click()
    link.remove()
    window.URL.revokeObjectURL(url)
  }
  
  const totalPages = Math.ceil(totalOpportunities / pageSize)
  
  const handleOpenOpportunityDetail = (opportunity: Opportunity) => {
    setSelectedOpportunityDetail(opportunity)
    setShowOpportunityDetailModal(true)
    setActiveTab('basicas')
  }

  useEffect(() => {
    if (showOpportunityDetailModal && selectedOpportunityDetail?.id) {
      fetchOpportunityProposals(selectedOpportunityDetail.id)
      fetchOpportunityComments(selectedOpportunityDetail.id)
    }
  }, [showOpportunityDetailModal, selectedOpportunityDetail?.id])

  const fetchOpportunityProposals = async (opportunityId: number) => {
    try {
      setLoadingProposals(true)
      const response = await api.get(`/api/proposals?opportunity_id=${opportunityId}`)
      setOpportunityProposals(response.data || [])
    } catch (error) {
      console.error('Error fetching opportunity proposals:', error)
      setOpportunityProposals([])
    } finally {
      setLoadingProposals(false)
    }
  }

  const fetchOpportunityComments = async (opportunityId: number) => {
    try {
      setLoadingComments(true)
      const response = await api.get(`/api/opportunities/${opportunityId}/comments`)
      setOpportunityComments(response.data || [])
    } catch (error) {
      console.error('Error fetching opportunity comments:', error)
      setOpportunityComments([])
    } finally {
      setLoadingComments(false)
    }
  }

  const handleAddComment = async () => {
    if (!selectedOpportunityDetail || !newComment.trim()) return
    
    try {
      setAddingComment(true)
      const response = await api.post(`/api/opportunities/${selectedOpportunityDetail.id}/comments`, {
        comment: newComment.trim()
      })
      
      setOpportunityComments([response.data, ...opportunityComments])
      setNewComment('')
      
      const oppResponse = await api.get(`/api/opportunities/${selectedOpportunityDetail.id}`)
      setSelectedOpportunityDetail(prev => prev ? { ...prev, updated_at: oppResponse.data.updated_at } : oppResponse.data)
    } catch (error: any) {
      console.error('Error adding comment:', error)
      alert(error.response?.data?.detail || 'Erro ao adicionar comentário')
    } finally {
      setAddingComment(false)
    }
  }

  const handleDeleteComment = async (commentId: number) => {
    if (!confirm('Tem certeza que deseja excluir este comentário?')) return
    
    try {
      await api.delete(`/api/opportunities/comments/${commentId}`)
      setOpportunityComments(prevComments => prevComments.filter(c => c.id !== commentId))
      
      if (selectedOpportunityDetail) {
        const oppResponse = await api.get(`/api/opportunities/${selectedOpportunityDetail.id}`)
        setSelectedOpportunityDetail(prev => prev ? { ...prev, updated_at: oppResponse.data.updated_at } : oppResponse.data)
      }
    } catch (error: any) {
      console.error('Error deleting comment:', error)
      alert(error.response?.data?.detail || 'Erro ao excluir comentário')
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

      {/* Selection and Filters */}
      <Card className="border-t-4 border-t-emerald-500 bg-gradient-to-br from-emerald-50/30 to-white dark:from-emerald-950/10 dark:to-background">
        <CardHeader className="bg-gradient-to-r from-emerald-50/50 to-transparent dark:from-emerald-950/20">
          <div className="flex items-center justify-between">
            <CardTitle className="flex items-center gap-2 text-emerald-900 dark:text-emerald-100">
              <Filter className="h-5 w-5 text-emerald-600 dark:text-emerald-400" />
              Filtros
            </CardTitle>
            <div className="flex items-center gap-2">
              <input
                type="checkbox"
                checked={selectedOpportunities.size > 0 && selectedOpportunities.size === opportunities.length}
                onChange={handleSelectAll}
                className="h-4 w-4"
              />
              <span className="text-sm text-muted-foreground">
                Selecionar todos
              </span>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          <div className="grid gap-4 md:grid-cols-3 mb-4">
            <div className="space-y-2">
              <label className="text-sm font-medium">Buscar</label>
              <div className="relative">
                <Search className="absolute left-2 top-2.5 h-4 w-4 text-muted-foreground" />
                <Input
                  placeholder="Nome da oportunidade..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="pl-8"
                />
              </div>
            </div>
            <div className="space-y-2">
              <label className="text-sm font-medium">Funil</label>
              <select
                value={funnelFilter}
                onChange={(e) => setFunnelFilter(e.target.value === 'all' ? 'all' : Number(e.target.value))}
                className="w-full px-3 py-2 border rounded-md"
              >
                <option value="all">Todos os funis</option>
                {funnels.map(funnel => (
                  <option key={funnel.id} value={funnel.id}>{funnel.name}</option>
                ))}
              </select>
            </div>
            <div className="space-y-2">
              <label className="text-sm font-medium">Status</label>
              <select
                value={statusFilter}
                onChange={(e) => setStatusFilter(e.target.value as any)}
                className="w-full px-3 py-2 border rounded-md"
              >
                <option value="all">Todos os status</option>
                <option value="open">Aberta</option>
                <option value="won">Ganha</option>
                <option value="lost">Perdida</option>
                <option value="on_hold">Em Espera</option>
              </select>
            </div>
          </div>
          
          {/* Filtros Avançados */}
          <AdvancedFilters
            filters={advancedFilters}
            onFiltersChange={setAdvancedFilters}
            logic={filterLogic}
            onLogicChange={setFilterLogic}
          />
        </CardContent>
      </Card>
      
      {/* Bulk Actions Bar */}
      {selectedOpportunities.size > 0 && (
        <Card className="bg-gradient-to-r from-emerald-50 to-blue-50 dark:from-emerald-950 dark:to-blue-950 border-emerald-300 dark:border-emerald-700 shadow-md">
          <CardContent className="py-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-4">
                <span className="font-medium text-emerald-900 dark:text-emerald-100">
                  {selectedOpportunities.size} oportunidade(s) selecionada(s)
                </span>
                <Button
                  size="sm"
                  variant="outline"
                  className="border-emerald-300 hover:bg-emerald-100 dark:hover:bg-emerald-900"
                  onClick={() => setSelectedOpportunities(new Set())}
                >
                  Limpar Seleção
                </Button>
              </div>
              <div className="flex gap-2">
                <Button
                  size="sm"
                  variant="outline"
                  onClick={handleExportSelected}
                >
                  <FileText className="h-4 w-4 mr-1" />
                  Exportar
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={handleBulkDelete}
                  className="text-red-600 hover:text-red-700 hover:bg-red-50 dark:hover:bg-red-950"
                >
                  <Trash2 className="h-4 w-4 mr-1" />
                  Excluir
                </Button>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      <div className="grid gap-4">
        {opportunities.map((opportunity) => {
          const account = accounts.find(a => a.id === opportunity.account_id)
          const contact = contacts.find(c => c.id === opportunity.contact_id)
          const stage = allStages.find(s => s.id === opportunity.stage_id)
          
          return (
            <Card 
              key={opportunity.id}
              className="cursor-pointer hover:shadow-lg transition-all duration-200 border-l-4 border-l-emerald-300 hover:border-l-emerald-500 bg-gradient-to-r from-white to-emerald-50/50 dark:from-background dark:to-emerald-950/50"
              onClick={() => handleOpenOpportunityDetail(opportunity)}
            >
              <CardHeader>
                <div className="flex items-start justify-between">
                  <div className="flex items-start gap-3 flex-1">
                    <input
                      type="checkbox"
                      checked={selectedOpportunities.has(opportunity.id)}
                      onChange={() => handleSelectOpportunity(opportunity.id)}
                      className="mt-1 h-4 w-4"
                      onClick={(e) => e.stopPropagation()}
                    />
                    <div className="flex-1">
                      <CardTitle className="flex items-center gap-2">
                        {opportunity.name}
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
                      </CardTitle>
                      <CardDescription className="mt-2 space-y-1">
                        {account && (
                          <div className="flex items-center gap-2">
                            <Building className="h-4 w-4" />
                            <span>{account.name}</span>
                          </div>
                        )}
                        {contact && (
                          <div className="flex items-center gap-2">
                            <User className="h-4 w-4" />
                            <span>{contact.first_name} {contact.last_name}</span>
                          </div>
                        )}
                        {opportunity.amount && (
                          <div className="flex items-center gap-2">
                            <DollarSign className="h-4 w-4" />
                            <span className="font-semibold">
                              {new Intl.NumberFormat('pt-BR', { style: 'currency', currency: opportunity.currency }).format(opportunity.amount)}
                            </span>
                          </div>
                        )}
                        {opportunity.probability !== null && (
                          <div className="flex items-center gap-2 text-sm">
                            <Target className="h-4 w-4" />
                            <span>Probabilidade: {opportunity.probability}%</span>
                          </div>
                        )}
                        {opportunity.expected_close_date && (
                          <div className="flex items-center gap-2 text-sm">
                            <Calendar className="h-4 w-4" />
                            <span>Fechamento previsto: {new Date(opportunity.expected_close_date).toLocaleDateString('pt-BR')}</span>
                          </div>
                        )}
                        {opportunity.owner && (
                          <div className="flex items-center gap-2 text-sm">
                            <User className="h-4 w-4" />
                            <span>Responsável: {opportunity.owner.full_name}</span>
                          </div>
                        )}
                        {opportunity.owner_id && !opportunity.owner && (
                          <div className="flex items-center gap-2 text-sm">
                            <User className="h-4 w-4" />
                            <span>Responsável: {users.find(u => u.id === opportunity.owner_id)?.full_name || `ID: ${opportunity.owner_id}`}</span>
                          </div>
                        )}
                      </CardDescription>
                    </div>
                  </div>
                  <div className="flex gap-2">
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={(e) => {
                        e.stopPropagation()
                        handleEdit(opportunity)
                      }}
                    >
                      <Edit className="h-4 w-4" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={(e) => {
                        e.stopPropagation()
                        handleDelete(opportunity.id)
                      }}
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                </div>
              </CardHeader>
              {opportunity.description && (
                <CardContent>
                  <p className="text-sm text-muted-foreground">{opportunity.description}</p>
                </CardContent>
              )}
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
        <Card>
          <CardContent className="py-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-4">
                <span className="text-sm text-muted-foreground">
                  Mostrando {((currentPage - 1) * pageSize) + 1} a {Math.min(currentPage * pageSize, totalOpportunities)} de {totalOpportunities}
                </span>
                <select
                  value={pageSize}
                  onChange={(e) => {
                    setPageSize(Number(e.target.value))
                    setCurrentPage(1)
                  }}
                  className="px-2 py-1 border rounded text-sm"
                >
                  <option value={10}>10 por página</option>
                  <option value={20}>20 por página</option>
                  <option value={50}>50 por página</option>
                  <option value={100}>100 por página</option>
                </select>
              </div>
              <div className="flex items-center gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setCurrentPage(1)}
                  disabled={currentPage === 1}
                >
                  Primeira
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setCurrentPage(p => Math.max(1, p - 1))}
                  disabled={currentPage === 1}
                >
                  Anterior
                </Button>
                <span className="text-sm px-3">
                  Página {currentPage} de {totalPages}
                </span>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))}
                  disabled={currentPage === totalPages}
                >
                  Próxima
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setCurrentPage(totalPages)}
                  disabled={currentPage === totalPages}
                >
                  Última
                </Button>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Modal de Detalhes da Oportunidade */}
      {showOpportunityDetailModal && selectedOpportunityDetail && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
          <Card className="w-full max-w-4xl h-[90vh] overflow-hidden flex flex-col">
            <CardHeader className="border-b flex-shrink-0">
              <div className="flex items-center justify-between">
                <CardTitle className="text-2xl">Detalhes da Oportunidade</CardTitle>
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={() => {
                    setShowOpportunityDetailModal(false)
                    setSelectedOpportunityDetail(null)
                    setActiveTab('basicas')
                  }}
                >
                  <XCircle className="h-5 w-5" />
                </Button>
              </div>
            </CardHeader>
            
            {/* Abas */}
            <div className="border-b px-6 flex-shrink-0">
              <div className="flex gap-1 overflow-x-auto">
                <button
                  onClick={() => setActiveTab('basicas')}
                  className={`px-4 py-3 text-sm font-medium border-b-2 transition-colors whitespace-nowrap ${
                    activeTab === 'basicas'
                      ? 'border-primary text-primary'
                      : 'border-transparent text-muted-foreground hover:text-foreground'
                  }`}
                >
                  Informações Básicas
                </button>
                <button
                  onClick={() => setActiveTab('empresa')}
                  className={`px-4 py-3 text-sm font-medium border-b-2 transition-colors whitespace-nowrap ${
                    activeTab === 'empresa'
                      ? 'border-primary text-primary'
                      : 'border-transparent text-muted-foreground hover:text-foreground'
                  }`}
                >
                  Empresa e Contato
                </button>
                <button
                  onClick={() => setActiveTab('propostas')}
                  className={`px-4 py-3 text-sm font-medium border-b-2 transition-colors whitespace-nowrap ${
                    activeTab === 'propostas'
                      ? 'border-primary text-primary'
                      : 'border-transparent text-muted-foreground hover:text-foreground'
                  }`}
                >
                  Propostas
                </button>
                <button
                  onClick={() => setActiveTab('comentarios')}
                  className={`px-4 py-3 text-sm font-medium border-b-2 transition-colors whitespace-nowrap ${
                    activeTab === 'comentarios'
                      ? 'border-primary text-primary'
                      : 'border-transparent text-muted-foreground hover:text-foreground'
                  }`}
                >
                  Comentários
                </button>
              </div>
            </div>

            <CardContent className="flex-1 overflow-y-auto p-6">
              {/* Aba: Informações Básicas */}
              {activeTab === 'basicas' && (() => {
                const detailStage = allStages.find(s => s.id === selectedOpportunityDetail.stage_id)
                return (
                  <div className="space-y-4">
                    <div className="grid gap-4 md:grid-cols-2">
                      <div>
                        <label className="text-sm font-medium text-muted-foreground">Nome da Oportunidade</label>
                        <p className="text-base font-medium mt-1">{selectedOpportunityDetail.name}</p>
                      </div>
                      <div>
                        <label className="text-sm font-medium text-muted-foreground">Status</label>
                        <p className="mt-1">
                          <span className={`text-xs px-2 py-1 rounded ${getStatusColor(selectedOpportunityDetail.status)}`}>
                            {selectedOpportunityDetail.status === 'open' ? 'Aberta' : 
                             selectedOpportunityDetail.status === 'won' ? 'Ganha' : 
                             selectedOpportunityDetail.status === 'lost' ? 'Perdida' : 'Em Espera'}
                          </span>
                        </p>
                      </div>
                      {selectedOpportunityDetail.amount && (
                        <div>
                          <label className="text-sm font-medium text-muted-foreground">Valor</label>
                          <p className="text-base mt-1 flex items-center gap-2">
                            <DollarSign className="h-4 w-4" />
                            <span className="font-semibold">
                              {new Intl.NumberFormat('pt-BR', { style: 'currency', currency: selectedOpportunityDetail.currency }).format(selectedOpportunityDetail.amount)}
                            </span>
                          </p>
                        </div>
                      )}
                      {selectedOpportunityDetail.probability !== null && (
                        <div>
                          <label className="text-sm font-medium text-muted-foreground">Probabilidade</label>
                          <p className="text-base mt-1 flex items-center gap-2">
                            <Target className="h-4 w-4" />
                            {selectedOpportunityDetail.probability}%
                          </p>
                        </div>
                      )}
                      {selectedOpportunityDetail.expected_close_date && (
                        <div>
                          <label className="text-sm font-medium text-muted-foreground">Data Prevista de Fechamento</label>
                          <p className="text-base mt-1 flex items-center gap-2">
                            <Calendar className="h-4 w-4" />
                            {new Date(selectedOpportunityDetail.expected_close_date).toLocaleDateString('pt-BR')}
                          </p>
                        </div>
                      )}
                      {selectedOpportunityDetail.actual_close_date && (
                        <div>
                          <label className="text-sm font-medium text-muted-foreground">Data de Fechamento</label>
                          <p className="text-base mt-1 flex items-center gap-2">
                            <Calendar className="h-4 w-4" />
                            {new Date(selectedOpportunityDetail.actual_close_date).toLocaleDateString('pt-BR')}
                          </p>
                        </div>
                      )}
                      {selectedOpportunityDetail.owner && (
                        <div>
                          <label className="text-sm font-medium text-muted-foreground">Responsável</label>
                          <p className="text-base mt-1 flex items-center gap-2">
                            <User className="h-4 w-4" />
                            {selectedOpportunityDetail.owner.full_name}
                          </p>
                        </div>
                      )}
                      {detailStage && (
                        <div>
                          <label className="text-sm font-medium text-muted-foreground">Estágio</label>
                          <p className="text-base mt-1">
                            <span className="text-xs bg-blue-100 text-blue-700 dark:bg-blue-900 dark:text-blue-200 px-2 py-1 rounded">
                              {detailStage.name} ({detailStage.probability}%)
                            </span>
                          </p>
                        </div>
                      )}
                    </div>
                    {selectedOpportunityDetail.description && (
                      <div className="mt-4">
                        <label className="text-sm font-medium text-muted-foreground">Descrição</label>
                        <p className="text-base mt-1">{selectedOpportunityDetail.description}</p>
                      </div>
                    )}
                    {selectedOpportunityDetail.notes && (
                      <div className="mt-4">
                        <label className="text-sm font-medium text-muted-foreground">Notas</label>
                        <p className="text-base mt-1">{selectedOpportunityDetail.notes}</p>
                      </div>
                    )}
                  </div>
                )
              })()}

              {/* Aba: Empresa e Contato */}
              {activeTab === 'empresa' && (() => {
                const detailAccount = accounts.find(a => a.id === selectedOpportunityDetail.account_id)
                const detailContact = contacts.find(c => c.id === selectedOpportunityDetail.contact_id)
                
                return (
                  <div className="space-y-4">
                    {detailAccount && (
                      <div>
                        <label className="text-sm font-medium text-muted-foreground">Empresa</label>
                        <p className="text-base mt-1 flex items-center gap-2">
                          <Building className="h-4 w-4" />
                          {detailAccount.name}
                        </p>
                      </div>
                    )}
                    {detailContact && (
                      <div>
                        <label className="text-sm font-medium text-muted-foreground">Contato</label>
                        <p className="text-base mt-1 flex items-center gap-2">
                          <User className="h-4 w-4" />
                          {detailContact.first_name} {detailContact.last_name}
                        </p>
                      </div>
                    )}
                    {!detailAccount && !detailContact && (
                      <p className="text-sm text-muted-foreground">Nenhuma empresa ou contato associado.</p>
                    )}
                  </div>
                )
              })()}

              {/* Aba: Propostas */}
              {activeTab === 'propostas' && (
                <div className="space-y-4">
                  {loadingProposals ? (
                    <div className="text-center py-4 text-muted-foreground">Carregando propostas...</div>
                  ) : opportunityProposals.length === 0 ? (
                    <p className="text-sm text-muted-foreground">Nenhuma proposta associada a esta oportunidade.</p>
                  ) : (
                    <div className="space-y-3">
                      {opportunityProposals.map((proposal) => (
                        <Card key={proposal.id} className="border-l-4 border-l-amber-400">
                          <CardHeader className="pb-3">
                            <div className="flex items-start justify-between">
                              <div className="flex-1">
                                <CardTitle className="text-base">{proposal.title}</CardTitle>
                                <CardDescription className="mt-1">
                                  {proposal.amount && (
                                    <span className="font-semibold text-amber-600 dark:text-amber-400">
                                      {new Intl.NumberFormat('pt-BR', { style: 'currency', currency: proposal.currency || 'BRL' }).format(proposal.amount)}
                                    </span>
                                  )}
                                </CardDescription>
                              </div>
                              <span className={`text-xs px-2 py-1 rounded ${
                                proposal.status === 'accepted' ? 'bg-green-100 text-green-700 dark:bg-green-900 dark:text-green-200' :
                                proposal.status === 'rejected' ? 'bg-red-100 text-red-700 dark:bg-red-900 dark:text-red-200' :
                                proposal.status === 'sent' ? 'bg-blue-100 text-blue-700 dark:bg-blue-900 dark:text-blue-200' :
                                proposal.status === 'expired' ? 'bg-gray-100 text-gray-700 dark:bg-gray-900 dark:text-gray-200' :
                                'bg-yellow-100 text-yellow-700 dark:bg-yellow-900 dark:text-yellow-200'
                              }`}>
                                {proposal.status === 'draft' ? 'Rascunho' :
                                 proposal.status === 'sent' ? 'Enviada' :
                                 proposal.status === 'accepted' ? 'Aceita' :
                                 proposal.status === 'rejected' ? 'Rejeitada' :
                                 proposal.status === 'expired' ? 'Expirada' : proposal.status}
                              </span>
                            </div>
                          </CardHeader>
                          <CardContent className="space-y-2">
                            {proposal.valid_until && (
                              <div className="text-xs text-muted-foreground">
                                Válida até: {new Date(proposal.valid_until).toLocaleDateString('pt-BR')}
                              </div>
                            )}
                            {proposal.sent_at && (
                              <div className="text-xs text-muted-foreground">
                                Enviada em: {new Date(proposal.sent_at).toLocaleDateString('pt-BR')}
                              </div>
                            )}
                            {proposal.accepted_at && (
                              <div className="text-xs text-green-600">
                                Aceita em: {new Date(proposal.accepted_at).toLocaleDateString('pt-BR')}
                              </div>
                            )}
                            {proposal.rejected_at && (
                              <div className="text-xs text-red-600">
                                Rejeitada em: {new Date(proposal.rejected_at).toLocaleDateString('pt-BR')}
                                {proposal.rejection_reason && (
                                  <div className="mt-1">Motivo: {proposal.rejection_reason}</div>
                                )}
                              </div>
                            )}
                            {proposal.content && (
                              <div className="text-sm text-muted-foreground mt-2 line-clamp-3">
                                {proposal.content}
                              </div>
                            )}
                          </CardContent>
                        </Card>
                      ))}
                    </div>
                  )}
                </div>
              )}

              {/* Aba: Comentários */}
              {activeTab === 'comentarios' && (
                <div className="space-y-6">
                  <div>
                    <h3 className="text-lg font-semibold mb-4">Comentários</h3>
                    
                    {/* Formulário para adicionar comentário */}
                    <div className="mb-4 space-y-2">
                      <Textarea
                        placeholder="Adicione um comentário sobre esta oportunidade..."
                        value={newComment}
                        onChange={(e) => setNewComment(e.target.value)}
                        rows={3}
                        className="w-full"
                      />
                      <div className="flex justify-end">
                        <Button
                          onClick={handleAddComment}
                          disabled={!newComment.trim() || addingComment}
                          size="sm"
                        >
                          {addingComment ? 'Adicionando...' : 'Adicionar Comentário'}
                        </Button>
                      </div>
                    </div>

                    {/* Lista de comentários */}
                    {loadingComments ? (
                      <p className="text-sm text-muted-foreground">Carregando comentários...</p>
                    ) : opportunityComments.length === 0 ? (
                      <p className="text-sm text-muted-foreground">Nenhum comentário ainda. Seja o primeiro a comentar!</p>
                    ) : (
                      <div className="space-y-3">
                        {opportunityComments.map((comment) => (
                          <div
                            key={comment.id}
                            className="bg-gray-50 dark:bg-gray-900 p-4 rounded-lg border"
                          >
                            <div className="flex items-start justify-between mb-2">
                              <div className="flex-1">
                                <div className="flex items-center gap-2 mb-1">
                                  <User className="h-4 w-4 text-muted-foreground" />
                                  <span className="font-medium text-sm">
                                    {comment.user_name || comment.user_email || 'Usuário'}
                                  </span>
                                  <span className="text-xs text-muted-foreground">
                                    • {new Date(comment.created_at).toLocaleString('pt-BR')}
                                  </span>
                                </div>
                                <p className="text-sm whitespace-pre-wrap mt-2">{comment.comment}</p>
                              </div>
                              <Button
                                variant="ghost"
                                size="icon"
                                className="h-6 w-6"
                                onClick={() => handleDeleteComment(comment.id)}
                                title="Excluir comentário"
                              >
                                <Trash2 className="h-3 w-3" />
                              </Button>
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      )}
    </div>
  )
}

