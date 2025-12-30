import { useState, useEffect } from 'react'
import { useTranslation } from 'react-i18next'
import api from '@/lib/api'
import { useKPI } from '@/contexts/KPIContext'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { AdvancedFilters } from '@/components/AdvancedFilters'
import { DynamicForm } from '@/components/DynamicForm'
import { customFieldsApi } from '@/lib/api'
import { 
  Plus, 
  Trash2, 
  Edit, 
  Search, 
  Filter,
  Mail,
  Phone,
  Building,
  User,
  Calendar,
  TrendingUp,
  CheckCircle2,
  XCircle,
  Clock,
  Link as LinkIcon,
  Upload,
  FileText,
  Workflow
} from 'lucide-react'

type LeadStatus = 
  | 'new' 
  | 'contacted' 
  | 'qualified' 
  | 'meeting_scheduled' 
  | 'proposal_sent' 
  | 'negotiation' 
  | 'won' 
  | 'lost' 
  | 'nurturing'

interface Lead {
  id: number
  name: string
  email: string | null
  phone: string | null
  company: string | null
  position: string | null
  website: string | null
  linkedin_url: string | null
  status: LeadStatus
  source: string | null
  score: number | null
  assigned_to: number | null
  owner_id: number | null
  owner?: {
    id: number
    full_name: string
    email: string
  }
  notes: string | null
  tags: string | null
  last_contact: string | null
  next_followup: string | null
  // Campos de enriquecimento automático
  address: string | null
  city: string | null
  state: string | null
  zip_code: string | null
  country: string | null
  industry: string | null
  company_size: string | null
  context: string | null
  // Campos Casa dos Dados
  razao_social: string | null
  nome_fantasia: string | null
  cnpj: string | null
  data_abertura: string | null
  capital_social: number | null
  situacao_cadastral: string | null
  data_situacao_cadastral: string | null
  motivo_situacao_cadastral: string | null
  natureza_juridica: string | null
  porte: string | null
  logradouro: string | null
  numero: string | null
  bairro: string | null
  cep: string | null
  municipio: string | null
  uf: string | null
  complemento: string | null
  cnae_principal_codigo: string | null
  cnae_principal_descricao: string | null
  cnaes_secundarios_json: string | null
  telefone_empresa: string | null
  email_empresa: string | null
  socios_json: string | null
  simples_nacional: boolean | null
  data_opcao_simples: string | null
  data_exclusao_simples: string | null
  agent_suggestion: string | null
  created_at: string
  updated_at: string
}

const statusLabels: Record<LeadStatus, string> = {
  new: 'Novo',
  contacted: 'Contatado',
  qualified: 'Qualificado',
  meeting_scheduled: 'Reunião Agendada',
  proposal_sent: 'Proposta Enviada',
  negotiation: 'Negociação',
  won: 'Ganho',
  lost: 'Perdido',
  nurturing: 'Nutrição'
}

const statusColors: Record<LeadStatus, string> = {
  new: 'bg-gradient-to-r from-blue-500 to-blue-600 text-white shadow-sm border border-blue-400/20',
  contacted: 'bg-gradient-to-r from-amber-500 to-amber-600 text-white shadow-sm border border-amber-400/20',
  qualified: 'bg-gradient-to-r from-green-500 to-green-600 text-white shadow-sm border border-green-400/20',
  meeting_scheduled: 'bg-gradient-to-r from-purple-500 to-purple-600 text-white shadow-sm border border-purple-400/20',
  proposal_sent: 'bg-gradient-to-r from-indigo-500 to-indigo-600 text-white shadow-sm border border-indigo-400/20',
  negotiation: 'bg-gradient-to-r from-orange-500 to-orange-600 text-white shadow-sm border border-orange-400/20',
  won: 'bg-gradient-to-r from-emerald-500 to-emerald-600 text-white shadow-sm border border-emerald-400/20',
  lost: 'bg-gradient-to-r from-red-500 to-red-600 text-white shadow-sm border border-red-400/20',
  nurturing: 'bg-gradient-to-r from-slate-500 to-slate-600 text-white shadow-sm border border-slate-400/20'
}

