import { useState, useEffect } from 'react'
import { useTranslation } from 'react-i18next'
import api, { proposalTemplatesApi } from '@/lib/api'
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
  Send,
  CheckCircle2,
  XCircle,
  FileText,
  DollarSign,
  Calendar,
  User,
  Filter,
  Download,
  X,
  FileDown
} from 'lucide-react'

interface Proposal {
  id: number
  opportunity_id: number
  template_id?: number | null
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

interface Opportunity {
  id: number
  name: string
  account_id: number
}

export function Proposals() {
  const { t } = useTranslation()
  const [proposals, setProposals] = useState<Proposal[]>([])
  const [opportunities, setOpportunities] = useState<Opportunity[]>([])
  const [templates, setTemplates] = useState<Array<{id: number, name: string, description?: string}>>([])
  const [loading, setLoading] = useState(true)
  const [showForm, setShowForm] = useState(false)
  const [editingId, setEditingId] = useState<number | null>(null)
  const [searchTerm, setSearchTerm] = useState('')
  const [statusFilter, setStatusFilter] = useState<'all' | 'draft' | 'sent' | 'accepted' | 'rejected' | 'expired'>('all')
  const [currentPage, setCurrentPage] = useState(1)
  const [pageSize, setPageSize] = useState(20)
  const [totalProposals, setTotalProposals] = useState(0)
  
  // Selection and bulk actions
  const [selectedProposals, setSelectedProposals] = useState<Set<number>>(new Set())
  
  // Detail modal
  const [showProposalDetailModal, setShowProposalDetailModal] = useState(false)
  const [selectedProposalDetail, setSelectedProposalDetail] = useState<Proposal | null>(null)
  const [activeTab, setActiveTab] = useState<'basicas' | 'oportunidade' | 'comentarios'>('basicas')
  const [proposalComments, setProposalComments] = useState<any[]>([])
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
    opportunity_id: null as number | null,
    template_id: null as number | null,
    title: '',
    content: '',
    amount: '',
    currency: 'BRL',
    valid_until: '',
    notes: '',
    owner_id: null as number | null
  })
  const [users, setUsers] = useState<Array<{id: number, full_name: string, email: string}>>([])

  useEffect(() => {
    fetchUsers()
    fetchOpportunities()
    fetchTemplates()
    fetchProposals()
  }, [currentPage, pageSize, searchTerm, statusFilter, advancedFilters, filterLogic])

  const fetchUsers = async () => {
    try {
      const response = await api.get('/api/users')
      setUsers(response.data)
    } catch (error) {
      console.error('Error fetching users:', error)
    }
  }

  const fetchOpportunities = async () => {
    try {
      const response = await api.get('/api/opportunities?limit=1000')
      setOpportunities(response.data)
    } catch (error) {
      console.error('Error fetching opportunities:', error)
    }
  }

  const fetchTemplates = async () => {
    try {
      const response = await proposalTemplatesApi.getTemplates(true) // Apenas templates ativos
      setTemplates(response.data || [])
    } catch (error) {
      console.error('Error fetching templates:', error)
    }
  }

  const fetchProposals = async () => {
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
          
          if (statusFilter !== 'all') {
            params.status_filter = statusFilter
          }
          
          const queryString = new URLSearchParams(params).toString()
          const response = await api.get(`/api/proposals${queryString ? `?${queryString}` : ''}`)
          setProposals(response.data)
          
          const totalCount = response.headers['x-total-count']
          if (totalCount) {
            setTotalProposals(parseInt(totalCount, 10))
          } else {
            setTotalProposals(response.data.length)
          }
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
        
        const response = await api.post('/api/proposals/filter', filtersRequest)
        setProposals(response.data)
        
        const totalCount = response.headers['x-total-count']
        if (totalCount) {
          setTotalProposals(parseInt(totalCount, 10))
        } else {
          setTotalProposals(response.data.length)
        }
      } else {
        // Usar endpoint padrão se não houver filtros avançados
        const params: any = {
          skip: (currentPage - 1) * pageSize,
          limit: pageSize
        }
        
        if (searchTerm) {
          params.search = searchTerm
        }
        
        if (statusFilter !== 'all') {
          params.status_filter = statusFilter
        }
        
        const queryString = new URLSearchParams(params).toString()
        const response = await api.get(`/api/proposals${queryString ? `?${queryString}` : ''}`)
        setProposals(response.data)
        
        const totalCount = response.headers['x-total-count']
        if (totalCount) {
          setTotalProposals(parseInt(totalCount, 10))
        } else {
          if (response.data.length < pageSize) {
            setTotalProposals((currentPage - 1) * pageSize + response.data.length)
          } else {
            setTotalProposals(currentPage * pageSize + 1)
          }
        }
      }
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
        template_id: formData.template_id || null,
        amount: parseFloat(formData.amount),
        valid_until: formData.valid_until || null,
        owner_id: formData.owner_id || null
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
      template_id: proposal.template_id || null,
      title: proposal.title || '',
      content: proposal.content || '',
      amount: String(proposal.amount),
      currency: proposal.currency || 'BRL',
      valid_until: proposal.valid_until ? proposal.valid_until.split('T')[0] : '',
      notes: proposal.notes || '',
      owner_id: proposal.owner_id || null
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
      template_id: null,
      title: '',
      content: '',
      amount: '',
      currency: 'BRL',
      valid_until: '',
      notes: '',
      owner_id: null
    })
    setEditingId(null)
    setShowForm(false)
  }

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'accepted': return 'bg-green-100 text-green-700 dark:bg-green-900 dark:text-green-200'
      case 'rejected': return 'bg-red-100 text-red-700 dark:bg-red-900 dark:text-red-200'
      case 'sent': return 'bg-blue-100 text-blue-700 dark:bg-blue-900 dark:text-blue-200'
      case 'expired': return 'bg-gray-100 text-gray-700 dark:bg-gray-900 dark:text-gray-200'
      default: return 'bg-yellow-100 text-yellow-700 dark:bg-yellow-900 dark:text-yellow-200'
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

  // Selection handlers
  const handleSelectAll = () => {
    if (selectedProposals.size === proposals.length) {
      setSelectedProposals(new Set())
    } else {
      setSelectedProposals(new Set(proposals.map(p => p.id)))
    }
  }

  const handleSelectProposal = (proposalId: number) => {
    const newSelected = new Set(selectedProposals)
    if (newSelected.has(proposalId)) {
      newSelected.delete(proposalId)
    } else {
      newSelected.add(proposalId)
    }
    setSelectedProposals(newSelected)
  }

  // Bulk actions
  const handleBulkDelete = async () => {
    const selected = Array.from(selectedProposals)
    if (selected.length === 0) {
      alert('Selecione pelo menos uma proposta')
      return
    }
    
    if (!confirm(`Tem certeza que deseja excluir ${selected.length} proposta(s)?`)) return
    
    try {
      await Promise.all(selected.map(id => api.delete(`/api/proposals/${id}`)))
      setSelectedProposals(new Set())
      fetchProposals()
    } catch (error: any) {
      console.error('Error bulk deleting proposals:', error)
      alert('Erro ao excluir propostas. Tente novamente.')
    }
  }

  const handleExportSelected = () => {
    const selected = proposals.filter(p => selectedProposals.has(p.id))
    if (selected.length === 0) {
      alert('Selecione pelo menos uma proposta')
      return
    }
    
    // Criar CSV
    const headers = ['Título', 'Oportunidade', 'Valor', 'Status', 'Válida até', 'Enviada em']
    const rows = selected.map(p => {
      const opp = opportunities.find(o => o.id === p.opportunity_id)
      return [
        p.title || '',
        opp?.name || '',
        p.amount ? `${p.currency} ${p.amount}` : '',
        getStatusLabel(p.status),
        p.valid_until ? new Date(p.valid_until).toLocaleDateString('pt-BR') : '',
        p.sent_at ? new Date(p.sent_at).toLocaleDateString('pt-BR') : ''
      ]
    })
    
    const csv = [headers.join(','), ...rows.map(r => r.map(cell => `"${cell}"`).join(','))].join('\n')
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8-sig;' })
    const url = window.URL.createObjectURL(blob)
    const link = document.createElement('a')
    link.href = url
    link.setAttribute('download', `propostas_${new Date().toISOString().split('T')[0]}.csv`)
    document.body.appendChild(link)
    link.click()
    link.remove()
    window.URL.revokeObjectURL(url)
  }

  const handleExportPDF = async (proposal: Proposal) => {
    try {
      // Importar html2pdf dinamicamente
      const html2pdf = (await import('html2pdf.js')).default
      
      // Criar HTML formatado para PDF (apenas o conteúdo da proposta)
      const htmlContent = `
        <!DOCTYPE html>
        <html>
        <head>
          <meta charset="UTF-8">
          <style>
            @page {
              size: A4;
              margin: 2cm;
            }
            body {
              font-family: Arial, sans-serif;
              line-height: 1.6;
              color: #333;
              margin: 0;
              padding: 20px;
              background: white;
            }
            h1 {
              color: #2c3e50;
              border-bottom: 3px solid #0066CC;
              padding-bottom: 10px;
              margin-bottom: 30px;
            }
            h2 {
              color: #2c3e50;
              border-bottom: 2px solid #e0e0e0;
              padding-bottom: 10px;
              margin-top: 30px;
            }
            .info-row {
              display: flex;
              justify-content: space-between;
              padding: 10px 0;
              border-bottom: 1px solid #f0f0f0;
            }
            .info-label {
              font-weight: bold;
              color: #666;
            }
            .content-section {
              margin-top: 20px;
            }
          </style>
        </head>
        <body>
          <h1>${proposal.title}</h1>
          
          <div class="info-row">
            <span class="info-label">Status:</span>
            <span>${getStatusLabel(proposal.status)}</span>
          </div>
          ${proposal.amount ? `
          <div class="info-row">
            <span class="info-label">Valor:</span>
            <span style="font-size: 18px; font-weight: bold; color: #0066CC;">${new Intl.NumberFormat('pt-BR', { style: 'currency', currency: proposal.currency }).format(proposal.amount)}</span>
          </div>
          ` : ''}
          ${proposal.valid_until ? `
          <div class="info-row">
            <span class="info-label">Válida até:</span>
            <span>${new Date(proposal.valid_until).toLocaleDateString('pt-BR')}</span>
          </div>
          ` : ''}
          ${proposal.sent_at ? `
          <div class="info-row">
            <span class="info-label">Enviada em:</span>
            <span>${new Date(proposal.sent_at).toLocaleDateString('pt-BR')}</span>
          </div>
          ` : ''}
          
          ${proposal.content ? `
          <h2>Conteúdo da Proposta</h2>
          <div class="content-section">${proposal.content}</div>
          ` : ''}
          
          ${proposal.notes ? `
          <h2>Notas</h2>
          <p class="content-section">${proposal.notes}</p>
          ` : ''}
        </body>
        </html>
      `
      
      // Criar um iframe oculto para renderizar o HTML isoladamente
      const iframe = document.createElement('iframe')
      iframe.style.position = 'fixed'
      iframe.style.right = '-9999px'
      iframe.style.bottom = '0'
      iframe.style.width = '800px'
      iframe.style.height = '1200px'
      iframe.style.border = 'none'
      iframe.style.opacity = '0'
      iframe.style.pointerEvents = 'none'
      document.body.appendChild(iframe)
      
      // Escrever o HTML no iframe
      const iframeDoc = iframe.contentDocument || iframe.contentWindow?.document
      if (!iframeDoc) {
        throw new Error('Não foi possível acessar o documento do iframe')
      }
      
      iframeDoc.open()
      iframeDoc.write(htmlContent)
      iframeDoc.close()
      
      // Aguardar o iframe carregar completamente
      await new Promise((resolve) => {
        if (iframe.contentWindow) {
          iframe.contentWindow.onload = resolve
          // Timeout de segurança
          setTimeout(resolve, 500)
        } else {
          resolve(undefined)
        }
      })
      
      // Aguardar um pouco mais para garantir renderização
      await new Promise(resolve => setTimeout(resolve, 200))
      
      // Obter o body do iframe
      const iframeBody = iframeDoc.body
      if (!iframeBody) {
        throw new Error('Body do iframe não encontrado')
      }
      
      // Configurações do PDF
      const opt = {
        margin: [15, 15, 15, 15],
        filename: `proposta_${proposal.id}_${proposal.title.replace(/\s+/g, '_')}.pdf`,
        image: { type: 'jpeg', quality: 0.98 },
        html2canvas: { 
          scale: 2, 
          useCORS: true,
          logging: false,
          windowWidth: 800,
          windowHeight: iframeBody.scrollHeight || 1200,
          backgroundColor: '#ffffff',
          removeContainer: true
        },
        jsPDF: { 
          unit: 'mm', 
          format: 'a4', 
          orientation: 'portrait',
          compress: true
        }
      }
      
      // Gerar PDF apenas do conteúdo do iframe
      await html2pdf().set(opt).from(iframeBody).save()
      
      // Remover iframe temporário
      document.body.removeChild(iframe)
    } catch (error) {
      console.error('Erro ao gerar PDF:', error)
      alert('Erro ao gerar PDF. Por favor, tente novamente.')
    }
  }

  const totalPages = Math.ceil(totalProposals / pageSize)

  const handleOpenProposalDetail = (proposal: Proposal) => {
    setSelectedProposalDetail(proposal)
    setShowProposalDetailModal(true)
    setActiveTab('basicas')
  }

  useEffect(() => {
    if (showProposalDetailModal && selectedProposalDetail?.id) {
      fetchProposalComments(selectedProposalDetail.id)
    }
  }, [showProposalDetailModal, selectedProposalDetail?.id])

  const fetchProposalComments = async (proposalId: number) => {
    try {
      setLoadingComments(true)
      const response = await api.get(`/api/proposals/${proposalId}/comments`)
      setProposalComments(response.data || [])
    } catch (error) {
      console.error('Error fetching proposal comments:', error)
      setProposalComments([])
    } finally {
      setLoadingComments(false)
    }
  }

  const handleAddComment = async () => {
    if (!selectedProposalDetail || !newComment.trim()) return
    
    try {
      setAddingComment(true)
      const response = await api.post(`/api/proposals/${selectedProposalDetail.id}/comments`, {
        comment: newComment.trim()
      })
      
      setProposalComments([response.data, ...proposalComments])
      setNewComment('')
      
      const propResponse = await api.get(`/api/proposals/${selectedProposalDetail.id}`)
      setSelectedProposalDetail(prev => prev ? { ...prev, updated_at: propResponse.data.updated_at } : propResponse.data)
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
      await api.delete(`/api/proposals/comments/${commentId}`)
      setProposalComments(prevComments => prevComments.filter(c => c.id !== commentId))
      
      if (selectedProposalDetail) {
        const propResponse = await api.get(`/api/proposals/${selectedProposalDetail.id}`)
        setSelectedProposalDetail(prev => prev ? { ...prev, updated_at: propResponse.data.updated_at } : propResponse.data)
      }
    } catch (error: any) {
      console.error('Error deleting comment:', error)
      alert(error.response?.data?.detail || 'Erro ao excluir comentário')
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
                  <label className="block text-sm font-medium mb-1">Template de Proposta</label>
                  <select
                    value={formData.template_id || ''}
                    onChange={(e) => {
                      const templateId = e.target.value ? Number(e.target.value) : null
                      setFormData({ ...formData, template_id: templateId })
                    }}
                    className="w-full px-3 py-2 border rounded-md focus:ring-2 focus:ring-amber-500 focus:border-amber-500 transition-all duration-200"
                  >
                    <option value="">Sem template (conteúdo manual)</option>
                    {templates.map(template => (
                      <option key={template.id} value={template.id}>
                        {template.name} {template.description ? `- ${template.description}` : ''}
                      </option>
                    ))}
                  </select>
                  <p className="text-xs text-muted-foreground mt-1">
                    Selecione um template para preencher automaticamente o conteúdo da proposta
                  </p>
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
                <div>
                  <label className="block text-sm font-medium mb-1">Responsável</label>
                  <select
                    value={formData.owner_id || ''}
                    onChange={(e) => setFormData({ ...formData, owner_id: e.target.value ? Number(e.target.value) : null })}
                    className="w-full px-3 py-2 border rounded-md focus:ring-2 focus:ring-amber-500 focus:border-amber-500 transition-all duration-200"
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
                <label className="block text-sm font-medium mb-1">
                  Conteúdo *
                  {formData.template_id && (
                    <span className="text-xs text-muted-foreground ml-2 font-normal">
                      (Será preenchido automaticamente pelo template)
                    </span>
                  )}
                </label>
                <Textarea
                  value={formData.content}
                  onChange={(e) => setFormData({ ...formData, content: e.target.value })}
                  rows={10}
                  required
                  className="focus:ring-2 focus:ring-amber-500 focus:border-amber-500 transition-all duration-200"
                  placeholder={formData.template_id ? "O conteúdo será gerado automaticamente do template selecionado..." : "Digite o conteúdo da proposta ou selecione um template acima..."}
                  disabled={!!formData.template_id}
                />
                {formData.template_id && (
                  <p className="text-xs text-muted-foreground mt-1">
                    O conteúdo será gerado automaticamente quando você salvar a proposta.
                  </p>
                )}
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

      {/* Filtros */}
      <Card className="border-t-4 border-t-amber-500 bg-gradient-to-br from-amber-50/30 to-white dark:from-amber-950/10 dark:to-background">
        <CardHeader className="bg-gradient-to-r from-amber-50/50 to-transparent dark:from-amber-950/20">
          <div className="flex items-center justify-between">
            <CardTitle className="text-amber-900 dark:text-amber-100">Filtros</CardTitle>
            <div className="flex items-center gap-2">
              <label className="text-sm font-medium">Itens por página:</label>
              <select
                value={pageSize}
                onChange={(e) => {
                  const newPageSize = Number(e.target.value)
                  setPageSize(newPageSize)
                  setCurrentPage(1)
                }}
                className="px-3 py-1.5 border rounded-md text-sm bg-background"
              >
                <option value={10}>10</option>
                <option value={20}>20</option>
                <option value={50}>50</option>
                <option value={100}>100</option>
              </select>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
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
            <AdvancedFilters
              filters={advancedFilters}
              onFiltersChange={setAdvancedFilters}
              logic={filterLogic}
              onLogicChange={setFilterLogic}
              endpoint="/api/proposals/filter-fields"
            />
          </div>
        </CardContent>
      </Card>

      {/* Bulk Actions */}
      {selectedProposals.size > 0 && (
        <Card className="border-l-4 border-l-amber-500">
          <CardContent className="py-3">
            <div className="flex items-center justify-between">
              <span className="text-sm font-medium">
                {selectedProposals.size} proposta(s) selecionada(s)
              </span>
              <div className="flex gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={handleExportSelected}
                >
                  <Download className="mr-2 h-4 w-4" />
                  Exportar
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={handleBulkDelete}
                  className="text-red-600 hover:text-red-700"
                >
                  <Trash2 className="mr-2 h-4 w-4" />
                  Excluir
                </Button>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => setSelectedProposals(new Set())}
                >
                  <X className="h-4 w-4" />
                </Button>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Lista de Propostas */}
      {proposals.length === 0 && !loading ? (
        <Card>
          <CardContent className="py-8 text-center">
            <p className="text-muted-foreground">Nenhuma proposta encontrada</p>
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-4">
          {proposals.map((proposal) => {
            const opportunity = opportunities.find(o => o.id === proposal.opportunity_id)
            
            return (
              <Card 
                key={proposal.id}
                className="border-l-4 border-l-amber-400 hover:border-l-amber-600 transition-all duration-200 bg-gradient-to-r from-white to-amber-50/30 dark:from-background dark:to-amber-950/20 hover:shadow-lg cursor-pointer"
                onClick={() => handleOpenProposalDetail(proposal)}
              >
                <CardHeader>
                  <div className="flex items-start justify-between">
                    <div className="flex-1">
                      <div className="flex items-center gap-2">
                        <input
                          type="checkbox"
                          checked={selectedProposals.has(proposal.id)}
                          onChange={(e) => {
                            e.stopPropagation()
                            handleSelectProposal(proposal.id)
                          }}
                          onClick={(e) => e.stopPropagation()}
                          className="rounded border-gray-300"
                        />
                        <CardTitle className="text-amber-900 dark:text-amber-100">{proposal.title}</CardTitle>
                      </div>
                      {opportunity && (
                        <CardDescription className="text-amber-700/80 dark:text-amber-300/80 mt-1">
                          {opportunity.name}
                        </CardDescription>
                      )}
                    </div>
                    <div className="flex gap-2" onClick={(e) => e.stopPropagation()}>
                      <Button
                        size="icon"
                        variant="ghost"
                        onClick={(e) => {
                          e.stopPropagation()
                          handleEdit(proposal)
                        }}
                        disabled={proposal.status !== 'draft'}
                      >
                        <Edit className="h-4 w-4" />
                      </Button>
                      <Button
                        size="icon"
                        variant="ghost"
                        onClick={(e) => {
                          e.stopPropagation()
                          handleDelete(proposal.id)
                        }}
                        disabled={proposal.status === 'accepted'}
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                  </div>
                </CardHeader>
                <CardContent className="space-y-2">
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
                  {proposal.owner && (
                    <div className="flex items-center gap-2 text-sm">
                      <User className="h-4 w-4 text-amber-600" />
                      <span className="text-muted-foreground">{proposal.owner.full_name}</span>
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
                  {proposal.notes && (
                    <CardContent className="pt-2 border-t">
                      <p className="text-sm text-muted-foreground line-clamp-2">{proposal.notes}</p>
                    </CardContent>
                  )}
                  <div className="flex gap-2 pt-2 border-t" onClick={(e) => e.stopPropagation()}>
                    {proposal.status === 'draft' && (
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={(e) => {
                          e.stopPropagation()
                          handleSend(proposal.id)
                        }}
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
                          onClick={(e) => {
                            e.stopPropagation()
                            handleAccept(proposal.id)
                          }}
                          className="text-xs text-green-600"
                        >
                          <CheckCircle2 className="mr-1 h-3 w-3" />
                          Aceitar
                        </Button>
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={(e) => {
                            e.stopPropagation()
                            handleReject(proposal.id)
                          }}
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
      )}

      {/* Pagination */}
      {totalProposals > pageSize && (
        <Card>
          <CardContent className="py-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-4">
                <span className="text-sm text-muted-foreground">
                  Mostrando {((currentPage - 1) * pageSize) + 1} a {Math.min(currentPage * pageSize, totalProposals)} de {totalProposals}
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

      {/* Modal de Detalhes da Proposta */}
      {showProposalDetailModal && selectedProposalDetail && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
          <Card className="w-full max-w-4xl h-[90vh] overflow-hidden flex flex-col">
            <CardHeader className="border-b flex-shrink-0">
              <div className="flex items-center justify-between">
                <CardTitle className="text-2xl">Detalhes da Proposta</CardTitle>
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={() => {
                    setShowProposalDetailModal(false)
                    setSelectedProposalDetail(null)
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
                  onClick={() => setActiveTab('oportunidade')}
                  className={`px-4 py-3 text-sm font-medium border-b-2 transition-colors whitespace-nowrap ${
                    activeTab === 'oportunidade'
                      ? 'border-primary text-primary'
                      : 'border-transparent text-muted-foreground hover:text-foreground'
                  }`}
                >
                  Oportunidade
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
              {/* Botão de Exportar PDF */}
              <div className="mb-4 flex justify-end">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => selectedProposalDetail && handleExportPDF(selectedProposalDetail)}
                >
                  <FileDown className="mr-2 h-4 w-4" />
                  Exportar PDF
                </Button>
              </div>
              
              {/* Aba: Informações Básicas */}
              {activeTab === 'basicas' && (
                <div className="space-y-4">
                  <div className="grid gap-4 md:grid-cols-2">
                    <div>
                      <label className="text-sm font-medium text-muted-foreground">Título</label>
                      <p className="text-base font-medium mt-1">{selectedProposalDetail.title}</p>
                    </div>
                    <div>
                      <label className="text-sm font-medium text-muted-foreground">Status</label>
                      <p className="mt-1">
                        <span className={`text-xs px-2 py-1 rounded ${getStatusColor(selectedProposalDetail.status)}`}>
                          {getStatusLabel(selectedProposalDetail.status)}
                        </span>
                      </p>
                    </div>
                    {selectedProposalDetail.amount && (
                      <div>
                        <label className="text-sm font-medium text-muted-foreground">Valor</label>
                        <p className="text-base mt-1 flex items-center gap-2">
                          <DollarSign className="h-4 w-4" />
                          <span className="font-semibold">
                            {new Intl.NumberFormat('pt-BR', { style: 'currency', currency: selectedProposalDetail.currency }).format(selectedProposalDetail.amount)}
                          </span>
                        </p>
                      </div>
                    )}
                    {selectedProposalDetail.valid_until && (
                      <div>
                        <label className="text-sm font-medium text-muted-foreground">Válida até</label>
                        <p className="text-base mt-1 flex items-center gap-2">
                          <Calendar className="h-4 w-4" />
                          {new Date(selectedProposalDetail.valid_until).toLocaleDateString('pt-BR')}
                        </p>
                      </div>
                    )}
                    {selectedProposalDetail.owner && (
                      <div>
                        <label className="text-sm font-medium text-muted-foreground">Responsável</label>
                        <p className="text-base mt-1 flex items-center gap-2">
                          <User className="h-4 w-4" />
                          {selectedProposalDetail.owner.full_name}
                        </p>
                      </div>
                    )}
                    {selectedProposalDetail.sent_at && (
                      <div>
                        <label className="text-sm font-medium text-muted-foreground">Enviada em</label>
                        <p className="text-base mt-1 flex items-center gap-2">
                          <Calendar className="h-4 w-4" />
                          {new Date(selectedProposalDetail.sent_at).toLocaleDateString('pt-BR')}
                        </p>
                      </div>
                    )}
                    {selectedProposalDetail.accepted_at && (
                      <div>
                        <label className="text-sm font-medium text-muted-foreground">Aceita em</label>
                        <p className="text-base mt-1 flex items-center gap-2">
                          <Calendar className="h-4 w-4" />
                          {new Date(selectedProposalDetail.accepted_at).toLocaleDateString('pt-BR')}
                        </p>
                      </div>
                    )}
                    {selectedProposalDetail.rejected_at && (
                      <div>
                        <label className="text-sm font-medium text-muted-foreground">Rejeitada em</label>
                        <p className="text-base mt-1 flex items-center gap-2">
                          <Calendar className="h-4 w-4" />
                          {new Date(selectedProposalDetail.rejected_at).toLocaleDateString('pt-BR')}
                        </p>
                        {selectedProposalDetail.rejection_reason && (
                          <p className="text-sm text-muted-foreground mt-1">Motivo: {selectedProposalDetail.rejection_reason}</p>
                        )}
                      </div>
                    )}
                  </div>
                  {selectedProposalDetail.content && (
                    <div className="mt-4">
                      <label className="text-sm font-medium text-muted-foreground">Conteúdo</label>
                      <div className="mt-1 p-4 bg-gray-50 dark:bg-gray-900 rounded-lg">
                        <p className="text-base whitespace-pre-wrap">{selectedProposalDetail.content}</p>
                      </div>
                    </div>
                  )}
                  {selectedProposalDetail.notes && (
                    <div className="mt-4">
                      <label className="text-sm font-medium text-muted-foreground">Notas</label>
                      <p className="text-base mt-1">{selectedProposalDetail.notes}</p>
                    </div>
                  )}
                </div>
              )}

              {/* Aba: Oportunidade */}
              {activeTab === 'oportunidade' && (() => {
                const detailOpportunity = opportunities.find(o => o.id === selectedProposalDetail.opportunity_id)
                
                return (
                  <div className="space-y-4">
                    {detailOpportunity ? (
                      <div>
                        <label className="text-sm font-medium text-muted-foreground">Oportunidade</label>
                        <p className="text-base mt-1">{detailOpportunity.name}</p>
                      </div>
                    ) : (
                      <p className="text-sm text-muted-foreground">Nenhuma oportunidade associada.</p>
                    )}
                  </div>
                )
              })()}

              {/* Aba: Comentários */}
              {activeTab === 'comentarios' && (
                <div className="space-y-6">
                  <div>
                    <h3 className="text-lg font-semibold mb-4">Comentários</h3>
                    
                    {/* Formulário para adicionar comentário */}
                    <div className="mb-4 space-y-2">
                      <Textarea
                        placeholder="Adicione um comentário sobre esta proposta..."
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
                    ) : proposalComments.length === 0 ? (
                      <p className="text-sm text-muted-foreground">Nenhum comentário ainda. Seja o primeiro a comentar!</p>
                    ) : (
                      <div className="space-y-3">
                        {proposalComments.map((comment) => (
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
