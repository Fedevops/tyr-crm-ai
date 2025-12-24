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
  Send,
  CheckCircle2,
  XCircle,
  FileText,
  DollarSign,
  Calendar
} from 'lucide-react'

interface Proposal {
  id: number
  opportunity_id: number
  title: string
  content: string
  amount: number
  currency: string
  valid_until: string | null
  status: 'draft' | 'sent' | 'accepted' | 'rejected' | 'expired'
  sent_at: string | null
  accepted_at: string | null
  rejected_at: string | null
  rejection_reason: string | null
  notes: string | null
  owner_id: number
  created_by_id: number
  created_at: string
  updated_at: string
}

interface Opportunity {
  id: number
  name: string
  account_id: number
}

export function Proposals() {
  const { t } = useTranslation()
  const [proposals, setProposals] = useState<Proposal[]>([])
  const [opportunities, setOpportunities] = useState<Opportunity[]>([])
  const [loading, setLoading] = useState(true)
  const [showForm, setShowForm] = useState(false)
  const [editingId, setEditingId] = useState<number | null>(null)
  const [searchTerm, setSearchTerm] = useState('')
  const [statusFilter, setStatusFilter] = useState<'all' | 'draft' | 'sent' | 'accepted' | 'rejected' | 'expired'>('all')
  const [currentPage, setCurrentPage] = useState(1)
  const [pageSize, setPageSize] = useState(20)
  const [totalProposals, setTotalProposals] = useState(0)
  
  const [formData, setFormData] = useState({
    opportunity_id: null as number | null,
    title: '',
    content: '',
    amount: '',
    currency: 'BRL',
    valid_until: '',
    notes: ''
  })

  useEffect(() => {
    fetchOpportunities()
    fetchProposals()
  }, [currentPage, pageSize, searchTerm, statusFilter])

  const fetchOpportunities = async () => {
    try {
      const response = await api.get('/api/opportunities?limit=1000')
      setOpportunities(response.data)
    } catch (error) {
      console.error('Error fetching opportunities:', error)
    }
  }

  const fetchProposals = async () => {
    try {
      setLoading(true)
      const params = new URLSearchParams({
        skip: String((currentPage - 1) * pageSize),
        limit: String(pageSize)
      })
      
      if (searchTerm) {
        params.append('search', searchTerm)
      }
      
      if (statusFilter !== 'all') {
        params.append('status_filter', statusFilter)
      }
      
      const response = await api.get(`/api/proposals?${params.toString()}`)
      setProposals(response.data)
      setTotalProposals(response.data.length)
    } catch (error) {
      console.error('Error fetching proposals:', error)
    } finally {
      setLoading(false)
    }
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!formData.opportunity_id) {
      alert('Oportunidade é obrigatória')
      return
    }
    
    try {
      const payload = {
        ...formData,
        opportunity_id: formData.opportunity_id,
        amount: parseFloat(formData.amount),
        valid_until: formData.valid_until || null
      }
      
      if (editingId) {
        await api.put(`/api/proposals/${editingId}`, payload)
      } else {
        await api.post('/api/proposals', payload)
      }
      resetForm()
      fetchProposals()
    } catch (error: any) {
      console.error('Error saving proposal:', error)
      alert(error.response?.data?.detail || 'Erro ao salvar proposta')
    }
  }

  const handleEdit = (proposal: Proposal) => {
    setEditingId(proposal.id)
    setFormData({
      opportunity_id: proposal.opportunity_id,
      title: proposal.title || '',
      content: proposal.content || '',
      amount: String(proposal.amount),
      currency: proposal.currency || 'BRL',
      valid_until: proposal.valid_until ? proposal.valid_until.split('T')[0] : '',
      notes: proposal.notes || ''
    })
    setShowForm(true)
  }

  const handleDelete = async (id: number) => {
    if (!confirm('Tem certeza que deseja excluir esta proposta?')) return
    
    try {
      await api.delete(`/api/proposals/${id}`)
      fetchProposals()
    } catch (error: any) {
      console.error('Error deleting proposal:', error)
      alert(error.response?.data?.detail || 'Erro ao excluir proposta')
    }
  }

  const handleSend = async (id: number) => {
    try {
      await api.post(`/api/proposals/${id}/send`)
      fetchProposals()
    } catch (error: any) {
      console.error('Error sending proposal:', error)
      alert(error.response?.data?.detail || 'Erro ao enviar proposta')
    }
  }

  const handleAccept = async (id: number) => {
    try {
      await api.post(`/api/proposals/${id}/accept`)
      fetchProposals()
    } catch (error: any) {
      console.error('Error accepting proposal:', error)
      alert(error.response?.data?.detail || 'Erro ao aceitar proposta')
    }
  }

  const handleReject = async (id: number) => {
    const reason = prompt('Motivo da rejeição (opcional):')
    try {
      await api.post(`/api/proposals/${id}/reject`, null, {
        params: { rejection_reason: reason || null }
      })
      fetchProposals()
    } catch (error: any) {
      console.error('Error rejecting proposal:', error)
      alert(error.response?.data?.detail || 'Erro ao rejeitar proposta')
    }
  }

  const resetForm = () => {
    setFormData({
      opportunity_id: null,
      title: '',
      content: '',
      amount: '',
      currency: 'BRL',
      valid_until: '',
      notes: ''
    })
    setEditingId(null)
    setShowForm(false)
  }

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'accepted': return 'bg-gradient-to-r from-emerald-500 to-emerald-600 text-white'
      case 'rejected': return 'bg-gradient-to-r from-red-500 to-red-600 text-white'
      case 'sent': return 'bg-gradient-to-r from-blue-500 to-blue-600 text-white'
      case 'expired': return 'bg-gradient-to-r from-gray-500 to-gray-600 text-white'
      default: return 'bg-gradient-to-r from-yellow-500 to-yellow-600 text-white'
    }
  }

  const getStatusLabel = (status: string) => {
    switch (status) {
      case 'draft': return 'Rascunho'
      case 'sent': return 'Enviada'
      case 'accepted': return 'Aceita'
      case 'rejected': return 'Rejeitada'
      case 'expired': return 'Expirada'
      default: return status
    }
  }

  if (loading && proposals.length === 0) {
    return <div className="flex-1 space-y-6 p-6">Carregando...</div>
  }

  return (
    <div className="flex-1 space-y-6 p-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold">Propostas Comerciais</h1>
          <p className="text-muted-foreground">Gerencie suas propostas comerciais</p>
        </div>
        <Button 
          onClick={() => setShowForm(!showForm)}
          className="bg-gradient-to-r from-amber-600 to-amber-700 hover:from-amber-700 hover:to-amber-800 text-white shadow-md hover:shadow-lg transition-all duration-200"
        >
          <Plus className="mr-2 h-4 w-4" />
          Nova Proposta
        </Button>
      </div>

      {showForm && (
        <Card className="border-t-4 border-t-amber-500 bg-gradient-to-br from-amber-50/30 to-white dark:from-amber-950/10 dark:to-background">
          <CardHeader className="bg-gradient-to-r from-amber-50/50 to-transparent dark:from-amber-950/20">
            <CardTitle className="text-amber-900 dark:text-amber-100">
              {editingId ? 'Editar' : 'Nova'} Proposta
            </CardTitle>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleSubmit} className="space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium mb-1">Oportunidade *</label>
                  <select
                    value={formData.opportunity_id || ''}
                    onChange={(e) => setFormData({ ...formData, opportunity_id: e.target.value ? Number(e.target.value) : null })}
                    required
                    className="w-full px-3 py-2 border rounded-md focus:ring-2 focus:ring-amber-500 focus:border-amber-500 transition-all duration-200"
                  >
                    <option value="">Selecione uma oportunidade</option>
                    {opportunities.map(opp => (
                      <option key={opp.id} value={opp.id}>{opp.name}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-medium mb-1">Título *</label>
                  <Input
                    value={formData.title}
                    onChange={(e) => setFormData({ ...formData, title: e.target.value })}
                    required
                    className="focus:ring-2 focus:ring-amber-500 focus:border-amber-500 transition-all duration-200"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium mb-1">Valor *</label>
                  <div className="flex gap-2">
                    <Input
                      type="number"
                      step="0.01"
                      value={formData.amount}
                      onChange={(e) => setFormData({ ...formData, amount: e.target.value })}
                      required
                      className="focus:ring-2 focus:ring-amber-500 focus:border-amber-500 transition-all duration-200"
                    />
                    <select
                      value={formData.currency}
                      onChange={(e) => setFormData({ ...formData, currency: e.target.value })}
                      className="w-24 px-3 py-2 border rounded-md focus:ring-2 focus:ring-amber-500 focus:border-amber-500 transition-all duration-200"
                    >
                      <option value="BRL">BRL</option>
                      <option value="USD">USD</option>
                      <option value="EUR">EUR</option>
                    </select>
                  </div>
                </div>
                <div>
                  <label className="block text-sm font-medium mb-1">Válida até</label>
                  <Input
                    type="date"
                    value={formData.valid_until}
                    onChange={(e) => setFormData({ ...formData, valid_until: e.target.value })}
                    className="focus:ring-2 focus:ring-amber-500 focus:border-amber-500 transition-all duration-200"
                  />
                </div>
              </div>
              <div>
                <label className="block text-sm font-medium mb-1">Conteúdo *</label>
                <Textarea
                  value={formData.content}
                  onChange={(e) => setFormData({ ...formData, content: e.target.value })}
                  rows={10}
                  required
                  className="focus:ring-2 focus:ring-amber-500 focus:border-amber-500 transition-all duration-200"
                  placeholder="Digite o conteúdo da proposta..."
                />
              </div>
              <div>
                <label className="block text-sm font-medium mb-1">Notas</label>
                <Textarea
                  value={formData.notes}
                  onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
                  rows={2}
                  className="focus:ring-2 focus:ring-amber-500 focus:border-amber-500 transition-all duration-200"
                />
              </div>
              <div className="flex gap-2">
                <Button 
                  type="submit"
                  className="bg-gradient-to-r from-amber-600 to-amber-700 hover:from-amber-700 hover:to-amber-800 text-white shadow-md hover:shadow-lg transition-all duration-200"
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

      <Card className="border-t-4 border-t-amber-500 bg-gradient-to-br from-amber-50/30 to-white dark:from-amber-950/10 dark:to-background">
        <CardHeader className="bg-gradient-to-r from-amber-50/50 to-transparent dark:from-amber-950/20">
          <CardTitle className="text-amber-900 dark:text-amber-100">Filtros</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <Input
                placeholder="Buscar propostas..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="focus:ring-2 focus:ring-amber-500 focus:border-amber-500 transition-all duration-200"
              />
            </div>
            <div>
              <select
                value={statusFilter}
                onChange={(e) => setStatusFilter(e.target.value as any)}
                className="w-full px-3 py-2 border rounded-md focus:ring-2 focus:ring-amber-500 focus:border-amber-500 transition-all duration-200"
              >
                <option value="all">Todos os status</option>
                <option value="draft">Rascunho</option>
                <option value="sent">Enviada</option>
                <option value="accepted">Aceita</option>
                <option value="rejected">Rejeitada</option>
                <option value="expired">Expirada</option>
              </select>
            </div>
          </div>
        </CardContent>
      </Card>

      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
        {proposals.map((proposal) => {
          const opportunity = opportunities.find(o => o.id === proposal.opportunity_id)
          
          return (
            <Card 
              key={proposal.id}
              className="border-l-4 border-l-amber-400 hover:border-l-amber-600 transition-all duration-200 bg-gradient-to-r from-white to-amber-50/30 dark:from-background dark:to-amber-950/20 hover:shadow-lg"
            >
              <CardHeader>
                <div className="flex items-start justify-between">
                  <div className="flex-1">
                    <CardTitle className="text-amber-900 dark:text-amber-100">{proposal.title}</CardTitle>
                    {opportunity && (
                      <CardDescription className="text-amber-700/80 dark:text-amber-300/80">
                        {opportunity.name}
                      </CardDescription>
                    )}
                  </div>
                  <div className="flex gap-2">
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() => handleEdit(proposal)}
                      disabled={proposal.status !== 'draft'}
                    >
                      <Edit className="h-4 w-4" />
                    </Button>
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() => handleDelete(proposal.id)}
                      disabled={proposal.status === 'accepted'}
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                </div>
              </CardHeader>
              <CardContent className="space-y-3">
                <div className="flex items-center gap-2">
                  <span className={`text-xs px-2 py-1 rounded ${getStatusColor(proposal.status)}`}>
                    {getStatusLabel(proposal.status)}
                  </span>
                </div>
                <div className="flex items-center gap-2 text-sm">
                  <DollarSign className="h-4 w-4 text-amber-600" />
                  <span className="font-semibold">
                    {new Intl.NumberFormat('pt-BR', { style: 'currency', currency: proposal.currency }).format(proposal.amount)}
                  </span>
                </div>
                {proposal.valid_until && (
                  <div className="flex items-center gap-2 text-sm">
                    <Calendar className="h-4 w-4 text-amber-600" />
                    <span className="text-muted-foreground">
                      Válida até: {new Date(proposal.valid_until).toLocaleDateString('pt-BR')}
                    </span>
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
                <div className="flex gap-2 pt-2 border-t">
                  {proposal.status === 'draft' && (
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => handleSend(proposal.id)}
                      className="text-xs"
                    >
                      <Send className="mr-1 h-3 w-3" />
                      Enviar
                    </Button>
                  )}
                  {proposal.status === 'sent' && (
                    <>
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => handleAccept(proposal.id)}
                        className="text-xs text-green-600"
                      >
                        <CheckCircle2 className="mr-1 h-3 w-3" />
                        Aceitar
                      </Button>
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => handleReject(proposal.id)}
                        className="text-xs text-red-600"
                      >
                        <XCircle className="mr-1 h-3 w-3" />
                        Rejeitar
                      </Button>
                    </>
                  )}
                </div>
              </CardContent>
            </Card>
          )
        })}
      </div>

      {proposals.length === 0 && !loading && (
        <Card>
          <CardContent className="py-8 text-center">
            <p className="text-muted-foreground">Nenhuma proposta encontrada</p>
          </CardContent>
        </Card>
      )}

      {/* Pagination */}
      {totalProposals > pageSize && (
        <div className="flex items-center justify-between">
          <div className="text-sm text-muted-foreground">
            Mostrando {((currentPage - 1) * pageSize) + 1} a {Math.min(currentPage * pageSize, totalProposals)} de {totalProposals}
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
              disabled={currentPage * pageSize >= totalProposals}
            >
              Próxima
            </Button>
          </div>
        </div>
      )}
    </div>
  )
}