export function Leads() {
  const { t } = useTranslation()
  const { trackActivity } = useKPI()
  const [leads, setLeads] = useState<Lead[]>([])
  const [loading, setLoading] = useState(true)
  const [showForm, setShowForm] = useState(false)
  const [editingId, setEditingId] = useState<number | null>(null)
  const [stats, setStats] = useState<any>(null)
  const [showImportModal, setShowImportModal] = useState(false)
  const [importing, setImporting] = useState(false)
  const [importResult, setImportResult] = useState<any>(null)
  const [showSequenceModal, setShowSequenceModal] = useState(false)
  const [selectedLeadId, setSelectedLeadId] = useState<number | null>(null)
  const [sequences, setSequences] = useState<any[]>([])
  const [sequenceStartDate, setSequenceStartDate] = useState('')
  const [showLeadDetailModal, setShowLeadDetailModal] = useState(false)
  const [selectedLeadDetail, setSelectedLeadDetail] = useState<Lead | null>(null)
  const [activeTab, setActiveTab] = useState('basicas')
  const [leadTasks, setLeadTasks] = useState<any[]>([])
  const [loadingTasks, setLoadingTasks] = useState(false)
  const [leadComments, setLeadComments] = useState<any[]>([])
  const [loadingComments, setLoadingComments] = useState(false)
  const [newComment, setNewComment] = useState('')
  const [addingComment, setAddingComment] = useState(false)
  const [users, setUsers] = useState<Array<{id: number, full_name: string, email: string}>>([])
  const [customFields, setCustomFields] = useState<any[]>([])
  const [customAttributes, setCustomAttributes] = useState<Record<string, any>>({})
  
  // Selection and pagination
  const [selectedLeads, setSelectedLeads] = useState<Set<number>>(new Set())
  const [currentPage, setCurrentPage] = useState(1)
  const [pageSize, setPageSize] = useState(20)
  const [totalLeads, setTotalLeads] = useState(0)
  
  // Filters
  const [searchTerm, setSearchTerm] = useState('')
  const [statusFilter, setStatusFilter] = useState<LeadStatus | 'all'>('all')
  const [sourceFilter, setSourceFilter] = useState<string>('all')
  const [advancedFilters, setAdvancedFilters] = useState<Array<{
    id: string
    field: string
    operator: string
    value: string | number | boolean | null
    value2?: string | number | null
  }>>([])
  const [filterLogic, setFilterLogic] = useState<'AND' | 'OR'>('AND')
  
  const [formData, setFormData] = useState({
    name: '',
    email: '',
    phone: '',
    company: '',
    position: '',
    website: '',
    linkedin_url: '',
    status: 'new' as LeadStatus,
    source: '',
    score: 0,
    notes: '',
    tags: '',
    // Campos de enriquecimento
    address: '',
    city: '',
    state: '',
    zip_code: '',
    country: '',
    industry: '',
    company_size: '',
    context: '',
    // Campos Casa dos Dados
    razao_social: '',
    nome_fantasia: '',
    cnpj: '',
    data_abertura: '',
    capital_social: '',
    situacao_cadastral: '',
    data_situacao_cadastral: '',
    motivo_situacao_cadastral: '',
    natureza_juridica: '',
    porte: '',
    logradouro: '',
    numero: '',
    bairro: '',
    cep: '',
    municipio: '',
    uf: '',
    complemento: '',
    cnae_principal_codigo: '',
    cnae_principal_descricao: '',
    cnaes_secundarios_json: '',
    telefone_empresa: '',
    email_empresa: '',
    socios_json: '',
    simples_nacional: false,
    data_opcao_simples: '',
    data_exclusao_simples: '',
    agent_suggestion: '',
    owner_id: null as number | null
  })

  useEffect(() => {
    fetchUsers()
    fetchLeads()
    fetchStats()
    fetchCustomFields()
  }, [statusFilter, sourceFilter, searchTerm, currentPage, pageSize, advancedFilters, filterLogic])

  const fetchCustomFields = async () => {
    try {
      const response = await customFieldsApi.getFields('leads')
      setCustomFields(response.data || [])
    } catch (error) {
      console.error('Error fetching custom fields:', error)
    }
  }

  const fetchUsers = async () => {
    try {
      const response = await api.get('/api/users')
      setUsers(response.data)
    } catch (error) {
      console.error('Error fetching users:', error)
    }
  }

  useEffect(() => {
    if (showSequenceModal) {
      fetchSequences()
    }
  }, [showSequenceModal])

  useEffect(() => {
    if (showLeadDetailModal && selectedLeadDetail?.id) {
      const leadId = selectedLeadDetail.id
      fetchLeadTasks(leadId)
      fetchLeadComments(leadId)
    }
  }, [showLeadDetailModal, selectedLeadDetail?.id]) // Usar apenas o ID como dependência

  const fetchSequences = async () => {
    try {
      const response = await api.get('/api/sequences')
      setSequences(response.data.filter((s: any) => s.is_active))
    } catch (error) {
      console.error('Error fetching sequences:', error)
    }
  }

  const fetchLeadTasks = async (leadId: number) => {
    try {
      setLoadingTasks(true)
      const response = await api.get(`/api/tasks?lead_id=${leadId}`)
      setLeadTasks(response.data || [])
    } catch (error) {
      console.error('Error fetching lead tasks:', error)
      setLeadTasks([])
    } finally {
      setLoadingTasks(false)
    }
  }

  const fetchLeadComments = async (leadId: number) => {
    try {
      setLoadingComments(true)
      const response = await api.get(`/api/leads/${leadId}/comments`)
      setLeadComments(response.data || [])
    } catch (error) {
      console.error('Error fetching lead comments:', error)
      setLeadComments([])
    } finally {
      setLoadingComments(false)
    }
  }

  const handleAddComment = async () => {
    if (!selectedLeadDetail || !newComment.trim()) return
    
    try {
      setAddingComment(true)
      const response = await api.post(`/api/leads/${selectedLeadDetail.id}/comments`, {
        comment: newComment.trim()
      })
      
      // Add new comment to list
      setLeadComments([response.data, ...leadComments])
      setNewComment('')
      
      // Atualizar apenas updated_at sem disparar useEffect (evita múltiplas requisições)
      const leadResponse = await api.get(`/api/leads/${selectedLeadDetail.id}`)
      setSelectedLeadDetail(prev => prev ? { ...prev, updated_at: leadResponse.data.updated_at } : leadResponse.data)
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
      await api.delete(`/api/leads/comments/${commentId}`)
      setLeadComments(prevComments => prevComments.filter(c => c.id !== commentId))
      
      // Atualizar lead sem disparar useEffect (apenas updated_at)
      if (selectedLeadDetail) {
        const leadResponse = await api.get(`/api/leads/${selectedLeadDetail.id}`)
        setSelectedLeadDetail(prev => prev ? { ...prev, updated_at: leadResponse.data.updated_at } : leadResponse.data)
      }
    } catch (error: any) {
      console.error('Error deleting comment:', error)
      alert(error.response?.data?.detail || 'Erro ao excluir comentário')
    }
  }

  const handleOpenLeadDetail = (lead: Lead) => {
    setSelectedLeadDetail(lead)
    setShowLeadDetailModal(true)
    setNewComment('')
    setActiveTab('basicas')
  }

  const handleAssociateSequence = async (sequenceId: number) => {
    if (!selectedLeadId) return
    
    try {
      const requestData: any = {}
      
      // Se houver data selecionada, incluir no request
      if (sequenceStartDate) {
        // Converter para ISO string
        const dateObj = new Date(sequenceStartDate)
        requestData.start_date = dateObj.toISOString()
      }
      
      const response = await api.post(
        `/api/sequences/${sequenceId}/assign-to-lead/${selectedLeadId}`,
        Object.keys(requestData).length > 0 ? requestData : undefined
      )
      
      const tasksCreated = response.data?.length || 0
      alert(`Cadência associada com sucesso! ${tasksCreated} tarefa(s) criada(s).`)
      setShowSequenceModal(false)
      setSelectedLeadId(null)
      setSequenceStartDate('') // Limpar data
      fetchLeads() // Refresh leads list
    } catch (error: any) {
      console.error('Error associating sequence:', error)
      const errorMessage = error.response?.data?.detail || 'Erro ao associar cadência'
      alert(errorMessage)
      if (error.response?.status === 400) {
        // Se for erro 400 (já associado), não fechar o modal para o usuário tentar outra cadência
        return
      }
      setShowSequenceModal(false)
      setSelectedLeadId(null)
      setSequenceStartDate('')
    }
  }

  // Bulk actions
  const handleSelectAll = () => {
    if (selectedLeads.size === leads.length) {
      setSelectedLeads(new Set())
    } else {
      setSelectedLeads(new Set(leads.map(l => l.id)))
    }
  }

  const handleSelectLead = (leadId: number) => {
    const newSelected = new Set(selectedLeads)
    if (newSelected.has(leadId)) {
      newSelected.delete(leadId)
    } else {
      newSelected.add(leadId)
    }
    setSelectedLeads(newSelected)
  }

  const handleExportSelected = () => {
    const selected = leads.filter(l => selectedLeads.has(l.id))
    if (selected.length === 0) {
      alert('Selecione pelo menos um lead para exportar')
      return
    }

    // Create CSV
    const headers = ['Nome', 'Email', 'Telefone', 'Empresa', 'Cargo', 'Status', 'Fonte', 'Score']
    const rows = selected.map(lead => [
      lead.name,
      lead.email || '',
      lead.phone || '',
      lead.company || '',
      lead.position || '',
      statusLabels[lead.status],
      lead.source || '',
      lead.score?.toString() || '0'
    ])

    const csvContent = [
      headers.join(','),
      ...rows.map(row => row.map(cell => `"${cell}"`).join(','))
    ].join('\n')

    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8-sig;' })
    const url = window.URL.createObjectURL(blob)
    const link = document.createElement('a')
    link.href = url
    link.setAttribute('download', `leads_export_${new Date().toISOString().split('T')[0]}.csv`)
    document.body.appendChild(link)
    link.click()
    link.remove()
    window.URL.revokeObjectURL(url)
  }

  const handleBulkAssociateSequence = async (sequenceId: number) => {
    const selected = Array.from(selectedLeads)
    if (selected.length === 0) {
      alert('Selecione pelo menos um lead')
      return
    }

    try {
      let success = 0
      let errors = 0
      let skipped = 0
      let totalTasks = 0
      
      const requestData: any = {}
      
      // Se houver data selecionada, incluir no request
      if (sequenceStartDate) {
        const dateObj = new Date(sequenceStartDate)
        requestData.start_date = dateObj.toISOString()
      }
      
      for (const leadId of selected) {
        try {
          const response = await api.post(
            `/api/sequences/${sequenceId}/assign-to-lead/${leadId}`,
            Object.keys(requestData).length > 0 ? requestData : undefined
          )
          const tasksCreated = response.data?.length || 0
          totalTasks += tasksCreated
          success++
        } catch (error: any) {
          if (error.response?.status === 400 && error.response?.data?.detail?.includes('já está associado')) {
            skipped++
          } else {
            errors++
          }
        }
      }

      let message = `Cadência associada a ${success} lead(s). ${totalTasks} tarefa(s) criada(s) no total.`
      if (skipped > 0) {
        message += ` ${skipped} lead(s) já estava(m) associado(s).`
      }
      if (errors > 0) {
        message += ` ${errors} erro(s).`
      }
      alert(message)
      setShowSequenceModal(false)
      setSelectedLeads(new Set())
      setSequenceStartDate('') // Limpar data
      fetchLeads()
    } catch (error: any) {
      console.error('Error bulk associating sequence:', error)
      alert(error.response?.data?.detail || 'Erro ao associar cadência em massa')
    }
  }

  const handleBulkSendEmail = () => {
    const selected = leads.filter(l => selectedLeads.has(l.id) && l.email)
    if (selected.length === 0) {
      alert('Selecione pelo menos um lead com e-mail')
      return
    }

    // Open email client with selected emails
    const emails = selected.map(l => l.email).join(';')
    window.location.href = `mailto:${emails}`
  }

  const totalPages = Math.ceil(totalLeads / pageSize)

  const fetchLeads = async () => {
    try {
      setLoading(true)
      
      // Se houver filtros avançados, usar o endpoint de filtros
      if (advancedFilters.length > 0) {
        // Filtrar apenas filtros válidos (com valor ou operadores especiais)
        const validFilters = advancedFilters.filter(f => {
          // Operadores que não precisam de valor
          if (f.operator === 'is_null' || f.operator === 'is_not_null') {
            return true
          }
          // Operador between precisa de dois valores
          if (f.operator === 'between') {
            return f.value !== null && f.value !== '' && f.value2 !== null && f.value2 !== ''
          }
          // Outros operadores precisam de valor
          return f.value !== null && f.value !== ''
        })
        
        console.log('🔍 [FILTERS] Filtros avançados:', {
          total: advancedFilters.length,
          validos: validFilters.length,
          filtros: validFilters
        })
        
        if (validFilters.length === 0) {
          console.warn('🔍 [FILTERS] Nenhum filtro válido encontrado, usando endpoint padrão')
          // Usar endpoint padrão se não houver filtros válidos
          const params: any = {
            skip: (currentPage - 1) * pageSize,
            limit: pageSize
          }
          
          if (statusFilter !== 'all') {
            params.status = statusFilter
          }
          
          if (sourceFilter !== 'all') {
            params.source = sourceFilter
          }
          
          if (searchTerm) {
            params.search = searchTerm
          }
          
          const queryString = new URLSearchParams(params).toString()
          const response = await api.get(`/api/leads${queryString ? `?${queryString}` : ''}`)
          setLeads(response.data)
          
          const totalCount = response.headers['x-total-count']
          if (totalCount) {
            setTotalLeads(parseInt(totalCount, 10))
          } else {
            if (response.data.length < pageSize) {
              setTotalLeads((currentPage - 1) * pageSize + response.data.length)
            } else {
              setTotalLeads(currentPage * pageSize + 1)
            }
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
          status: statusFilter !== 'all' ? statusFilter : undefined,
          assigned_to: undefined,
          source: sourceFilter !== 'all' ? sourceFilter : undefined,
          min_score: undefined,
          max_score: undefined,
          skip: (currentPage - 1) * pageSize,
          limit: pageSize
        }
        
        console.log('🔍 [FILTERS] Enviando requisição:', filtersRequest)
        
        const response = await api.post('/api/leads/filter', filtersRequest)
        console.log('🔍 [FILTERS] Resposta recebida:', response.data.length, 'leads')
        setLeads(response.data)
        
        // Get total count from response header
        const totalCount = response.headers['x-total-count']
        if (totalCount) {
          setTotalLeads(parseInt(totalCount, 10))
        } else {
          setTotalLeads(response.data.length)
        }
      } else {
        // Usar endpoint legado se não houver filtros avançados
        const params: any = {
          skip: (currentPage - 1) * pageSize,
          limit: pageSize
        }
        
        if (statusFilter !== 'all') {
          params.status = statusFilter
        }
        
        if (sourceFilter !== 'all') {
          params.source = sourceFilter
        }
        
        if (searchTerm) {
          params.search = searchTerm
        }
        
        const queryString = new URLSearchParams(params).toString()
        const response = await api.get(`/api/leads${queryString ? `?${queryString}` : ''}`)
        setLeads(response.data)
        
        // Get total count from response header
        const totalCount = response.headers['x-total-count']
        if (totalCount) {
          setTotalLeads(parseInt(totalCount, 10))
        } else {
          // Fallback estimation
          if (response.data.length < pageSize) {
            setTotalLeads((currentPage - 1) * pageSize + response.data.length)
          } else {
            setTotalLeads(currentPage * pageSize + 1)
          }
        }
      }
    } catch (error) {
      console.error('Error fetching leads:', error)
    } finally {
      setLoading(false)
    }
  }

  const fetchStats = async () => {
    try {
      const response = await api.get('/api/leads/stats/summary')
      setStats(response.data)
    } catch (error) {
      console.error('Error fetching stats:', error)
    }
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    
    const storedToken = localStorage.getItem('token')
    if (!storedToken) {
      alert('Sua sessão expirou. Por favor, faça login novamente.')
      window.location.href = '/login'
      return
    }

    try {
      const data = {
        ...formData,
        score: formData.score || 0,
        email: formData.email || null,
        phone: formData.phone || null,
        company: formData.company || null,
        position: formData.position || null,
        website: formData.website || null,
        linkedin_url: formData.linkedin_url || null,
        source: formData.source || null,
        notes: formData.notes || null,
        tags: formData.tags || null,
        // Campos de enriquecimento
        address: formData.address || null,
        city: formData.city || null,
        state: formData.state || null,
        zip_code: formData.zip_code || null,
        country: formData.country || null,
        industry: formData.industry || null,
        company_size: formData.company_size || null,
        context: formData.context || null,
        // Campos Casa dos Dados
        razao_social: formData.razao_social || null,
        nome_fantasia: formData.nome_fantasia || null,
        cnpj: formData.cnpj || null,
        data_abertura: formData.data_abertura ? new Date(formData.data_abertura).toISOString() : null,
        capital_social: formData.capital_social ? parseFloat(formData.capital_social.toString()) : null,
        situacao_cadastral: formData.situacao_cadastral || null,
        data_situacao_cadastral: formData.data_situacao_cadastral ? new Date(formData.data_situacao_cadastral).toISOString() : null,
        motivo_situacao_cadastral: formData.motivo_situacao_cadastral || null,
        natureza_juridica: formData.natureza_juridica || null,
        porte: formData.porte || null,
        logradouro: formData.logradouro || null,
        numero: formData.numero || null,
        bairro: formData.bairro || null,
        cep: formData.cep || null,
        municipio: formData.municipio || null,
        uf: formData.uf || null,
        complemento: formData.complemento || null,
        cnae_principal_codigo: formData.cnae_principal_codigo || null,
        cnae_principal_descricao: formData.cnae_principal_descricao || null,
        cnaes_secundarios_json: formData.cnaes_secundarios_json || null,
        telefone_empresa: formData.telefone_empresa || null,
        email_empresa: formData.email_empresa || null,
        socios_json: formData.socios_json || null,
        simples_nacional: formData.simples_nacional || null,
        data_opcao_simples: formData.data_opcao_simples ? new Date(formData.data_opcao_simples).toISOString() : null,
        data_exclusao_simples: formData.data_exclusao_simples ? new Date(formData.data_exclusao_simples).toISOString() : null,
        agent_suggestion: formData.agent_suggestion || null,
        owner_id: formData.owner_id || null,
        custom_attributes: Object.keys(customAttributes).length > 0 ? customAttributes : null
      }

      let response
      if (editingId) {
        response = await api.put(`/api/leads/${editingId}`, data)
      } else {
        response = await api.post('/api/leads', data)
        // Track KPI activity for new lead creation
        if (response.data?.id) {
          trackActivity('leads_created', 1, 'Lead', response.data.id).catch((err) => {
            console.error('Error tracking KPI activity:', err)
          })
        }
      }
      
      setShowForm(false)
      setEditingId(null)
      setFormData({
        name: '',
        email: '',
        phone: '',
        company: '',
        position: '',
        website: '',
        linkedin_url: '',
        status: 'new',
        source: '',
        score: 0,
        notes: '',
        tags: '',
        // Campos de enriquecimento
        address: '',
        city: '',
        state: '',
        zip_code: '',
        country: '',
        industry: '',
        company_size: '',
        context: '',
        owner_id: null
      })
      fetchLeads()
      fetchStats()
    } catch (error: any) {
      console.error('Error saving lead:', error)
      if (error.response?.status === 401) {
        alert('Sua sessão expirou. Por favor, faça login novamente.')
        window.location.href = '/login'
      } else {
        alert(error.response?.data?.detail || 'Erro ao salvar lead. Tente novamente.')
      }
    }
  }

  const handleEdit = (lead: Lead) => {
    // Helper para formatar data
    const formatDate = (dateStr: string | null) => {
      if (!dateStr) return ''
      try {
        const date = new Date(dateStr)
        return date.toISOString().split('T')[0] // YYYY-MM-DD
      } catch {
        return ''
      }
    }

    setFormData({
      name: lead.name,
      email: lead.email || '',
      phone: lead.phone || '',
      company: lead.company || '',
      position: lead.position || '',
      website: lead.website || '',
      linkedin_url: lead.linkedin_url || '',
      status: lead.status,
      source: lead.source || '',
      score: lead.score || 0,
      notes: lead.notes || '',
      tags: lead.tags || '',
      // Campos de enriquecimento
      address: lead.address || '',
      city: lead.city || '',
      state: lead.state || '',
      zip_code: lead.zip_code || '',
      country: lead.country || '',
      industry: lead.industry || '',
      company_size: lead.company_size || '',
      context: lead.context || '',
      // Campos Casa dos Dados
      razao_social: lead.razao_social || '',
      nome_fantasia: lead.nome_fantasia || '',
      cnpj: lead.cnpj || '',
      data_abertura: formatDate(lead.data_abertura),
      capital_social: lead.capital_social?.toString() || '',
      situacao_cadastral: lead.situacao_cadastral || '',
      data_situacao_cadastral: formatDate(lead.data_situacao_cadastral),
      motivo_situacao_cadastral: lead.motivo_situacao_cadastral || '',
      natureza_juridica: lead.natureza_juridica || '',
      porte: lead.porte || '',
      logradouro: lead.logradouro || '',
      numero: lead.numero || '',
      bairro: lead.bairro || '',
      cep: lead.cep || '',
      municipio: lead.municipio || '',
      uf: lead.uf || '',
      complemento: lead.complemento || '',
      cnae_principal_codigo: lead.cnae_principal_codigo || '',
      cnae_principal_descricao: lead.cnae_principal_descricao || '',
      cnaes_secundarios_json: lead.cnaes_secundarios_json || '',
      telefone_empresa: lead.telefone_empresa || '',
      email_empresa: lead.email_empresa || '',
      socios_json: lead.socios_json || '',
      simples_nacional: lead.simples_nacional || false,
      data_opcao_simples: formatDate(lead.data_opcao_simples),
      data_exclusao_simples: formatDate(lead.data_exclusao_simples),
      agent_suggestion: lead.agent_suggestion || '',
      owner_id: lead.owner_id || null
    })
    setEditingId(lead.id)
    setShowForm(true)
  }

  const handleDelete = async (id: number) => {
    if (!confirm('Tem certeza que deseja excluir este lead?')) return
    
    const storedToken = localStorage.getItem('token')
    if (!storedToken) {
      alert('Sua sessão expirou. Por favor, faça login novamente.')
      window.location.href = '/login'
      return
    }

    try {
      await api.delete(`/api/leads/${id}`)
      fetchLeads()
      fetchStats()
    } catch (error: any) {
      console.error('Error deleting lead:', error)
      if (error.response?.status === 401) {
        alert('Sua sessão expirou. Por favor, faça login novamente.')
        window.location.href = '/login'
      } else {
        alert('Erro ao excluir lead. Tente novamente.')
      }
    }
  }

  const handleStatusChange = async (leadId: number, newStatus: LeadStatus) => {
    try {
      await api.patch(`/api/leads/${leadId}/status?new_status=${newStatus}`)
      fetchLeads()
      fetchStats()
    } catch (error) {
      console.error('Error updating status:', error)
    }
  }

  const handleDownloadTemplate = async () => {
    try {
      const response = await api.get('/api/leads/import-template', {
        responseType: 'blob',
      })
      
      // Create blob and download
      const blob = new Blob([response.data], { type: 'text/csv;charset=utf-8-sig;' })
      const url = window.URL.createObjectURL(blob)
      const link = document.createElement('a')
      link.href = url
      link.setAttribute('download', 'template_importacao_leads.csv')
      document.body.appendChild(link)
      link.click()
      link.remove()
      window.URL.revokeObjectURL(url)
    } catch (error: any) {
      console.error('Error downloading template:', error)
      alert('Erro ao baixar template. Tente novamente.')
    }
  }

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return

    if (!file.name.endsWith('.csv')) {
      alert('Por favor, selecione um arquivo CSV')
      return
    }

    const storedToken = localStorage.getItem('token')
    if (!storedToken) {
      alert('Sua sessão expirou. Por favor, faça login novamente.')
      window.location.href = '/login'
      return
    }

    setImporting(true)
    setImportResult(null)

    try {
      const formData = new FormData()
      formData.append('file', file)

      const response = await api.post('/api/leads/import-csv', formData, {
        headers: {
          'Content-Type': 'multipart/form-data',
        },
      })

      setImportResult(response.data)
      fetchLeads()
      fetchStats()
      
      // Reset file input
      e.target.value = ''
    } catch (error: any) {
      console.error('Error importing CSV:', error)
      if (error.response?.status === 401) {
        alert('Sua sessão expirou. Por favor, faça login novamente.')
        window.location.href = '/login'
      } else {
        alert(error.response?.data?.detail || 'Erro ao importar CSV. Tente novamente.')
      }
    } finally {
      setImporting(false)
    }
  }

  const uniqueSources = Array.from(new Set(leads.map(l => l.source).filter(Boolean)))

  if (loading && !stats) {
    return <div className="p-6">{t('common.loading')}</div>
  }

  return (
    <div className="flex-1 space-y-6 p-6">
      <div className="flex items-center justify-between">
      <div>
        <h1 className="text-3xl font-bold">{t('navigation.leads')}</h1>
          <p className="text-muted-foreground">{t('leads.description')}</p>

        </div>
        <div className="flex gap-2">
          <Button
            variant="outline"
            onClick={() => setShowImportModal(!showImportModal)}
          >
            <Upload className="mr-2 h-4 w-4" />
            Importar CSV
          </Button>
          <Button 
            onClick={() => setShowForm(!showForm)}
            className="bg-gradient-to-r from-blue-600 to-blue-700 hover:from-blue-700 hover:to-blue-800 text-white shadow-md hover:shadow-lg transition-all duration-200"
          >
            <Plus className="mr-2 h-4 w-4" />
            Novo Lead
          </Button>
        </div>
      </div>

      {/* Import Modal */}
      {showImportModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
          <Card className="w-full max-w-2xl max-h-[90vh] overflow-y-auto border-t-4 border-t-teal-500 bg-gradient-to-br from-teal-50/30 to-white dark:from-teal-950/10 dark:to-background">
        <CardHeader className="bg-gradient-to-r from-teal-50/50 to-transparent dark:from-teal-950/20">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <FileText className="h-5 w-5 text-teal-600 dark:text-teal-400" />
                  <CardTitle className="text-teal-900 dark:text-teal-100">Importar Leads do CSV</CardTitle>
                </div>
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={() => {
                    setShowImportModal(false)
                    setImportResult(null)
                  }}
                >
                  <XCircle className="h-4 w-4" />
                </Button>
              </div>
              <CardDescription>
                Importe seus leads através de um arquivo CSV. Baixe o template para ver o formato esperado.
              </CardDescription>
        </CardHeader>
        <CardContent>
              <div className="space-y-6">
                {/* Download Template Section */}
                <div className="rounded-lg border border-dashed p-6 text-center">
                  <FileText className="mx-auto h-12 w-12 text-muted-foreground mb-4" />
                  <h3 className="text-lg font-semibold mb-2">Baixar Template</h3>
                  <p className="text-sm text-muted-foreground mb-4">
                    Baixe o arquivo de exemplo para ver o formato correto do CSV
                  </p>
                  <Button
                    variant="outline"
                    onClick={handleDownloadTemplate}
                    className="w-full sm:w-auto"
                  >
                    <Upload className="mr-2 h-4 w-4" />
                    Baixar Template CSV
                  </Button>
                </div>

                {/* Upload Section */}
                <div className="space-y-4">
                  <div>
                    <h3 className="text-lg font-semibold mb-2">Enviar Arquivo CSV</h3>
                    <p className="text-sm text-muted-foreground mb-4">
                      Selecione o arquivo CSV com seus leads para importar
                    </p>
                  </div>
                  
                  <div className="space-y-2">
                    <label className="text-sm font-medium">Arquivo CSV</label>
                    <div className="flex items-center gap-2">
                      <input
                        type="file"
                        accept=".csv"
                        onChange={handleFileUpload}
                        disabled={importing}
                        className="flex-1 h-10 rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background file:mr-4 file:rounded-md file:border-0 file:bg-primary file:px-4 file:py-2 file:text-sm file:font-medium file:text-primary-foreground hover:file:bg-primary/90 disabled:opacity-50"
                        id="csv-upload"
                      />
                    </div>
                    <p className="text-xs text-muted-foreground">
                      Formatos aceitos: CSV. Tamanho máximo recomendado: 10MB
                    </p>
                  </div>
                  
                  {importing && (
                    <div className="flex items-center gap-2 text-sm text-muted-foreground">
                      <div className="h-4 w-4 animate-spin rounded-full border-2 border-primary border-t-transparent"></div>
                      <span>Processando arquivo e importando leads...</span>
                    </div>
                  )}

                  {importResult && (
                    <div className={`rounded-lg border p-4 ${
                      importResult.errors && importResult.errors.length > 0
                        ? 'border-yellow-200 bg-yellow-50 dark:border-yellow-800 dark:bg-yellow-900/20'
                        : 'border-green-200 bg-green-50 dark:border-green-800 dark:bg-green-900/20'
                    }`}>
                      <div className="flex items-start gap-3">
                        {importResult.errors && importResult.errors.length > 0 ? (
                          <XCircle className="h-5 w-5 text-yellow-600 dark:text-yellow-400 mt-0.5" />
                        ) : (
                          <CheckCircle2 className="h-5 w-5 text-green-600 dark:text-green-400 mt-0.5" />
                        )}
                        <div className="flex-1">
                          <div className="font-semibold mb-2">
                            {importResult.errors && importResult.errors.length > 0
                              ? 'Importação concluída com avisos'
                              : 'Importação concluída com sucesso!'}
                          </div>
                          <div className="text-sm mb-2">
                            <strong className="text-lg">{importResult.imported}</strong> leads importados
                          </div>
                          {importResult.errors && importResult.errors.length > 0 && (
                            <div className="mt-3">
                              <div className="text-sm font-medium mb-2">
                                Erros encontrados ({importResult.errors.length}):
                              </div>
                              <div className="max-h-40 overflow-y-auto rounded bg-background p-3 text-xs">
                                <ul className="list-disc list-inside space-y-1">
                                  {importResult.errors.slice(0, 10).map((error: string, idx: number) => (
                                    <li key={idx} className="text-muted-foreground">{error}</li>
                                  ))}
                                  {importResult.errors.length > 10 && (
                                    <li className="text-muted-foreground italic">
                                      ... e mais {importResult.errors.length - 10} erros
                                    </li>
                                  )}
                                </ul>
                              </div>
                            </div>
                          )}
                        </div>
                      </div>
                    </div>
                  )}
                </div>

                {/* Instructions */}
                <div className="rounded-lg bg-muted p-4">
                  <h4 className="font-semibold mb-2 text-sm">Colunas esperadas no CSV:</h4>
                  <ul className="text-xs text-muted-foreground space-y-1 list-disc list-inside">
                    <li><strong>Nome</strong> (obrigatório) - Nome completo do lead</li>
                    <li><strong>Empresa</strong> - Nome da empresa</li>
                    <li><strong>Cargo</strong> - Cargo/função do lead</li>
                    <li><strong>Linkedin</strong> - URL do perfil LinkedIn</li>
                    <li><strong>Data 1o contato</strong> - Data do primeiro contato (DD/MM/YYYY)</li>
                    <li><strong>Status</strong> - Status do lead (ex: "Lead Novo", "Contatado")</li>
                    <li><strong>Próxima ação</strong> - Próxima ação a ser realizada</li>
                    <li><strong>Observação</strong> - Observações adicionais</li>
                  </ul>
                </div>

                {/* Actions */}
                <div className="flex justify-end gap-2 pt-4 border-t">
                  <Button
                    variant="outline"
                    onClick={() => {
                      setShowImportModal(false)
                      setImportResult(null)
                    }}
                    disabled={importing}
                  >
                    {importResult ? 'Fechar' : 'Cancelar'}
                  </Button>
                  {importResult && (
                    <Button
                      onClick={() => {
                        setShowImportModal(false)
                        setImportResult(null)
                        fetchLeads()
                      }}
                    >
                      Ver Leads Importados
                    </Button>
                  )}
                </div>
              </div>
        </CardContent>
      </Card>
    </div>
      )}

      {/* Stats Cards */}
      {stats && (
        <div className="grid gap-4 md:grid-cols-4">
          <Card className="border-l-4 border-l-blue-500 bg-gradient-to-br from-blue-50/50 to-white dark:from-blue-950/20 dark:to-background">
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium text-blue-700 dark:text-blue-300">Total de Leads</CardTitle>
              <div className="p-2 rounded-lg bg-blue-100 dark:bg-blue-900/30">
                <User className="h-4 w-4 text-blue-600 dark:text-blue-400" />
              </div>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-blue-900 dark:text-blue-100">{stats.total}</div>
            </CardContent>
          </Card>
          <Card className="border-l-4 border-l-green-500 bg-gradient-to-br from-green-50/50 to-white dark:from-green-950/20 dark:to-background">
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium text-green-700 dark:text-green-300">Atribuídos</CardTitle>
              <div className="p-2 rounded-lg bg-green-100 dark:bg-green-900/30">
                <CheckCircle2 className="h-4 w-4 text-green-600 dark:text-green-400" />
              </div>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-green-900 dark:text-green-100">{stats.assigned}</div>
            </CardContent>
          </Card>
          <Card className="border-l-4 border-l-orange-500 bg-gradient-to-br from-orange-50/50 to-white dark:from-orange-950/20 dark:to-background">
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium text-orange-700 dark:text-orange-300">Não Atribuídos</CardTitle>
              <div className="p-2 rounded-lg bg-orange-100 dark:bg-orange-900/30">
                <XCircle className="h-4 w-4 text-orange-600 dark:text-orange-400" />
              </div>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-orange-900 dark:text-orange-100">{stats.unassigned}</div>
            </CardContent>
          </Card>
          <Card className="border-l-4 border-l-purple-500 bg-gradient-to-br from-purple-50/50 to-white dark:from-purple-950/20 dark:to-background">
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium text-purple-700 dark:text-purple-300">Score Médio</CardTitle>
              <div className="p-2 rounded-lg bg-purple-100 dark:bg-purple-900/30">
                <TrendingUp className="h-4 w-4 text-purple-600 dark:text-purple-400" />
              </div>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-purple-900 dark:text-purple-100">{stats.average_score || 0}</div>
            </CardContent>
          </Card>
        </div>
      )}

      {/* Selection and Filters */}
      <Card className="border-t-4 border-t-indigo-500 bg-gradient-to-br from-indigo-50/30 to-white dark:from-indigo-950/10 dark:to-background">
        <CardHeader className="bg-gradient-to-r from-indigo-50/50 to-transparent dark:from-indigo-950/20">
          <div className="flex items-center justify-between">
            <CardTitle className="flex items-center gap-2 text-indigo-900 dark:text-indigo-100">
              <Filter className="h-5 w-5 text-indigo-600 dark:text-indigo-400" />
              Filtros
            </CardTitle>
            <div className="flex items-center gap-2">
              <input
                type="checkbox"
                checked={selectedLeads.size > 0 && selectedLeads.size === leads.length}
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
                  placeholder="Nome, email ou empresa..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="pl-8"
                />
              </div>
            </div>
            <div className="space-y-2">
              <label className="text-sm font-medium">Status</label>
              <select
                value={statusFilter}
                onChange={(e) => setStatusFilter(e.target.value as LeadStatus | 'all')}
                className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background"
              >
                <option value="all">Todos</option>
                {Object.entries(statusLabels).map(([value, label]) => (
                  <option key={value} value={value}>{label}</option>
                ))}
              </select>
            </div>
            <div className="space-y-2">
              <label className="text-sm font-medium">Fonte</label>
              <select
                value={sourceFilter}
                onChange={(e) => setSourceFilter(e.target.value)}
                className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background"
              >
                <option value="all">Todas</option>
                {uniqueSources.map((source) => (
                  <option key={source} value={source}>{source}</option>
                ))}
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

      {/* Form */}
      {showForm && (
        <Card className="border-t-4 border-t-emerald-500 bg-gradient-to-br from-emerald-50/30 to-white dark:from-emerald-950/10 dark:to-background">
          <CardHeader className="bg-gradient-to-r from-emerald-50/50 to-transparent dark:from-emerald-950/20">
            <CardTitle className="text-emerald-900 dark:text-emerald-100">{editingId ? 'Editar Lead' : 'Novo Lead'}</CardTitle>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleSubmit} className="space-y-4">
              <div className="grid gap-4 md:grid-cols-2">
                <div className="space-y-2">
                  <label className="text-sm font-medium">Nome *</label>
                  <Input
                    value={formData.name}
                    onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                    required
                  />
                </div>
                <div className="space-y-2">
                  <label className="text-sm font-medium">Email</label>
                  <Input
                    type="email"
                    value={formData.email}
                    onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                  />
                </div>
                <div className="space-y-2">
                  <label className="text-sm font-medium">Telefone</label>
                  <Input
                    value={formData.phone}
                    onChange={(e) => setFormData({ ...formData, phone: e.target.value })}
                  />
                </div>
                <div className="space-y-2">
                  <label className="text-sm font-medium">Empresa</label>
                  <Input
                    value={formData.company}
                    onChange={(e) => setFormData({ ...formData, company: e.target.value })}
                  />
                </div>
                <div className="space-y-2">
                  <label className="text-sm font-medium">Cargo</label>
                  <Input
                    value={formData.position}
                    onChange={(e) => setFormData({ ...formData, position: e.target.value })}
                  />
                </div>
                <div className="space-y-2">
                  <label className="text-sm font-medium">Site da Empresa</label>
                  <Input
                    type="url"
                    value={formData.website}
                    onChange={(e) => setFormData({ ...formData, website: e.target.value })}
                    placeholder="https://exemplo.com.br"
                  />
                </div>
                <div className="space-y-2">
                  <label className="text-sm font-medium">LinkedIn</label>
                  <Input
                    value={formData.linkedin_url}
                    onChange={(e) => setFormData({ ...formData, linkedin_url: e.target.value })}
                  />
                </div>
                <div className="space-y-2">
                  <label className="text-sm font-medium">Fonte</label>
                  <Input
                    value={formData.source}
                    onChange={(e) => setFormData({ ...formData, source: e.target.value })}
                    placeholder="Website, LinkedIn, Referral, etc."
                  />
                </div>
                <div className="space-y-2">
                  <label className="text-sm font-medium">Status</label>
                  <select
                    value={formData.status}
                    onChange={(e) => setFormData({ ...formData, status: e.target.value as LeadStatus })}
                    className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background"
                  >
                    {Object.entries(statusLabels).map(([value, label]) => (
                      <option key={value} value={value}>{label}</option>
                    ))}
                  </select>
                </div>
                <div className="space-y-2">
                  <label className="text-sm font-medium">Score (0-100)</label>
                  <Input
                    type="number"
                    min="0"
                    max="100"
                    value={formData.score}
                    onChange={(e) => setFormData({ ...formData, score: parseInt(e.target.value) || 0 })}
                  />
                </div>
                <div className="space-y-2">
                  <label className="text-sm font-medium">Responsável</label>
                  <select
                    value={formData.owner_id || ''}
                    onChange={(e) => setFormData({ ...formData, owner_id: e.target.value ? parseInt(e.target.value) : null })}
                    className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background"
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
              <div className="grid gap-4 md:grid-cols-2">
                <div className="space-y-2">
                  <label className="text-sm font-medium">Endereço</label>
                  <Input
                    value={formData.address}
                    onChange={(e) => setFormData({ ...formData, address: e.target.value })}
                    placeholder="Rua, número, complemento"
                  />
                </div>
                <div className="space-y-2">
                  <label className="text-sm font-medium">Cidade</label>
                  <Input
                    value={formData.city}
                    onChange={(e) => setFormData({ ...formData, city: e.target.value })}
                  />
                </div>
                <div className="space-y-2">
                  <label className="text-sm font-medium">Estado</label>
                  <Input
                    value={formData.state}
                    onChange={(e) => setFormData({ ...formData, state: e.target.value })}
                    placeholder="SP, RJ, MG..."
                  />
                </div>
                <div className="space-y-2">
                  <label className="text-sm font-medium">CEP</label>
                  <Input
                    value={formData.zip_code}
                    onChange={(e) => setFormData({ ...formData, zip_code: e.target.value })}
                    placeholder="12345-678"
                  />
                </div>
                <div className="space-y-2">
                  <label className="text-sm font-medium">País</label>
                  <Input
                    value={formData.country}
                    onChange={(e) => setFormData({ ...formData, country: e.target.value })}
                    placeholder="Brasil"
                  />
                </div>
                <div className="space-y-2">
                  <label className="text-sm font-medium">Setor/Indústria</label>
                  <Input
                    value={formData.industry}
                    onChange={(e) => setFormData({ ...formData, industry: e.target.value })}
                    placeholder="Tecnologia, Saúde, Educação..."
                  />
                </div>
                <div className="space-y-2 md:col-span-2">
                  <label className="text-sm font-medium">Tamanho da Empresa</label>
                  <Input
                    value={formData.company_size}
                    onChange={(e) => setFormData({ ...formData, company_size: e.target.value })}
                    placeholder="50-200 funcionários, Startup, Grande empresa..."
                  />
                </div>
              </div>
              <div className="space-y-2">
                <label className="text-sm font-medium">Contexto da Empresa</label>
                <Textarea
                  value={formData.context}
                  onChange={(e) => setFormData({ ...formData, context: e.target.value })}
                  rows={6}
                  placeholder="Resumo sobre a empresa, produtos/serviços, tecnologias utilizadas, dores identificadas, oportunidades de vendas..."
                />
                <p className="text-xs text-muted-foreground">
                  Este campo pode ser preenchido automaticamente quando uma tarefa de pesquisa for concluída.
                </p>
              </div>

              {/* Seção Casa dos Dados */}
              <div className="border-t pt-6 mt-6">
                <h3 className="text-lg font-semibold mb-4">Dados Fiscais (Casa dos Dados)</h3>
                <div className="grid gap-4 md:grid-cols-2">
                  <div className="space-y-2">
                    <label className="text-sm font-medium">CNPJ</label>
                    <Input
                      value={formData.cnpj}
                      onChange={(e) => setFormData({ ...formData, cnpj: e.target.value })}
                      placeholder="00.000.000/0000-00"
                    />
                  </div>
                  <div className="space-y-2">
                    <label className="text-sm font-medium">Razão Social</label>
                    <Input
                      value={formData.razao_social}
                      onChange={(e) => setFormData({ ...formData, razao_social: e.target.value })}
                    />
                  </div>
                  <div className="space-y-2">
                    <label className="text-sm font-medium">Nome Fantasia</label>
                    <Input
                      value={formData.nome_fantasia}
                      onChange={(e) => setFormData({ ...formData, nome_fantasia: e.target.value })}
                    />
                  </div>
                  <div className="space-y-2">
                    <label className="text-sm font-medium">Data de Abertura</label>
                    <Input
                      type="date"
                      value={formData.data_abertura}
                      onChange={(e) => setFormData({ ...formData, data_abertura: e.target.value })}
                    />
                  </div>
                  <div className="space-y-2">
                    <label className="text-sm font-medium">Capital Social (R$)</label>
                    <Input
                      type="number"
                      step="0.01"
                      value={formData.capital_social}
                      onChange={(e) => setFormData({ ...formData, capital_social: e.target.value })}
                      placeholder="0.00"
                    />
                  </div>
                  <div className="space-y-2">
                    <label className="text-sm font-medium">Situação Cadastral</label>
                    <Input
                      value={formData.situacao_cadastral}
                      onChange={(e) => setFormData({ ...formData, situacao_cadastral: e.target.value })}
                    />
                  </div>
                  <div className="space-y-2">
                    <label className="text-sm font-medium">Data Situação Cadastral</label>
                    <Input
                      type="date"
                      value={formData.data_situacao_cadastral}
                      onChange={(e) => setFormData({ ...formData, data_situacao_cadastral: e.target.value })}
                    />
                  </div>
                  <div className="space-y-2">
                    <label className="text-sm font-medium">Motivo Situação Cadastral</label>
                    <Input
                      value={formData.motivo_situacao_cadastral}
                      onChange={(e) => setFormData({ ...formData, motivo_situacao_cadastral: e.target.value })}
                    />
                  </div>
                  <div className="space-y-2">
                    <label className="text-sm font-medium">Natureza Jurídica</label>
                    <Input
                      value={formData.natureza_juridica}
                      onChange={(e) => setFormData({ ...formData, natureza_juridica: e.target.value })}
                    />
                  </div>
                  <div className="space-y-2">
                    <label className="text-sm font-medium">Porte</label>
                    <Input
                      value={formData.porte}
                      onChange={(e) => setFormData({ ...formData, porte: e.target.value })}
                      placeholder="ME, EPP, Grande..."
                    />
                  </div>
                </div>

                <h4 className="text-md font-semibold mt-6 mb-4">Endereço Fiscal</h4>
                <div className="grid gap-4 md:grid-cols-2">
                  <div className="space-y-2">
                    <label className="text-sm font-medium">Logradouro</label>
                    <Input
                      value={formData.logradouro}
                      onChange={(e) => setFormData({ ...formData, logradouro: e.target.value })}
                    />
                  </div>
                  <div className="space-y-2">
                    <label className="text-sm font-medium">Número</label>
                    <Input
                      value={formData.numero}
                      onChange={(e) => setFormData({ ...formData, numero: e.target.value })}
                    />
                  </div>
                  <div className="space-y-2">
                    <label className="text-sm font-medium">Complemento</label>
                    <Input
                      value={formData.complemento}
                      onChange={(e) => setFormData({ ...formData, complemento: e.target.value })}
                    />
                  </div>
                  <div className="space-y-2">
                    <label className="text-sm font-medium">Bairro</label>
                    <Input
                      value={formData.bairro}
                      onChange={(e) => setFormData({ ...formData, bairro: e.target.value })}
                    />
                  </div>
                  <div className="space-y-2">
                    <label className="text-sm font-medium">CEP</label>
                    <Input
                      value={formData.cep}
                      onChange={(e) => setFormData({ ...formData, cep: e.target.value })}
                      placeholder="00000-000"
                    />
                  </div>
                  <div className="space-y-2">
                    <label className="text-sm font-medium">Município</label>
                    <Input
                      value={formData.municipio}
                      onChange={(e) => setFormData({ ...formData, municipio: e.target.value })}
                    />
                  </div>
                  <div className="space-y-2">
                    <label className="text-sm font-medium">UF</label>
                    <Input
                      value={formData.uf}
                      onChange={(e) => setFormData({ ...formData, uf: e.target.value.toUpperCase() })}
                      placeholder="SP"
                      maxLength={2}
                    />
                  </div>
                </div>

                <h4 className="text-md font-semibold mt-6 mb-4">CNAE</h4>
                <div className="grid gap-4 md:grid-cols-2">
                  <div className="space-y-2">
                    <label className="text-sm font-medium">CNAE Principal - Código</label>
                    <Input
                      value={formData.cnae_principal_codigo}
                      onChange={(e) => setFormData({ ...formData, cnae_principal_codigo: e.target.value })}
                    />
                  </div>
                  <div className="space-y-2 md:col-span-2">
                    <label className="text-sm font-medium">CNAE Principal - Descrição</label>
                    <Input
                      value={formData.cnae_principal_descricao}
                      onChange={(e) => setFormData({ ...formData, cnae_principal_descricao: e.target.value })}
                    />
                  </div>
                  <div className="space-y-2 md:col-span-2">
                    <label className="text-sm font-medium">CNAEs Secundários (JSON)</label>
                    <Textarea
                      value={formData.cnaes_secundarios_json}
                      onChange={(e) => setFormData({ ...formData, cnaes_secundarios_json: e.target.value })}
                      rows={3}
                      placeholder='[{"codigo": "1234-5/67", "descricao": "Atividade secundária"}]'
                    />
                  </div>
                </div>

                <h4 className="text-md font-semibold mt-6 mb-4">Contato e Outros</h4>
                <div className="grid gap-4 md:grid-cols-2">
                  <div className="space-y-2">
                    <label className="text-sm font-medium">Telefone da Empresa</label>
                    <Input
                      value={formData.telefone_empresa}
                      onChange={(e) => setFormData({ ...formData, telefone_empresa: e.target.value })}
                    />
                  </div>
                  <div className="space-y-2">
                    <label className="text-sm font-medium">Email da Empresa</label>
                    <Input
                      type="email"
                      value={formData.email_empresa}
                      onChange={(e) => setFormData({ ...formData, email_empresa: e.target.value })}
                    />
                  </div>
                  <div className="space-y-2 md:col-span-2">
                    <label className="text-sm font-medium">Sócios (JSON)</label>
                    <Textarea
                      value={formData.socios_json}
                      onChange={(e) => setFormData({ ...formData, socios_json: e.target.value })}
                      rows={3}
                      placeholder='[{"nome": "João Silva", "qualificacao": "Sócio-Administrador", "cpf_cnpj": "123.456.789-00"}]'
                    />
                  </div>
                  <div className="space-y-2 flex items-center gap-2">
                    <input
                      type="checkbox"
                      checked={formData.simples_nacional}
                      onChange={(e) => setFormData({ ...formData, simples_nacional: e.target.checked })}
                      className="h-4 w-4"
                    />
                    <label className="text-sm font-medium">Optante do Simples Nacional</label>
                  </div>
                  <div className="space-y-2">
                    <label className="text-sm font-medium">Data Opção Simples</label>
                    <Input
                      type="date"
                      value={formData.data_opcao_simples}
                      onChange={(e) => setFormData({ ...formData, data_opcao_simples: e.target.value })}
                    />
                  </div>
                  <div className="space-y-2">
                    <label className="text-sm font-medium">Data Exclusão Simples</label>
                    <Input
                      type="date"
                      value={formData.data_exclusao_simples}
                      onChange={(e) => setFormData({ ...formData, data_exclusao_simples: e.target.value })}
                    />
                  </div>
                </div>
              </div>

              <div className="space-y-2">
                <label className="text-sm font-medium">Notas</label>
                <Textarea
                  value={formData.notes}
                  onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
                  rows={4}
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
                  className="border-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800"
                  onClick={() => {
                    setShowForm(false)
                    setEditingId(null)
                    setFormData({
                      name: '',
                      email: '',
                      phone: '',
                      company: '',
                      position: '',
                      website: '',
                      linkedin_url: '',
                      status: 'new',
                      source: '',
                      score: 0,
                      notes: '',
                      tags: '',
                      address: '',
                      city: '',
                      state: '',
                      zip_code: '',
                      country: '',
                      industry: '',
                      company_size: '',
                      context: '',
                      // Campos Casa dos Dados
                      razao_social: '',
                      nome_fantasia: '',
                      cnpj: '',
                      data_abertura: '',
                      capital_social: '',
                      situacao_cadastral: '',
                      data_situacao_cadastral: '',
                      motivo_situacao_cadastral: '',
                      natureza_juridica: '',
                      porte: '',
                      logradouro: '',
                      numero: '',
                      bairro: '',
                      cep: '',
                      municipio: '',
                      uf: '',
                      complemento: '',
                      cnae_principal_codigo: '',
                      cnae_principal_descricao: '',
                      cnaes_secundarios_json: '',
                      telefone_empresa: '',
                      email_empresa: '',
                      socios_json: '',
                      simples_nacional: false,
                      data_opcao_simples: '',
                      data_exclusao_simples: '',
                      agent_suggestion: ''
                    })
                  }}
                >
                  Cancelar
                </Button>
              </div>
            </form>
        </CardContent>
      </Card>
      )}

      {/* Leads List */}
      {leads.length === 0 ? (
        <Card className="border-dashed border-2 border-slate-300 dark:border-slate-700 bg-gradient-to-br from-slate-50/50 to-white dark:from-slate-950/50 dark:to-background">
          <CardContent className="py-12 text-center">
            <p className="text-slate-600 dark:text-slate-400 font-medium">Nenhum lead encontrado</p>
            <p className="mt-2 text-sm text-slate-500 dark:text-slate-500">
              Crie seu primeiro lead para começar
          </p>
        </CardContent>
      </Card>
      ) : (
        <>
          {/* Bulk Actions Bar */}
          {selectedLeads.size > 0 && (
          <Card className="bg-gradient-to-r from-blue-50 to-indigo-50 dark:from-blue-950 dark:to-indigo-950 border-blue-300 dark:border-blue-700 shadow-md">
            <CardContent className="py-3">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-4">
                  <span className="font-medium text-blue-900 dark:text-blue-100">
                    {selectedLeads.size} lead(s) selecionado(s)
                  </span>
                  <Button
                    size="sm"
                    variant="outline"
                    className="border-blue-300 hover:bg-blue-100 dark:hover:bg-blue-900"
                    onClick={() => setSelectedLeads(new Set())}
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
                    onClick={handleBulkSendEmail}
                  >
                    <Mail className="h-4 w-4 mr-1" />
                    Enviar E-mail
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => {
                      setSelectedLeadId(null)
                      setShowSequenceModal(true)
                    }}
                  >
                    <Workflow className="h-4 w-4 mr-1" />
                    Associar Cadência
                  </Button>
                </div>
              </div>
            </CardContent>
          </Card>
        )}

        <div className="grid gap-4">
          {leads.map((lead) => (
            <Card 
              key={lead.id}
              className="cursor-pointer hover:shadow-lg transition-all duration-200 border-l-4 border-l-slate-300 hover:border-l-blue-500 bg-gradient-to-r from-white to-slate-50/50 dark:from-background dark:to-slate-950/50"
              onClick={() => handleOpenLeadDetail(lead)}
            >
              <CardHeader>
                <div className="flex items-start justify-between">
                  <div className="flex items-start gap-3 flex-1">
                    <input
                      type="checkbox"
                      checked={selectedLeads.has(lead.id)}
                      onChange={() => handleSelectLead(lead.id)}
                      className="mt-1 h-4 w-4"
                    />
                    <div className="flex-1">
                      <CardTitle className="flex items-center gap-2">
                        {lead.name}
                        <span className={`inline-block rounded-full px-2 py-1 text-xs ${statusColors[lead.status]}`}>
                          {statusLabels[lead.status]}
                        </span>
                        {lead.score !== null && lead.score > 0 && (
                          <span className="text-sm text-muted-foreground">
                            Score: {lead.score}
                          </span>
                        )}
                      </CardTitle>
                      <div className="mt-2 space-y-1 text-sm text-muted-foreground">
                      {lead.company && (
                        <div className="flex items-center gap-2">
                          <Building className="h-4 w-4" />
                          <span>{lead.company}</span>
                          {lead.position && <span> • {lead.position}</span>}
                        </div>
                      )}
                      {lead.email && (
                        <div className="flex items-center gap-2">
                          <Mail className="h-4 w-4" />
                          <a href={`mailto:${lead.email}`} className="hover:underline">
                            {lead.email}
                          </a>
                        </div>
                      )}
                      {lead.phone && (
                        <div className="flex items-center gap-2">
                          <Phone className="h-4 w-4" />
                          <a href={`tel:${lead.phone}`} className="hover:underline">
                            {lead.phone}
                          </a>
                        </div>
                      )}
                      {lead.website && (
                        <div className="flex items-center gap-2">
                          <LinkIcon className="h-4 w-4" />
                          <a href={lead.website} target="_blank" rel="noopener noreferrer" className="hover:underline">
                            Site: {lead.website}
                          </a>
                        </div>
                      )}
                      {lead.linkedin_url && (
                        <div className="flex items-center gap-2">
                          <LinkIcon className="h-4 w-4" />
                          <a href={lead.linkedin_url} target="_blank" rel="noopener noreferrer" className="hover:underline">
                            LinkedIn
                          </a>
                        </div>
                      )}
                      {lead.source && (
                        <div className="text-sm">Fonte: {lead.source}</div>
                      )}
                      {lead.owner && (
                        <div className="flex items-center gap-2 text-sm">
                          <User className="h-4 w-4" />
                          <span>Responsável: {lead.owner.full_name}</span>
                        </div>
                      )}
                      {lead.owner_id && !lead.owner && (
                        <div className="flex items-center gap-2 text-sm">
                          <User className="h-4 w-4" />
                          <span>Responsável: {users.find(u => u.id === lead.owner_id)?.full_name || `ID: ${lead.owner_id}`}</span>
                        </div>
                      )}
                      {lead.next_followup && (
                        <div className="flex items-center gap-2 text-sm">
                          <Clock className="h-4 w-4" />
                          <span>Próximo follow-up: {new Date(lead.next_followup).toLocaleDateString('pt-BR')}</span>
                        </div>
                      )}
                      </div>
                    </div>
                  </div>
                  <div className="flex gap-2">
                    <select
                      value={lead.status}
                      onChange={(e) => handleStatusChange(lead.id, e.target.value as LeadStatus)}
                      className="text-xs rounded-md border border-input bg-background px-2 py-1"
                      onClick={(e) => e.stopPropagation()}
                    >
                      {Object.entries(statusLabels).map(([value, label]) => (
                        <option key={value} value={value}>{label}</option>
                      ))}
                    </select>
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={(e) => {
                        e.stopPropagation()
                        handleEdit(lead)
                      }}
                    >
                      <Edit className="h-4 w-4" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={(e) => {
                        e.stopPropagation()
                        setSelectedLeadId(lead.id)
                        setShowSequenceModal(true)
                      }}
                      title="Associar Cadência"
                    >
                      <Workflow className="h-4 w-4" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={(e) => {
                        e.stopPropagation()
                        handleDelete(lead.id)
                      }}
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                </div>
              </CardHeader>
              {lead.notes && (
                <CardContent>
                  <p className="text-sm text-muted-foreground">{lead.notes}</p>
                </CardContent>
              )}
            </Card>
          ))}
        </div>
        </>
      )}

      {/* Pagination */}
      {totalLeads > 0 && (
      <Card>
          <CardContent className="py-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-4">
                <span className="text-sm text-muted-foreground">
                  Mostrando {((currentPage - 1) * pageSize) + 1} a {Math.min(currentPage * pageSize, totalLeads)} de {totalLeads} leads
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

      {/* Modal de Associar Cadência */}
      {showSequenceModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <Card className="w-full max-w-md">
        <CardHeader>
              <CardTitle>
                {selectedLeadId 
                  ? 'Associar Cadência ao Lead'
                  : `Associar Cadência a ${selectedLeads.size} Lead(s)`}
              </CardTitle>
        </CardHeader>
        <CardContent>
              <div className="space-y-4">
                <p className="text-sm text-muted-foreground">
                  Selecione uma cadência para associar. As tarefas serão criadas automaticamente.
                </p>
                
                {/* Campo de Data de Início */}
                <div className="space-y-2">
                  <label className="block text-sm font-medium">
                    Data de Início (opcional)
                  </label>
                  <input
                    type="datetime-local"
                    value={sequenceStartDate}
                    onChange={(e) => setSequenceStartDate(e.target.value)}
                    className="w-full px-3 py-2 border rounded-md"
                    min={new Date().toISOString().slice(0, 16)}
                  />
                  <p className="text-xs text-muted-foreground">
                    Se não preencher, as tarefas começam hoje. Ex: 01/01/2026 09:00
                  </p>
                </div>
                
                {sequences.length === 0 ? (
                  <p className="text-sm text-muted-foreground text-center py-4">
                    Nenhuma cadência ativa disponível. Crie uma cadência primeiro.
                  </p>
                ) : (
                  <div className="space-y-2">
                    {sequences.map((sequence) => {
                      let steps = []
                      try {
                        steps = JSON.parse(sequence.steps)
                      } catch {
                        steps = []
                      }
                      
                      return (
                        <button
                          key={sequence.id}
                          onClick={() => {
                            if (selectedLeadId) {
                              handleAssociateSequence(sequence.id)
                            } else {
                              handleBulkAssociateSequence(sequence.id)
                            }
                          }}
                          className="w-full text-left p-3 border rounded-lg hover:bg-accent transition-colors"
                        >
                          <div className="font-medium">{sequence.name}</div>
                          {sequence.description && (
                            <div className="text-sm text-muted-foreground mt-1">
                              {sequence.description}
                            </div>
                          )}
                          <div className="text-xs text-muted-foreground mt-2">
                            {steps.length} etapa(s)
                          </div>
                        </button>
                      )
                    })}
                  </div>
                )}
                <div className="flex gap-2 pt-4">
                  <Button
                    variant="outline"
                    className="flex-1"
                    onClick={() => {
                      setShowSequenceModal(false)
                      setSelectedLeadId(null)
                      setSequenceStartDate('')
                    }}
                  >
                    Cancelar
                  </Button>
                </div>
              </div>
        </CardContent>
      </Card>
    </div>
      )}

      {/* Modal de Detalhes do Lead */}
      {showLeadDetailModal && selectedLeadDetail && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
          <Card className="w-full max-w-4xl h-[90vh] overflow-hidden flex flex-col">
            <CardHeader className="border-b flex-shrink-0">
              <div className="flex items-center justify-between">
                <CardTitle className="text-2xl">Detalhes do Lead</CardTitle>
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={() => {
                    setShowLeadDetailModal(false)
                    setSelectedLeadDetail(null)
                    setLeadTasks([])
                    setLeadComments([])
                    setNewComment('')
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
                  onClick={() => setActiveTab('endereco')}
                  className={`px-4 py-3 text-sm font-medium border-b-2 transition-colors whitespace-nowrap ${
                    activeTab === 'endereco'
                      ? 'border-primary text-primary'
                      : 'border-transparent text-muted-foreground hover:text-foreground'
                  }`}
                >
                  Endereço
                </button>
                <button
                  onClick={() => setActiveTab('empresa')}
                  className={`px-4 py-3 text-sm font-medium border-b-2 transition-colors whitespace-nowrap ${
                    activeTab === 'empresa'
                      ? 'border-primary text-primary'
                      : 'border-transparent text-muted-foreground hover:text-foreground'
                  }`}
                >
                  Empresa
                </button>
                <button
                  onClick={() => setActiveTab('contexto')}
                  className={`px-4 py-3 text-sm font-medium border-b-2 transition-colors whitespace-nowrap ${
                    activeTab === 'contexto'
                      ? 'border-primary text-primary'
                      : 'border-transparent text-muted-foreground hover:text-foreground'
                  }`}
                >
                  Contexto
                </button>
                <button
                  onClick={() => setActiveTab('notas')}
                  className={`px-4 py-3 text-sm font-medium border-b-2 transition-colors whitespace-nowrap ${
                    activeTab === 'notas'
                      ? 'border-primary text-primary'
                      : 'border-transparent text-muted-foreground hover:text-foreground'
                  }`}
                >
                  Notas e Comentários
                </button>
                <button
                  onClick={() => setActiveTab('tarefas')}
                  className={`px-4 py-3 text-sm font-medium border-b-2 transition-colors whitespace-nowrap ${
                    activeTab === 'tarefas'
                      ? 'border-primary text-primary'
                      : 'border-transparent text-muted-foreground hover:text-foreground'
                  }`}
                >
                  Tarefas
                </button>
                <button
                  onClick={() => setActiveTab('historico')}
                  className={`px-4 py-3 text-sm font-medium border-b-2 transition-colors whitespace-nowrap ${
                    activeTab === 'historico'
                      ? 'border-primary text-primary'
                      : 'border-transparent text-muted-foreground hover:text-foreground'
                  }`}
                >
                  Histórico
                </button>
              </div>
            </div>

            <CardContent className="flex-1 overflow-y-auto p-6">
              {/* Aba: Informações Básicas */}
              {activeTab === 'basicas' && (
                <div className="space-y-4">
                  <div className="grid gap-4 md:grid-cols-2">
                    <div>
                      <label className="text-sm font-medium text-muted-foreground">Nome</label>
                      <p className="text-base font-medium mt-1">{selectedLeadDetail.name}</p>
                    </div>
                    <div>
                      <label className="text-sm font-medium text-muted-foreground">Status</label>
                      <p className="mt-1">
                        <span className={`inline-block rounded-full px-2 py-1 text-xs ${statusColors[selectedLeadDetail.status]}`}>
                          {statusLabels[selectedLeadDetail.status]}
                        </span>
                      </p>
                    </div>
                    {selectedLeadDetail.email && (
                      <div>
                        <label className="text-sm font-medium text-muted-foreground">Email</label>
                        <p className="text-base mt-1">
                          <a href={`mailto:${selectedLeadDetail.email}`} className="hover:underline flex items-center gap-2">
                            <Mail className="h-4 w-4" />
                            {selectedLeadDetail.email}
                          </a>
                        </p>
                      </div>
                    )}
                    {selectedLeadDetail.phone && (
                      <div>
                        <label className="text-sm font-medium text-muted-foreground">Telefone</label>
                        <p className="text-base mt-1">
                          <a href={`tel:${selectedLeadDetail.phone}`} className="hover:underline flex items-center gap-2">
                            <Phone className="h-4 w-4" />
                            {selectedLeadDetail.phone}
                          </a>
                        </p>
                      </div>
                    )}
                    {selectedLeadDetail.source && (
                      <div>
                        <label className="text-sm font-medium text-muted-foreground">Fonte</label>
                        <p className="text-base mt-1">{selectedLeadDetail.source}</p>
                      </div>
                    )}
                    {selectedLeadDetail.score !== null && (
                      <div>
                        <label className="text-sm font-medium text-muted-foreground">Score</label>
                        <p className="text-base mt-1 flex items-center gap-2">
                          <TrendingUp className="h-4 w-4" />
                          {selectedLeadDetail.score}
                        </p>
                      </div>
                    )}
                    {selectedLeadDetail.tags && (
                      <div className="md:col-span-2">
                        <label className="text-sm font-medium text-muted-foreground">Tags</label>
                        <p className="text-base mt-1">{selectedLeadDetail.tags}</p>
                      </div>
                    )}
                  </div>
                </div>
              )}

              {/* Aba: Endereço */}
              {activeTab === 'endereco' && (
                <div className="space-y-4">
                  {selectedLeadDetail.address ? (
                    <div>
                      <label className="text-sm font-medium text-muted-foreground">Endereço Completo</label>
                      <p className="text-base mt-1">{selectedLeadDetail.address}</p>
                    </div>
                  ) : (
                    <p className="text-sm text-muted-foreground">Nenhum endereço cadastrado.</p>
                  )}
                  <div className="grid gap-4 md:grid-cols-2">
                    {selectedLeadDetail.city && (
                      <div>
                        <label className="text-sm font-medium text-muted-foreground">Cidade</label>
                        <p className="text-base mt-1">{selectedLeadDetail.city}</p>
                      </div>
                    )}
                    {selectedLeadDetail.state && (
                      <div>
                        <label className="text-sm font-medium text-muted-foreground">Estado</label>
                        <p className="text-base mt-1">{selectedLeadDetail.state}</p>
                      </div>
                    )}
                    {selectedLeadDetail.zip_code && (
                      <div>
                        <label className="text-sm font-medium text-muted-foreground">CEP</label>
                        <p className="text-base mt-1">{selectedLeadDetail.zip_code}</p>
                      </div>
                    )}
                    {selectedLeadDetail.country && (
                      <div>
                        <label className="text-sm font-medium text-muted-foreground">País</label>
                        <p className="text-base mt-1">{selectedLeadDetail.country}</p>
                      </div>
                    )}
                  </div>
                  {!selectedLeadDetail.address && !selectedLeadDetail.city && !selectedLeadDetail.state && !selectedLeadDetail.zip_code && !selectedLeadDetail.country && (
                    <p className="text-sm text-muted-foreground text-center py-8">
                      Nenhuma informação de endereço disponível. Estes campos podem ser preenchidos automaticamente quando uma tarefa de pesquisa for concluída.
                    </p>
                  )}
                </div>
              )}

              {/* Aba: Empresa */}
              {activeTab === 'empresa' && (
                <div className="space-y-4">
                  <div className="grid gap-4 md:grid-cols-2">
                    {selectedLeadDetail.company && (
                      <div>
                        <label className="text-sm font-medium text-muted-foreground">Empresa</label>
                        <p className="text-base mt-1 flex items-center gap-2">
                          <Building className="h-4 w-4" />
                          {selectedLeadDetail.company}
                        </p>
                      </div>
                    )}
                    {selectedLeadDetail.position && (
                      <div>
                        <label className="text-sm font-medium text-muted-foreground">Cargo</label>
                        <p className="text-base mt-1">{selectedLeadDetail.position}</p>
                      </div>
                    )}
                    {selectedLeadDetail.industry && (
                      <div>
                        <label className="text-sm font-medium text-muted-foreground">Setor/Indústria</label>
                        <p className="text-base mt-1">{selectedLeadDetail.industry}</p>
                      </div>
                    )}
                    {selectedLeadDetail.company_size && (
                      <div>
                        <label className="text-sm font-medium text-muted-foreground">Tamanho da Empresa</label>
                        <p className="text-base mt-1">{selectedLeadDetail.company_size}</p>
                      </div>
                    )}
                    {selectedLeadDetail.website && (
                      <div className="md:col-span-2">
                        <label className="text-sm font-medium text-muted-foreground">Site da Empresa</label>
                        <p className="text-base mt-1">
                          <a href={selectedLeadDetail.website} target="_blank" rel="noopener noreferrer" className="hover:underline flex items-center gap-2">
                            <LinkIcon className="h-4 w-4" />
                            {selectedLeadDetail.website}
                          </a>
                        </p>
                      </div>
                    )}
                    {selectedLeadDetail.linkedin_url && (
                      <div className="md:col-span-2">
                        <label className="text-sm font-medium text-muted-foreground">LinkedIn</label>
                        <p className="text-base mt-1">
                          <a href={selectedLeadDetail.linkedin_url} target="_blank" rel="noopener noreferrer" className="hover:underline flex items-center gap-2">
                            <LinkIcon className="h-4 w-4" />
                            LinkedIn Profile
                          </a>
                        </p>
                      </div>
                    )}
                    {selectedLeadDetail.telefone_empresa && (
                      <div>
                        <label className="text-sm font-medium text-muted-foreground">Telefone da Empresa</label>
                        <p className="text-base mt-1">
                          <a href={`tel:${selectedLeadDetail.telefone_empresa}`} className="hover:underline flex items-center gap-2">
                            <Phone className="h-4 w-4" />
                            {selectedLeadDetail.telefone_empresa}
                          </a>
                        </p>
                      </div>
                    )}
                    {selectedLeadDetail.email_empresa && (
                      <div>
                        <label className="text-sm font-medium text-muted-foreground">Email da Empresa</label>
                        <p className="text-base mt-1">
                          <a href={`mailto:${selectedLeadDetail.email_empresa}`} className="hover:underline flex items-center gap-2">
                            <Mail className="h-4 w-4" />
                            {selectedLeadDetail.email_empresa}
                          </a>
                        </p>
                      </div>
                    )}
                    {selectedLeadDetail.socios_json && (
                      <div className="md:col-span-2">
                        <label className="text-sm font-medium text-muted-foreground">Sócios</label>
                        <div className="mt-2 space-y-2">
                          {(() => {
                            try {
                              const socios = JSON.parse(selectedLeadDetail.socios_json)
                              if (Array.isArray(socios) && socios.length > 0) {
                                return socios.map((socio: any, idx: number) => (
                                  <div key={idx} className="p-3 bg-muted rounded-lg">
                                    <div className="font-medium">{socio.nome || 'N/A'}</div>
                                    {socio.qualificacao && (
                                      <div className="text-sm text-muted-foreground mt-1">
                                        {socio.qualificacao}
                                      </div>
                                    )}
                                    {socio.cpf_cnpj && (
                                      <div className="text-xs text-muted-foreground mt-1">
                                        CPF/CNPJ: {socio.cpf_cnpj}
                                      </div>
                                    )}
                                    {socio.data_entrada && (
                                      <div className="text-xs text-muted-foreground mt-1">
                                        Entrada: {socio.data_entrada}
                                      </div>
                                    )}
                                  </div>
                                ))
                              }
                            } catch (e) {
                              return <p className="text-sm text-muted-foreground">Erro ao processar dados dos sócios</p>
                            }
                            return null
                          })()}
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              )}

              {/* Aba: Contexto */}
              {activeTab === 'contexto' && (
                <div className="space-y-4">
                  {selectedLeadDetail.context ? (
                    <div className="bg-blue-50 dark:bg-blue-950 p-6 rounded-lg border border-blue-200 dark:border-blue-800">
                      <p className="text-sm whitespace-pre-wrap leading-relaxed">{selectedLeadDetail.context}</p>
                    </div>
                  ) : (
                    <div className="text-center py-12">
                      <p className="text-sm text-muted-foreground mb-2">Nenhum contexto cadastrado.</p>
                      <p className="text-xs text-muted-foreground">
                        Este campo pode ser preenchido automaticamente quando uma tarefa de pesquisa for concluída.
                      </p>
                    </div>
                  )}
                </div>
              )}

              {/* Aba: Notas e Comentários */}
              {activeTab === 'notas' && (
                <div className="space-y-6">
                  {/* Notas */}
                  {selectedLeadDetail.notes && (
                    <div>
                      <h3 className="text-lg font-semibold mb-4">Notas</h3>
                      <div className="bg-gray-50 dark:bg-gray-900 p-4 rounded-lg">
                        <p className="text-sm whitespace-pre-wrap">{selectedLeadDetail.notes}</p>
                      </div>
                    </div>
                  )}

                  {/* Comentários */}
                  <div>
                    <h3 className="text-lg font-semibold mb-4">Comentários</h3>
                    
                    {/* Formulário para adicionar comentário */}
                    <div className="mb-4 space-y-2">
                      <Textarea
                        placeholder="Adicione um comentário sobre este lead..."
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
                    ) : leadComments.length === 0 ? (
                      <p className="text-sm text-muted-foreground">Nenhum comentário ainda. Seja o primeiro a comentar!</p>
                    ) : (
                      <div className="space-y-3">
                        {leadComments.map((comment) => (
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

              {/* Aba: Tarefas */}
              {activeTab === 'tarefas' && (
                <div className="space-y-4">
                  {loadingTasks ? (
                    <p className="text-sm text-muted-foreground">Carregando tarefas...</p>
                  ) : leadTasks.length === 0 ? (
                    <p className="text-sm text-muted-foreground text-center py-8">Nenhuma tarefa associada a este lead.</p>
                  ) : (
                    <div className="space-y-2">
                      {leadTasks.map((task) => {
                        const dueDate = new Date(task.due_date)
                        const isOverdue = dueDate < new Date() && task.status !== 'completed'
                        const taskTypeLabels: Record<string, string> = {
                          email: 'Email',
                          call: 'Ligação',
                          linkedin: 'LinkedIn',
                          meeting: 'Reunião',
                          follow_up: 'Follow-up',
                          research: 'Pesquisa',
                          other: 'Outro'
                        }
                        const taskStatusLabels: Record<string, string> = {
                          pending: 'Pendente',
                          in_progress: 'Em Progresso',
                          completed: 'Concluída',
                          cancelled: 'Cancelada'
                        }
                        const taskStatusColors: Record<string, string> = {
                          pending: 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-200',
                          in_progress: 'bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200',
                          completed: 'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200',
                          cancelled: 'bg-gray-100 text-gray-800 dark:bg-gray-800 dark:text-gray-200'
                        }
                        
                        return (
                          <div
                            key={task.id}
                            className={`p-4 rounded-lg border ${
                              isOverdue ? 'border-red-300 bg-red-50 dark:bg-red-950' : 'bg-gray-50 dark:bg-gray-900'
                            }`}
                          >
                            <div className="flex items-start justify-between">
                              <div className="flex-1">
                                <div className="flex items-center gap-2 mb-2 flex-wrap">
                                  <span className="font-medium">{task.title}</span>
                                  <span className={`text-xs px-2 py-1 rounded ${taskStatusColors[task.status] || taskStatusColors.pending}`}>
                                    {taskStatusLabels[task.status] || task.status}
                                  </span>
                                  <span className="text-xs text-muted-foreground">
                                    {taskTypeLabels[task.type] || task.type}
                                  </span>
                                </div>
                                {task.description && (
                                  <p className="text-sm text-muted-foreground mb-2">{task.description}</p>
                                )}
                                <div className="flex items-center gap-4 text-xs text-muted-foreground">
                                  <span className="flex items-center gap-1">
                                    <Clock className="h-3 w-3" />
                                    Vencimento: {dueDate.toLocaleString('pt-BR')}
                                  </span>
                                  {task.completed_at && (
                                    <span className="flex items-center gap-1">
                                      <CheckCircle2 className="h-3 w-3" />
                                      Concluída em: {new Date(task.completed_at).toLocaleString('pt-BR')}
                                    </span>
                                  )}
                                </div>
                              </div>
                            </div>
                          </div>
                        )
                      })}
                    </div>
                  )}
                </div>
              )}

              {/* Aba: Histórico */}
              {activeTab === 'historico' && (
                <div className="space-y-4">
                  <div className="space-y-3">
                    <div className="flex items-center gap-3 p-3 bg-gray-50 dark:bg-gray-900 rounded-lg">
                      <Calendar className="h-5 w-5 text-muted-foreground" />
                      <div className="flex-1">
                        <label className="text-sm font-medium text-muted-foreground">Criado em</label>
                        <p className="text-base">{new Date(selectedLeadDetail.created_at).toLocaleString('pt-BR')}</p>
                      </div>
                    </div>
                    <div className="flex items-center gap-3 p-3 bg-gray-50 dark:bg-gray-900 rounded-lg">
                      <Clock className="h-5 w-5 text-muted-foreground" />
                      <div className="flex-1">
                        <label className="text-sm font-medium text-muted-foreground">Última atualização</label>
                        <p className="text-base">{new Date(selectedLeadDetail.updated_at).toLocaleString('pt-BR')}</p>
                      </div>
                    </div>
                    {selectedLeadDetail.last_contact && (
                      <div className="flex items-center gap-3 p-3 bg-gray-50 dark:bg-gray-900 rounded-lg">
                        <Phone className="h-5 w-5 text-muted-foreground" />
                        <div className="flex-1">
                          <label className="text-sm font-medium text-muted-foreground">Último contato</label>
                          <p className="text-base">{new Date(selectedLeadDetail.last_contact).toLocaleString('pt-BR')}</p>
                        </div>
                      </div>
                    )}
                    {selectedLeadDetail.next_followup && (
                      <div className="flex items-center gap-3 p-3 bg-blue-50 dark:bg-blue-950 rounded-lg border border-blue-200 dark:border-blue-800">
                        <Clock className="h-5 w-5 text-blue-600 dark:text-blue-400" />
                        <div className="flex-1">
                          <label className="text-sm font-medium text-blue-700 dark:text-blue-300">Próximo follow-up</label>
                          <p className="text-base font-medium">{new Date(selectedLeadDetail.next_followup).toLocaleString('pt-BR')}</p>
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              )}
            </CardContent>

            {/* Ações */}
            <div className="border-t p-6">
              <div className="flex gap-2">
                <Button
                  variant="outline"
                  onClick={() => {
                    if (selectedLeadDetail) {
                      handleEdit(selectedLeadDetail)
                      setShowLeadDetailModal(false)
                      setLeadComments([])
                      setNewComment('')
                      setActiveTab('basicas')
                    }
                  }}
                >
                  <Edit className="mr-2 h-4 w-4" />
                  Editar Lead
                </Button>
                <Button
                  variant="outline"
                  onClick={() => {
                    if (selectedLeadDetail) {
                      setSelectedLeadId(selectedLeadDetail.id)
                      setShowSequenceModal(true)
                      setShowLeadDetailModal(false)
                      setLeadComments([])
                      setNewComment('')
                      setActiveTab('basicas')
                    }
                  }}
                >
                  <Workflow className="mr-2 h-4 w-4" />
                  Associar Cadência
                </Button>
                <Button
                  variant="outline"
                  className="flex-1"
                  onClick={() => {
                    setShowLeadDetailModal(false)
                    setSelectedLeadDetail(null)
                    setLeadTasks([])
                    setLeadComments([])
                    setNewComment('')
                    setActiveTab('basicas')
                  }}
                >
                  Fechar
                </Button>
              </div>
            </div>
          </Card>
        </div>
      )}
    </div>
  )
}
