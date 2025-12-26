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
  Mail,
  Phone,
  Globe,
  MapPin,
  User,
  Filter,
  FileText,
  XCircle
} from 'lucide-react'

interface Account {
  id: number
  name: string
  website: string | null
  phone: string | null
  email: string | null
  industry: string | null
  company_size: string | null
  address: string | null
  city: string | null
  state: string | null
  zip_code: string | null
  country: string | null
  description: string | null
  cnpj: string | null
  razao_social: string | null
  nome_fantasia: string | null
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

export function Accounts() {
  const { t } = useTranslation()
  const [accounts, setAccounts] = useState<Account[]>([])
  const [loading, setLoading] = useState(true)
  const [showForm, setShowForm] = useState(false)
  const [editingId, setEditingId] = useState<number | null>(null)
  const [searchTerm, setSearchTerm] = useState('')
  const [currentPage, setCurrentPage] = useState(1)
  const [pageSize, setPageSize] = useState(20)
  const [totalAccounts, setTotalAccounts] = useState(0)
  
  // Selection and bulk actions
  const [selectedAccounts, setSelectedAccounts] = useState<Set<number>>(new Set())
  
  // Detail modal
  const [showAccountDetailModal, setShowAccountDetailModal] = useState(false)
  const [selectedAccountDetail, setSelectedAccountDetail] = useState<Account | null>(null)
  const [activeTab, setActiveTab] = useState<'basicas' | 'endereco' | 'contatos' | 'oportunidades' | 'propostas'>('basicas')
  const [accountContacts, setAccountContacts] = useState<any[]>([])
  const [accountOpportunities, setAccountOpportunities] = useState<any[]>([])
  const [accountProposals, setAccountProposals] = useState<any[]>([])
  const [loadingContacts, setLoadingContacts] = useState(false)
  const [loadingOpportunities, setLoadingOpportunities] = useState(false)
  const [loadingProposals, setLoadingProposals] = useState(false)
  
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
    name: '',
    website: '',
    phone: '',
    email: '',
    industry: '',
    company_size: '',
    address: '',
    city: '',
    state: '',
    zip_code: '',
    country: '',
    description: '',
    cnpj: '',
    razao_social: '',
    nome_fantasia: '',
    owner_id: null as number | null
  })
  const [users, setUsers] = useState<Array<{id: number, full_name: string, email: string}>>([])

  useEffect(() => {
    fetchUsers()
    fetchAccounts()
  }, [currentPage, pageSize, searchTerm, advancedFilters, filterLogic])

  const fetchUsers = async () => {
    try {
      const response = await api.get('/api/users')
      setUsers(response.data)
    } catch (error) {
      console.error('Error fetching users:', error)
    }
  }

  const fetchAccounts = async () => {
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
          
          const queryString = new URLSearchParams(params).toString()
          const response = await api.get(`/api/accounts${queryString ? `?${queryString}` : ''}`)
          setAccounts(response.data)
          
          const totalCount = response.headers['x-total-count']
          if (totalCount) {
            setTotalAccounts(parseInt(totalCount, 10))
          } else {
            setTotalAccounts(response.data.length)
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
        
        const response = await api.post('/api/accounts/filter', filtersRequest)
        setAccounts(response.data)
        
        const totalCount = response.headers['x-total-count']
        if (totalCount) {
          setTotalAccounts(parseInt(totalCount, 10))
        } else {
          setTotalAccounts(response.data.length)
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
        
        const queryString = new URLSearchParams(params).toString()
        const response = await api.get(`/api/accounts${queryString ? `?${queryString}` : ''}`)
        setAccounts(response.data)
        
        const totalCount = response.headers['x-total-count']
        if (totalCount) {
          setTotalAccounts(parseInt(totalCount, 10))
        } else {
          if (response.data.length < pageSize) {
            setTotalAccounts((currentPage - 1) * pageSize + response.data.length)
          } else {
            setTotalAccounts(currentPage * pageSize + 1)
          }
        }
      }
    } catch (error) {
      console.error('Error fetching accounts:', error)
    } finally {
      setLoading(false)
    }
  }
  
  // Selection handlers
  const handleSelectAll = () => {
    if (selectedAccounts.size === accounts.length) {
      setSelectedAccounts(new Set())
    } else {
      setSelectedAccounts(new Set(accounts.map(a => a.id)))
    }
  }
  
  const handleSelectAccount = (accountId: number) => {
    const newSelected = new Set(selectedAccounts)
    if (newSelected.has(accountId)) {
      newSelected.delete(accountId)
    } else {
      newSelected.add(accountId)
    }
    setSelectedAccounts(newSelected)
  }
  
  // Bulk actions
  const handleBulkDelete = async () => {
    const selected = Array.from(selectedAccounts)
    if (selected.length === 0) {
      alert('Selecione pelo menos uma empresa')
      return
    }
    
    if (!confirm(`Tem certeza que deseja excluir ${selected.length} empresa(s)?`)) return
    
    try {
      await Promise.all(selected.map(id => api.delete(`/api/accounts/${id}`)))
      setSelectedAccounts(new Set())
      fetchAccounts()
    } catch (error: any) {
      console.error('Error bulk deleting accounts:', error)
      alert('Erro ao excluir empresas. Tente novamente.')
    }
  }
  
  const handleExportSelected = () => {
    const selected = accounts.filter(a => selectedAccounts.has(a.id))
    if (selected.length === 0) {
      alert('Selecione pelo menos uma empresa')
      return
    }
    
    // Criar CSV
    const headers = ['Nome', 'CNPJ', 'Email', 'Telefone', 'Cidade', 'Estado', 'Indústria']
    const rows = selected.map(a => [
      a.name || '',
      a.cnpj || '',
      a.email || '',
      a.phone || '',
      a.city || '',
      a.state || '',
      a.industry || ''
    ])
    
    const csv = [headers.join(','), ...rows.map(r => r.join(','))].join('\n')
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8-sig;' })
    const url = window.URL.createObjectURL(blob)
    const link = document.createElement('a')
    link.href = url
    link.setAttribute('download', `empresas_${new Date().toISOString().split('T')[0]}.csv`)
    document.body.appendChild(link)
    link.click()
    link.remove()
    window.URL.revokeObjectURL(url)
  }
  
  const totalPages = Math.ceil(totalAccounts / pageSize)
  
  const handleOpenAccountDetail = (account: Account) => {
    setSelectedAccountDetail(account)
    setShowAccountDetailModal(true)
    setActiveTab('basicas')
  }

  useEffect(() => {
    if (showAccountDetailModal && selectedAccountDetail?.id) {
      fetchAccountContacts(selectedAccountDetail.id)
      fetchAccountOpportunities(selectedAccountDetail.id)
      fetchAccountProposals(selectedAccountDetail.id)
    }
  }, [showAccountDetailModal, selectedAccountDetail?.id])

  const fetchAccountContacts = async (accountId: number) => {
    try {
      setLoadingContacts(true)
      const response = await api.get(`/api/contacts?account_id=${accountId}`)
      setAccountContacts(response.data || [])
    } catch (error) {
      console.error('Error fetching account contacts:', error)
      setAccountContacts([])
    } finally {
      setLoadingContacts(false)
    }
  }

  const fetchAccountOpportunities = async (accountId: number) => {
    try {
      setLoadingOpportunities(true)
      const response = await api.get(`/api/opportunities?account_id=${accountId}`)
      setAccountOpportunities(response.data || [])
    } catch (error) {
      console.error('Error fetching account opportunities:', error)
      setAccountOpportunities([])
    } finally {
      setLoadingOpportunities(false)
    }
  }

  const fetchAccountProposals = async (accountId: number) => {
    try {
      setLoadingProposals(true)
      // Buscar oportunidades da conta primeiro
      const oppsResponse = await api.get(`/api/opportunities?account_id=${accountId}`)
      const opportunities = oppsResponse.data || []
      
      // Buscar propostas de todas as oportunidades
      const allProposals: any[] = []
      for (const opp of opportunities) {
        try {
          const proposalsResponse = await api.get(`/api/proposals?opportunity_id=${opp.id}`)
          allProposals.push(...(proposalsResponse.data || []))
        } catch (error) {
          console.error(`Error fetching proposals for opportunity ${opp.id}:`, error)
        }
      }
      setAccountProposals(allProposals)
    } catch (error) {
      console.error('Error fetching account proposals:', error)
      setAccountProposals([])
    } finally {
      setLoadingProposals(false)
    }
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    try {
      if (editingId) {
        await api.put(`/api/accounts/${editingId}`, formData)
      } else {
        await api.post('/api/accounts', formData)
      }
      resetForm()
      fetchAccounts()
    } catch (error: any) {
      console.error('Error saving account:', error)
      alert(error.response?.data?.detail || 'Erro ao salvar empresa')
    }
  }

  const handleEdit = (account: Account) => {
    setEditingId(account.id)
    setFormData({
      name: account.name || '',
      website: account.website || '',
      phone: account.phone || '',
      email: account.email || '',
      industry: account.industry || '',
      company_size: account.company_size || '',
      address: account.address || '',
      city: account.city || '',
      state: account.state || '',
      zip_code: account.zip_code || '',
      country: account.country || '',
      description: account.description || '',
      cnpj: account.cnpj || '',
      razao_social: account.razao_social || '',
      nome_fantasia: account.nome_fantasia || '',
      owner_id: account.owner_id || null
    })
    setShowForm(true)
  }

  const handleDelete = async (id: number) => {
    if (!confirm('Tem certeza que deseja excluir esta empresa?')) return
    
    try {
      await api.delete(`/api/accounts/${id}`)
      fetchAccounts()
    } catch (error: any) {
      console.error('Error deleting account:', error)
      alert(error.response?.data?.detail || 'Erro ao excluir empresa')
    }
  }

  const resetForm = () => {
    setFormData({
      name: '',
      website: '',
      phone: '',
      email: '',
      industry: '',
      company_size: '',
      address: '',
      city: '',
      state: '',
      zip_code: '',
      country: '',
      description: '',
      cnpj: '',
      razao_social: '',
      nome_fantasia: '',
      owner_id: null
    })
    setEditingId(null)
    setShowForm(false)
  }

  if (loading && accounts.length === 0) {
    return <div className="flex-1 space-y-6 p-6">Carregando...</div>
  }

  return (
    <div className="flex-1 space-y-6 p-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold">Empresas</h1>
          <p className="text-muted-foreground">Gerencie suas empresas e organizações</p>
        </div>
        <Button 
          onClick={() => setShowForm(!showForm)}
          className="bg-gradient-to-r from-indigo-600 to-indigo-700 hover:from-indigo-700 hover:to-indigo-800 text-white shadow-md hover:shadow-lg transition-all duration-200"
        >
          <Plus className="mr-2 h-4 w-4" />
          Nova Empresa
        </Button>
      </div>

      {showForm && (
        <Card className="border-t-4 border-t-indigo-500 bg-gradient-to-br from-indigo-50/30 to-white dark:from-indigo-950/10 dark:to-background">
          <CardHeader className="bg-gradient-to-r from-indigo-50/50 to-transparent dark:from-indigo-950/20">
            <CardTitle className="text-indigo-900 dark:text-indigo-100">
              {editingId ? 'Editar' : 'Nova'} Empresa
            </CardTitle>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleSubmit} className="space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium mb-1">Nome da Empresa *</label>
                  <Input
                    value={formData.name}
                    onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                    required
                    className="focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 transition-all duration-200"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium mb-1">CNPJ</label>
                  <Input
                    value={formData.cnpj}
                    onChange={(e) => setFormData({ ...formData, cnpj: e.target.value })}
                    placeholder="00.000.000/0000-00"
                    className="focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 transition-all duration-200"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium mb-1">Razão Social</label>
                  <Input
                    value={formData.razao_social}
                    onChange={(e) => setFormData({ ...formData, razao_social: e.target.value })}
                    className="focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 transition-all duration-200"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium mb-1">Nome Fantasia</label>
                  <Input
                    value={formData.nome_fantasia}
                    onChange={(e) => setFormData({ ...formData, nome_fantasia: e.target.value })}
                    className="focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 transition-all duration-200"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium mb-1">Website</label>
                  <Input
                    type="url"
                    value={formData.website}
                    onChange={(e) => setFormData({ ...formData, website: e.target.value })}
                    placeholder="https://exemplo.com"
                    className="focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 transition-all duration-200"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium mb-1">Email</label>
                  <Input
                    type="email"
                    value={formData.email}
                    onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                    className="focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 transition-all duration-200"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium mb-1">Telefone</label>
                  <Input
                    value={formData.phone}
                    onChange={(e) => setFormData({ ...formData, phone: e.target.value })}
                    placeholder="(00) 0000-0000"
                    className="focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 transition-all duration-200"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium mb-1">Indústria</label>
                  <Input
                    value={formData.industry}
                    onChange={(e) => setFormData({ ...formData, industry: e.target.value })}
                    className="focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 transition-all duration-200"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium mb-1">Tamanho da Empresa</label>
                  <Input
                    value={formData.company_size}
                    onChange={(e) => setFormData({ ...formData, company_size: e.target.value })}
                    placeholder="Ex: 50-200 funcionários"
                    className="focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 transition-all duration-200"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium mb-1">Endereço</label>
                  <Input
                    value={formData.address}
                    onChange={(e) => setFormData({ ...formData, address: e.target.value })}
                    className="focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 transition-all duration-200"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium mb-1">Cidade</label>
                  <Input
                    value={formData.city}
                    onChange={(e) => setFormData({ ...formData, city: e.target.value })}
                    className="focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 transition-all duration-200"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium mb-1">Estado</label>
                  <Input
                    value={formData.state}
                    onChange={(e) => setFormData({ ...formData, state: e.target.value })}
                    placeholder="SP"
                    maxLength={2}
                    className="focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 transition-all duration-200"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium mb-1">CEP</label>
                  <Input
                    value={formData.zip_code}
                    onChange={(e) => setFormData({ ...formData, zip_code: e.target.value })}
                    placeholder="00000-000"
                    className="focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 transition-all duration-200"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium mb-1">País</label>
                  <Input
                    value={formData.country}
                    onChange={(e) => setFormData({ ...formData, country: e.target.value })}
                    placeholder="Brasil"
                    className="focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 transition-all duration-200"
                  />
                </div>
              </div>
              <div>
                <label className="block text-sm font-medium mb-1">Responsável</label>
                <select
                  value={formData.owner_id || ''}
                  onChange={(e) => setFormData({ ...formData, owner_id: e.target.value ? parseInt(e.target.value) : null })}
                  className="w-full px-3 py-2 border rounded-md focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 transition-all duration-200"
                >
                  <option value="">Sem responsável</option>
                  {users.map((user) => (
                    <option key={user.id} value={user.id}>
                      {user.full_name} ({user.email})
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium mb-1">Descrição</label>
                <Textarea
                  value={formData.description}
                  onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                  rows={3}
                  className="focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 transition-all duration-200"
                />
              </div>
              <div className="flex gap-2">
                <Button 
                  type="submit"
                  className="bg-gradient-to-r from-indigo-600 to-indigo-700 hover:from-indigo-700 hover:to-indigo-800 text-white shadow-md hover:shadow-lg transition-all duration-200"
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
                checked={selectedAccounts.size > 0 && selectedAccounts.size === accounts.length}
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
                  placeholder="Nome, CNPJ ou email..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="pl-8"
                />
              </div>
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
      {selectedAccounts.size > 0 && (
        <Card className="bg-gradient-to-r from-indigo-50 to-blue-50 dark:from-indigo-950 dark:to-blue-950 border-indigo-300 dark:border-indigo-700 shadow-md">
          <CardContent className="py-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-4">
                <span className="font-medium text-indigo-900 dark:text-indigo-100">
                  {selectedAccounts.size} empresa(s) selecionada(s)
                </span>
                <Button
                  size="sm"
                  variant="outline"
                  className="border-indigo-300 hover:bg-indigo-100 dark:hover:bg-indigo-900"
                  onClick={() => setSelectedAccounts(new Set())}
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
        {accounts.map((account) => (
          <Card 
            key={account.id}
            className="cursor-pointer hover:shadow-lg transition-all duration-200 border-l-4 border-l-indigo-300 hover:border-l-indigo-500 bg-gradient-to-r from-white to-indigo-50/50 dark:from-background dark:to-indigo-950/50"
            onClick={() => handleOpenAccountDetail(account)}
          >
            <CardHeader>
              <div className="flex items-start justify-between">
                <div className="flex items-start gap-3 flex-1">
                  <input
                    type="checkbox"
                    checked={selectedAccounts.has(account.id)}
                    onChange={() => handleSelectAccount(account.id)}
                    className="mt-1 h-4 w-4"
                    onClick={(e) => e.stopPropagation()}
                  />
                  <div className="flex-1">
                    <CardTitle className="flex items-center gap-2">
                      {account.name}
                    </CardTitle>
                    <div className="mt-2 space-y-1 text-sm text-muted-foreground">
                      {account.nome_fantasia && (
                        <div className="flex items-center gap-2">
                          <Building className="h-4 w-4" />
                          <span>{account.nome_fantasia}</span>
                        </div>
                      )}
                      {account.cnpj && (
                        <div className="flex items-center gap-2">
                          <Building className="h-4 w-4" />
                          <span>CNPJ: {account.cnpj}</span>
                        </div>
                      )}
                      {account.email && (
                        <div className="flex items-center gap-2">
                          <Mail className="h-4 w-4" />
                          <a href={`mailto:${account.email}`} className="hover:underline">
                            {account.email}
                          </a>
                        </div>
                      )}
                      {account.phone && (
                        <div className="flex items-center gap-2">
                          <Phone className="h-4 w-4" />
                          <a href={`tel:${account.phone}`} className="hover:underline">
                            {account.phone}
                          </a>
                        </div>
                      )}
                      {account.website && (
                        <div className="flex items-center gap-2">
                          <Globe className="h-4 w-4" />
                          <a href={account.website} target="_blank" rel="noopener noreferrer" className="hover:underline">
                            Site: {account.website}
                          </a>
                        </div>
                      )}
                      {(account.city || account.state) && (
                        <div className="flex items-center gap-2 text-sm">
                          <MapPin className="h-4 w-4" />
                          <span>
                            {account.city}{account.city && account.state ? ', ' : ''}{account.state}
                          </span>
                        </div>
                      )}
                      {account.industry && (
                        <div className="text-sm">
                          <span>Indústria: {account.industry}</span>
                        </div>
                      )}
                      {account.owner && (
                        <div className="flex items-center gap-2 text-sm">
                          <User className="h-4 w-4" />
                          <span>Responsável: {account.owner.full_name}</span>
                        </div>
                      )}
                      {account.owner_id && !account.owner && (
                        <div className="flex items-center gap-2 text-sm">
                          <User className="h-4 w-4" />
                          <span>Responsável: {users.find(u => u.id === account.owner_id)?.full_name || `ID: ${account.owner_id}`}</span>
                        </div>
                      )}
                    </div>
                  </div>
                </div>
                <div className="flex gap-2">
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={(e) => {
                      e.stopPropagation()
                      handleEdit(account)
                    }}
                  >
                    <Edit className="h-4 w-4" />
                  </Button>
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={(e) => {
                      e.stopPropagation()
                      handleDelete(account.id)
                    }}
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>
              </div>
            </CardHeader>
            {account.description && (
              <CardContent>
                <p className="text-sm text-muted-foreground">{account.description}</p>
              </CardContent>
            )}
          </Card>
        ))}
      </div>

      {accounts.length === 0 && !loading && (
        <Card>
          <CardContent className="py-8 text-center">
            <p className="text-muted-foreground">Nenhuma empresa encontrada</p>
          </CardContent>
        </Card>
      )}

      {/* Pagination */}
      {totalAccounts > pageSize && (
        <Card>
          <CardContent className="py-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-4">
                <span className="text-sm text-muted-foreground">
                  Mostrando {((currentPage - 1) * pageSize) + 1} a {Math.min(currentPage * pageSize, totalAccounts)} de {totalAccounts}
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

      {/* Modal de Detalhes da Empresa */}
      {showAccountDetailModal && selectedAccountDetail && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
          <Card className="w-full max-w-4xl h-[90vh] overflow-hidden flex flex-col">
            <CardHeader className="border-b flex-shrink-0">
              <div className="flex items-center justify-between">
                <CardTitle className="text-2xl">Detalhes da Empresa</CardTitle>
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={() => {
                    setShowAccountDetailModal(false)
                    setSelectedAccountDetail(null)
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
                  onClick={() => setActiveTab('contatos')}
                  className={`px-4 py-3 text-sm font-medium border-b-2 transition-colors whitespace-nowrap ${
                    activeTab === 'contatos'
                      ? 'border-primary text-primary'
                      : 'border-transparent text-muted-foreground hover:text-foreground'
                  }`}
                >
                  Contatos
                </button>
                <button
                  onClick={() => setActiveTab('oportunidades')}
                  className={`px-4 py-3 text-sm font-medium border-b-2 transition-colors whitespace-nowrap ${
                    activeTab === 'oportunidades'
                      ? 'border-primary text-primary'
                      : 'border-transparent text-muted-foreground hover:text-foreground'
                  }`}
                >
                  Oportunidades
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
              </div>
            </div>

            <CardContent className="flex-1 overflow-y-auto p-6">
              {/* Aba: Informações Básicas */}
              {activeTab === 'basicas' && (
                <div className="space-y-4">
                  <div className="grid gap-4 md:grid-cols-2">
                    <div>
                      <label className="text-sm font-medium text-muted-foreground">Nome da Empresa</label>
                      <p className="text-base font-medium mt-1">{selectedAccountDetail.name}</p>
                    </div>
                    {selectedAccountDetail.nome_fantasia && (
                      <div>
                        <label className="text-sm font-medium text-muted-foreground">Nome Fantasia</label>
                        <p className="text-base mt-1">{selectedAccountDetail.nome_fantasia}</p>
                      </div>
                    )}
                    {selectedAccountDetail.razao_social && (
                      <div>
                        <label className="text-sm font-medium text-muted-foreground">Razão Social</label>
                        <p className="text-base mt-1">{selectedAccountDetail.razao_social}</p>
                      </div>
                    )}
                    {selectedAccountDetail.cnpj && (
                      <div>
                        <label className="text-sm font-medium text-muted-foreground">CNPJ</label>
                        <p className="text-base mt-1">{selectedAccountDetail.cnpj}</p>
                      </div>
                    )}
                    {selectedAccountDetail.email && (
                      <div>
                        <label className="text-sm font-medium text-muted-foreground">Email</label>
                        <p className="text-base mt-1">
                          <a href={`mailto:${selectedAccountDetail.email}`} className="hover:underline flex items-center gap-2">
                            <Mail className="h-4 w-4" />
                            {selectedAccountDetail.email}
                          </a>
                        </p>
                      </div>
                    )}
                    {selectedAccountDetail.phone && (
                      <div>
                        <label className="text-sm font-medium text-muted-foreground">Telefone</label>
                        <p className="text-base mt-1">
                          <a href={`tel:${selectedAccountDetail.phone}`} className="hover:underline flex items-center gap-2">
                            <Phone className="h-4 w-4" />
                            {selectedAccountDetail.phone}
                          </a>
                        </p>
                      </div>
                    )}
                    {selectedAccountDetail.website && (
                      <div className="md:col-span-2">
                        <label className="text-sm font-medium text-muted-foreground">Website</label>
                        <p className="text-base mt-1">
                          <a href={selectedAccountDetail.website} target="_blank" rel="noopener noreferrer" className="hover:underline flex items-center gap-2">
                            <Globe className="h-4 w-4" />
                            {selectedAccountDetail.website}
                          </a>
                        </p>
                      </div>
                    )}
                    {selectedAccountDetail.industry && (
                      <div>
                        <label className="text-sm font-medium text-muted-foreground">Indústria</label>
                        <p className="text-base mt-1">{selectedAccountDetail.industry}</p>
                      </div>
                    )}
                    {selectedAccountDetail.company_size && (
                      <div>
                        <label className="text-sm font-medium text-muted-foreground">Tamanho da Empresa</label>
                        <p className="text-base mt-1">{selectedAccountDetail.company_size}</p>
                      </div>
                    )}
                    {selectedAccountDetail.owner && (
                      <div>
                        <label className="text-sm font-medium text-muted-foreground">Responsável</label>
                        <p className="text-base mt-1 flex items-center gap-2">
                          <User className="h-4 w-4" />
                          {selectedAccountDetail.owner.full_name}
                        </p>
                      </div>
                    )}
                    {selectedAccountDetail.owner_id && !selectedAccountDetail.owner && (
                      <div>
                        <label className="text-sm font-medium text-muted-foreground">Responsável</label>
                        <p className="text-base mt-1 flex items-center gap-2">
                          <User className="h-4 w-4" />
                          {users.find(u => u.id === selectedAccountDetail.owner_id)?.full_name || `ID: ${selectedAccountDetail.owner_id}`}
                        </p>
                      </div>
                    )}
                  </div>
                  {selectedAccountDetail.description && (
                    <div className="mt-4">
                      <label className="text-sm font-medium text-muted-foreground">Descrição</label>
                      <p className="text-base mt-1">{selectedAccountDetail.description}</p>
                    </div>
                  )}
                </div>
              )}

              {/* Aba: Endereço */}
              {activeTab === 'endereco' && (
                <div className="space-y-4">
                  {selectedAccountDetail.address ? (
                    <div>
                      <label className="text-sm font-medium text-muted-foreground">Endereço Completo</label>
                      <p className="text-base mt-1">{selectedAccountDetail.address}</p>
                    </div>
                  ) : (
                    <p className="text-sm text-muted-foreground">Nenhum endereço cadastrado.</p>
                  )}
                  <div className="grid gap-4 md:grid-cols-2">
                    {selectedAccountDetail.city && (
                      <div>
                        <label className="text-sm font-medium text-muted-foreground">Cidade</label>
                        <p className="text-base mt-1">{selectedAccountDetail.city}</p>
                      </div>
                    )}
                    {selectedAccountDetail.state && (
                      <div>
                        <label className="text-sm font-medium text-muted-foreground">Estado</label>
                        <p className="text-base mt-1">{selectedAccountDetail.state}</p>
                      </div>
                    )}
                    {selectedAccountDetail.zip_code && (
                      <div>
                        <label className="text-sm font-medium text-muted-foreground">CEP</label>
                        <p className="text-base mt-1">{selectedAccountDetail.zip_code}</p>
                      </div>
                    )}
                    {selectedAccountDetail.country && (
                      <div>
                        <label className="text-sm font-medium text-muted-foreground">País</label>
                        <p className="text-base mt-1">{selectedAccountDetail.country}</p>
                      </div>
                    )}
                  </div>
                  {!selectedAccountDetail.address && !selectedAccountDetail.city && !selectedAccountDetail.state && !selectedAccountDetail.zip_code && !selectedAccountDetail.country && (
                    <p className="text-sm text-muted-foreground text-center py-8">
                      Nenhuma informação de endereço disponível.
                    </p>
                  )}
                </div>
              )}

              {/* Aba: Contatos */}
              {activeTab === 'contatos' && (
                <div className="space-y-4">
                  {loadingContacts ? (
                    <div className="text-center py-4 text-muted-foreground">Carregando contatos...</div>
                  ) : accountContacts.length === 0 ? (
                    <p className="text-sm text-muted-foreground">Nenhum contato associado a esta empresa.</p>
                  ) : (
                    <div className="space-y-3">
                      {accountContacts.map((contact) => (
                        <Card key={contact.id} className="border-l-4 border-l-blue-400">
                          <CardHeader className="pb-3">
                            <CardTitle className="text-base flex items-center gap-2">
                              <User className="h-4 w-4" />
                              {contact.first_name} {contact.last_name}
                            </CardTitle>
                            <CardDescription>
                              {contact.position && <span>{contact.position}</span>}
                            </CardDescription>
                          </CardHeader>
                          <CardContent className="space-y-2">
                            {contact.email && (
                              <div className="text-sm">
                                <a href={`mailto:${contact.email}`} className="hover:underline flex items-center gap-2">
                                  <Mail className="h-4 w-4" />
                                  {contact.email}
                                </a>
                              </div>
                            )}
                            {contact.phone && (
                              <div className="text-sm">
                                <a href={`tel:${contact.phone}`} className="hover:underline flex items-center gap-2">
                                  <Phone className="h-4 w-4" />
                                  {contact.phone}
                                </a>
                              </div>
                            )}
                          </CardContent>
                        </Card>
                      ))}
                    </div>
                  )}
                </div>
              )}

              {/* Aba: Oportunidades */}
              {activeTab === 'oportunidades' && (
                <div className="space-y-4">
                  {loadingOpportunities ? (
                    <div className="text-center py-4 text-muted-foreground">Carregando oportunidades...</div>
                  ) : accountOpportunities.length === 0 ? (
                    <p className="text-sm text-muted-foreground">Nenhuma oportunidade associada a esta empresa.</p>
                  ) : (
                    <div className="space-y-3">
                      {accountOpportunities.map((opp) => (
                        <Card key={opp.id} className="border-l-4 border-l-green-400">
                          <CardHeader className="pb-3">
                            <CardTitle className="text-base">{opp.name}</CardTitle>
                            <CardDescription>
                              {opp.amount && (
                                <span className="font-semibold">
                                  {new Intl.NumberFormat('pt-BR', { style: 'currency', currency: opp.currency || 'BRL' }).format(opp.amount)}
                                </span>
                              )}
                            </CardDescription>
                          </CardHeader>
                          <CardContent className="space-y-2">
                            <div className="flex items-center gap-2">
                              <span className={`text-xs px-2 py-1 rounded ${
                                opp.status === 'won' ? 'bg-green-100 text-green-700 dark:bg-green-900 dark:text-green-200' :
                                opp.status === 'lost' ? 'bg-red-100 text-red-700 dark:bg-red-900 dark:text-red-200' :
                                opp.status === 'on_hold' ? 'bg-yellow-100 text-yellow-700 dark:bg-yellow-900 dark:text-yellow-200' :
                                'bg-blue-100 text-blue-700 dark:bg-blue-900 dark:text-blue-200'
                              }`}>
                                {opp.status === 'open' ? 'Aberta' :
                                 opp.status === 'won' ? 'Ganha' :
                                 opp.status === 'lost' ? 'Perdida' :
                                 opp.status === 'on_hold' ? 'Em Espera' : opp.status}
                              </span>
                              {opp.probability !== null && (
                                <span className="text-xs text-muted-foreground">
                                  {opp.probability}% de probabilidade
                                </span>
                              )}
                            </div>
                            {opp.expected_close_date && (
                              <div className="text-xs text-muted-foreground">
                                Fechamento previsto: {new Date(opp.expected_close_date).toLocaleDateString('pt-BR')}
                              </div>
                            )}
                          </CardContent>
                        </Card>
                      ))}
                    </div>
                  )}
                </div>
              )}

              {/* Aba: Propostas */}
              {activeTab === 'propostas' && (
                <div className="space-y-4">
                  {loadingProposals ? (
                    <div className="text-center py-4 text-muted-foreground">Carregando propostas...</div>
                  ) : accountProposals.length === 0 ? (
                    <p className="text-sm text-muted-foreground">Nenhuma proposta associada a esta empresa.</p>
                  ) : (
                    <div className="space-y-3">
                      {accountProposals.map((proposal) => (
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
                          </CardContent>
                        </Card>
                      ))}
                    </div>
                  )}
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      )}
    </div>
  )
}

