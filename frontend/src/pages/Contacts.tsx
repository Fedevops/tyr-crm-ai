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
  User,
  Mail,
  Phone,
  Building,
  Briefcase,
  Linkedin,
  Filter,
  FileText,
  XCircle,
  Link as LinkIcon
} from 'lucide-react'

interface Contact {
  id: number
  account_id: number | null
  first_name: string
  last_name: string
  email: string | null
  phone: string | null
  mobile: string | null
  position: string | null
  department: string | null
  linkedin_url: string | null
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

export function Contacts() {
  const { t } = useTranslation()
  const [contacts, setContacts] = useState<Contact[]>([])
  const [accounts, setAccounts] = useState<Account[]>([])
  const [loading, setLoading] = useState(true)
  const [showForm, setShowForm] = useState(false)
  const [editingId, setEditingId] = useState<number | null>(null)
  const [searchTerm, setSearchTerm] = useState('')
  const [accountFilter, setAccountFilter] = useState<number | 'all'>('all')
  const [currentPage, setCurrentPage] = useState(1)
  const [pageSize, setPageSize] = useState(20)
  const [totalContacts, setTotalContacts] = useState(0)
  
  // Selection and bulk actions
  const [selectedContacts, setSelectedContacts] = useState<Set<number>>(new Set())
  
  // Detail modal
  const [showContactDetailModal, setShowContactDetailModal] = useState(false)
  const [selectedContactDetail, setSelectedContactDetail] = useState<Contact | null>(null)
  const [activeTab, setActiveTab] = useState<'basicas' | 'empresa' | 'oportunidades'>('basicas')
  const [contactOpportunities, setContactOpportunities] = useState<any[]>([])
  const [loadingOpportunities, setLoadingOpportunities] = useState(false)
  
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
    first_name: '',
    last_name: '',
    email: '',
    phone: '',
    mobile: '',
    position: '',
    department: '',
    linkedin_url: '',
    notes: '',
    owner_id: null as number | null
  })
  const [users, setUsers] = useState<Array<{id: number, full_name: string, email: string}>>([])

  useEffect(() => {
    fetchUsers()
    fetchAccounts()
    fetchContacts()
  }, [currentPage, pageSize, searchTerm, accountFilter, advancedFilters, filterLogic])

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
      const response = await api.get('/api/accounts?limit=1000')
      setAccounts(response.data)
    } catch (error) {
      console.error('Error fetching accounts:', error)
    }
  }

  const fetchContacts = async () => {
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
          
          if (accountFilter !== 'all') {
            params.account_id = accountFilter
          }
          
          const queryString = new URLSearchParams(params).toString()
          const response = await api.get(`/api/contacts${queryString ? `?${queryString}` : ''}`)
          setContacts(response.data)
          
          const totalCount = response.headers['x-total-count']
          if (totalCount) {
            setTotalContacts(parseInt(totalCount, 10))
          } else {
            setTotalContacts(response.data.length)
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
        
        const response = await api.post('/api/contacts/filter', filtersRequest)
        setContacts(response.data)
        
        const totalCount = response.headers['x-total-count']
        if (totalCount) {
          setTotalContacts(parseInt(totalCount, 10))
        } else {
          setTotalContacts(response.data.length)
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
        
        if (accountFilter !== 'all') {
          params.account_id = accountFilter
        }
        
        const queryString = new URLSearchParams(params).toString()
        const response = await api.get(`/api/contacts${queryString ? `?${queryString}` : ''}`)
        setContacts(response.data)
        
        const totalCount = response.headers['x-total-count']
        if (totalCount) {
          setTotalContacts(parseInt(totalCount, 10))
        } else {
          if (response.data.length < pageSize) {
            setTotalContacts((currentPage - 1) * pageSize + response.data.length)
          } else {
            setTotalContacts(currentPage * pageSize + 1)
          }
        }
      }
    } catch (error) {
      console.error('Error fetching contacts:', error)
    } finally {
      setLoading(false)
    }
  }
  
  // Selection handlers
  const handleSelectAll = () => {
    if (selectedContacts.size === contacts.length) {
      setSelectedContacts(new Set())
    } else {
      setSelectedContacts(new Set(contacts.map(c => c.id)))
    }
  }
  
  const handleSelectContact = (contactId: number) => {
    const newSelected = new Set(selectedContacts)
    if (newSelected.has(contactId)) {
      newSelected.delete(contactId)
    } else {
      newSelected.add(contactId)
    }
    setSelectedContacts(newSelected)
  }
  
  // Bulk actions
  const handleBulkDelete = async () => {
    const selected = Array.from(selectedContacts)
    if (selected.length === 0) {
      alert('Selecione pelo menos um contato')
      return
    }
    
    if (!confirm(`Tem certeza que deseja excluir ${selected.length} contato(s)?`)) return
    
    try {
      await Promise.all(selected.map(id => api.delete(`/api/contacts/${id}`)))
      setSelectedContacts(new Set())
      fetchContacts()
    } catch (error: any) {
      console.error('Error bulk deleting contacts:', error)
      alert('Erro ao excluir contatos. Tente novamente.')
    }
  }
  
  const handleExportSelected = () => {
    const selected = contacts.filter(c => selectedContacts.has(c.id))
    if (selected.length === 0) {
      alert('Selecione pelo menos um contato')
      return
    }
    
    // Criar CSV
    const headers = ['Nome', 'Sobrenome', 'Email', 'Telefone', 'Celular', 'Cargo', 'Empresa']
    const rows = selected.map(c => [
      c.first_name || '',
      c.last_name || '',
      c.email || '',
      c.phone || '',
      c.mobile || '',
      c.position || '',
      accounts.find(a => a.id === c.account_id)?.name || ''
    ])
    
    const csv = [headers.join(','), ...rows.map(r => r.join(','))].join('\n')
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8-sig;' })
    const url = window.URL.createObjectURL(blob)
    const link = document.createElement('a')
    link.href = url
    link.setAttribute('download', `contatos_${new Date().toISOString().split('T')[0]}.csv`)
    document.body.appendChild(link)
    link.click()
    link.remove()
    window.URL.revokeObjectURL(url)
  }
  
  const totalPages = Math.ceil(totalContacts / pageSize)
  
  const handleOpenContactDetail = (contact: Contact) => {
    setSelectedContactDetail(contact)
    setShowContactDetailModal(true)
    setActiveTab('basicas')
  }

  useEffect(() => {
    if (showContactDetailModal && selectedContactDetail?.id) {
      fetchContactOpportunities(selectedContactDetail.id)
    }
  }, [showContactDetailModal, selectedContactDetail?.id])

  const fetchContactOpportunities = async (contactId: number) => {
    try {
      setLoadingOpportunities(true)
      const response = await api.get(`/api/opportunities?contact_id=${contactId}`)
      setContactOpportunities(response.data || [])
    } catch (error) {
      console.error('Error fetching contact opportunities:', error)
      setContactOpportunities([])
    } finally {
      setLoadingOpportunities(false)
    }
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    try {
      const payload = {
        ...formData,
        account_id: formData.account_id || null,
        owner_id: formData.owner_id || null
      }
      
      if (editingId) {
        await api.put(`/api/contacts/${editingId}`, payload)
      } else {
        await api.post('/api/contacts', payload)
      }
      resetForm()
      fetchContacts()
    } catch (error: any) {
      console.error('Error saving contact:', error)
      alert(error.response?.data?.detail || 'Erro ao salvar contato')
    }
  }

  const handleEdit = (contact: Contact) => {
    setEditingId(contact.id)
    setFormData({
      account_id: contact.account_id,
      first_name: contact.first_name || '',
      last_name: contact.last_name || '',
      email: contact.email || '',
      phone: contact.phone || '',
      mobile: contact.mobile || '',
      position: contact.position || '',
      department: contact.department || '',
      linkedin_url: contact.linkedin_url || '',
      notes: contact.notes || '',
      owner_id: contact.owner_id || null
    })
    setShowForm(true)
  }

  const handleDelete = async (id: number) => {
    if (!confirm('Tem certeza que deseja excluir este contato?')) return
    
    try {
      await api.delete(`/api/contacts/${id}`)
      fetchContacts()
    } catch (error: any) {
      console.error('Error deleting contact:', error)
      alert(error.response?.data?.detail || 'Erro ao excluir contato')
    }
  }

  const resetForm = () => {
    setFormData({
      account_id: null,
      first_name: '',
      last_name: '',
      email: '',
      phone: '',
      mobile: '',
      position: '',
      department: '',
      linkedin_url: '',
      notes: '',
      owner_id: null
    })
    setEditingId(null)
    setShowForm(false)
  }

  if (loading && contacts.length === 0) {
    return <div className="flex-1 space-y-6 p-6">Carregando...</div>
  }

  return (
    <div className="flex-1 space-y-6 p-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold">Contatos</h1>
          <p className="text-muted-foreground">Gerencie seus contatos e pessoas</p>
        </div>
        <Button 
          onClick={() => setShowForm(!showForm)}
          className="bg-gradient-to-r from-teal-600 to-teal-700 hover:from-teal-700 hover:to-teal-800 text-white shadow-md hover:shadow-lg transition-all duration-200"
        >
          <Plus className="mr-2 h-4 w-4" />
          Novo Contato
        </Button>
      </div>

      {showForm && (
        <Card className="border-t-4 border-t-teal-500 bg-gradient-to-br from-teal-50/30 to-white dark:from-teal-950/10 dark:to-background">
          <CardHeader className="bg-gradient-to-r from-teal-50/50 to-transparent dark:from-teal-950/20">
            <CardTitle className="text-teal-900 dark:text-teal-100">
              {editingId ? 'Editar' : 'Novo'} Contato
            </CardTitle>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleSubmit} className="space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium mb-1">Empresa</label>
                  <select
                    value={formData.account_id || ''}
                    onChange={(e) => setFormData({ ...formData, account_id: e.target.value ? Number(e.target.value) : null })}
                    className="w-full px-3 py-2 border rounded-md focus:ring-2 focus:ring-teal-500 focus:border-teal-500 transition-all duration-200"
                  >
                    <option value="">Nenhuma</option>
                    {accounts.map(account => (
                      <option key={account.id} value={account.id}>{account.name}</option>
                    ))}
                  </select>
                </div>
                <div className="md:col-span-2"></div>
                <div>
                  <label className="block text-sm font-medium mb-1">Nome *</label>
                  <Input
                    value={formData.first_name}
                    onChange={(e) => setFormData({ ...formData, first_name: e.target.value })}
                    required
                    className="focus:ring-2 focus:ring-teal-500 focus:border-teal-500 transition-all duration-200"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium mb-1">Sobrenome *</label>
                  <Input
                    value={formData.last_name}
                    onChange={(e) => setFormData({ ...formData, last_name: e.target.value })}
                    required
                    className="focus:ring-2 focus:ring-teal-500 focus:border-teal-500 transition-all duration-200"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium mb-1">Email</label>
                  <Input
                    type="email"
                    value={formData.email}
                    onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                    className="focus:ring-2 focus:ring-teal-500 focus:border-teal-500 transition-all duration-200"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium mb-1">Telefone</label>
                  <Input
                    value={formData.phone}
                    onChange={(e) => setFormData({ ...formData, phone: e.target.value })}
                    placeholder="(00) 0000-0000"
                    className="focus:ring-2 focus:ring-teal-500 focus:border-teal-500 transition-all duration-200"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium mb-1">Celular</label>
                  <Input
                    value={formData.mobile}
                    onChange={(e) => setFormData({ ...formData, mobile: e.target.value })}
                    placeholder="(00) 00000-0000"
                    className="focus:ring-2 focus:ring-teal-500 focus:border-teal-500 transition-all duration-200"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium mb-1">Cargo</label>
                  <Input
                    value={formData.position}
                    onChange={(e) => setFormData({ ...formData, position: e.target.value })}
                    className="focus:ring-2 focus:ring-teal-500 focus:border-teal-500 transition-all duration-200"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium mb-1">Departamento</label>
                  <Input
                    value={formData.department}
                    onChange={(e) => setFormData({ ...formData, department: e.target.value })}
                    className="focus:ring-2 focus:ring-teal-500 focus:border-teal-500 transition-all duration-200"
                  />
                </div>
                <div className="md:col-span-2">
                  <label className="block text-sm font-medium mb-1">LinkedIn</label>
                  <Input
                    type="url"
                    value={formData.linkedin_url}
                    onChange={(e) => setFormData({ ...formData, linkedin_url: e.target.value })}
                    placeholder="https://linkedin.com/in/usuario"
                    className="focus:ring-2 focus:ring-teal-500 focus:border-teal-500 transition-all duration-200"
                  />
                </div>
              </div>
              <div>
                <label className="block text-sm font-medium mb-1">Responsável</label>
                <select
                  value={formData.owner_id || ''}
                  onChange={(e) => setFormData({ ...formData, owner_id: e.target.value ? parseInt(e.target.value) : null })}
                  className="w-full px-3 py-2 border rounded-md focus:ring-2 focus:ring-teal-500 focus:border-teal-500 transition-all duration-200"
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
                <label className="block text-sm font-medium mb-1">Notas</label>
                <Textarea
                  value={formData.notes}
                  onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
                  rows={3}
                  className="focus:ring-2 focus:ring-teal-500 focus:border-teal-500 transition-all duration-200"
                />
              </div>
              <div className="flex gap-2">
                <Button 
                  type="submit"
                  className="bg-gradient-to-r from-teal-600 to-teal-700 hover:from-teal-700 hover:to-teal-800 text-white shadow-md hover:shadow-lg transition-all duration-200"
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
      <Card className="border-t-4 border-t-teal-500 bg-gradient-to-br from-teal-50/30 to-white dark:from-teal-950/10 dark:to-background">
        <CardHeader className="bg-gradient-to-r from-teal-50/50 to-transparent dark:from-teal-950/20">
          <div className="flex items-center justify-between">
            <CardTitle className="flex items-center gap-2 text-teal-900 dark:text-teal-100">
              <Filter className="h-5 w-5 text-teal-600 dark:text-teal-400" />
              Filtros
            </CardTitle>
            <div className="flex items-center gap-2">
              <input
                type="checkbox"
                checked={selectedContacts.size > 0 && selectedContacts.size === contacts.length}
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
                  placeholder="Nome, email ou telefone..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="pl-8"
                />
              </div>
            </div>
            <div className="space-y-2">
              <label className="text-sm font-medium">Empresa</label>
              <select
                value={accountFilter}
                onChange={(e) => setAccountFilter(e.target.value === 'all' ? 'all' : Number(e.target.value))}
                className="w-full px-3 py-2 border rounded-md"
              >
                <option value="all">Todas as empresas</option>
                {accounts.map(account => (
                  <option key={account.id} value={account.id}>{account.name}</option>
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
      
      {/* Bulk Actions Bar */}
      {selectedContacts.size > 0 && (
        <Card className="bg-gradient-to-r from-teal-50 to-blue-50 dark:from-teal-950 dark:to-blue-950 border-teal-300 dark:border-teal-700 shadow-md">
          <CardContent className="py-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-4">
                <span className="font-medium text-teal-900 dark:text-teal-100">
                  {selectedContacts.size} contato(s) selecionado(s)
                </span>
                <Button
                  size="sm"
                  variant="outline"
                  className="border-teal-300 hover:bg-teal-100 dark:hover:bg-teal-900"
                  onClick={() => setSelectedContacts(new Set())}
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
        {contacts.map((contact) => {
          const account = accounts.find(a => a.id === contact.account_id)
          return (
            <Card 
              key={contact.id}
              className="cursor-pointer hover:shadow-lg transition-all duration-200 border-l-4 border-l-teal-300 hover:border-l-teal-500 bg-gradient-to-r from-white to-teal-50/50 dark:from-background dark:to-teal-950/50"
              onClick={() => handleOpenContactDetail(contact)}
            >
              <CardHeader>
                <div className="flex items-start justify-between">
                  <div className="flex items-start gap-3 flex-1">
                    <input
                      type="checkbox"
                      checked={selectedContacts.has(contact.id)}
                      onChange={() => handleSelectContact(contact.id)}
                      className="mt-1 h-4 w-4"
                      onClick={(e) => e.stopPropagation()}
                    />
                    <div className="flex-1">
                      <CardTitle className="flex items-center gap-2">
                        {contact.first_name} {contact.last_name}
                      </CardTitle>
                      <CardDescription className="mt-2 space-y-1">
                        {account && (
                          <div className="flex items-center gap-2">
                            <Building className="h-4 w-4" />
                            <span>{account.name}</span>
                          </div>
                        )}
                        {contact.position && (
                          <div className="flex items-center gap-2">
                            <Briefcase className="h-4 w-4" />
                            <span>{contact.position}</span>
                            {contact.department && <span> • {contact.department}</span>}
                          </div>
                        )}
                        {contact.email && (
                          <div className="flex items-center gap-2">
                            <Mail className="h-4 w-4" />
                            <a href={`mailto:${contact.email}`} className="hover:underline">
                              {contact.email}
                            </a>
                          </div>
                        )}
                        {contact.phone && (
                          <div className="flex items-center gap-2">
                            <Phone className="h-4 w-4" />
                            <a href={`tel:${contact.phone}`} className="hover:underline">
                              {contact.phone}
                            </a>
                          </div>
                        )}
                        {contact.mobile && (
                          <div className="flex items-center gap-2">
                            <Phone className="h-4 w-4" />
                            <a href={`tel:${contact.mobile}`} className="hover:underline">
                              Cel: {contact.mobile}
                            </a>
                          </div>
                        )}
                        {contact.linkedin_url && (
                          <div className="flex items-center gap-2">
                            <LinkIcon className="h-4 w-4" />
                            <a href={contact.linkedin_url} target="_blank" rel="noopener noreferrer" className="hover:underline">
                              LinkedIn
                            </a>
                          </div>
                        )}
                        {contact.owner && (
                          <div className="flex items-center gap-2 text-sm">
                            <User className="h-4 w-4" />
                            <span>Responsável: {contact.owner.full_name}</span>
                          </div>
                        )}
                        {contact.owner_id && !contact.owner && (
                          <div className="flex items-center gap-2 text-sm">
                            <User className="h-4 w-4" />
                            <span>Responsável: {users.find(u => u.id === contact.owner_id)?.full_name || `ID: ${contact.owner_id}`}</span>
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
                        handleEdit(contact)
                      }}
                    >
                      <Edit className="h-4 w-4" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={(e) => {
                        e.stopPropagation()
                        handleDelete(contact.id)
                      }}
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                </div>
              </CardHeader>
              {contact.notes && (
                <CardContent>
                  <p className="text-sm text-muted-foreground">{contact.notes}</p>
                </CardContent>
              )}
            </Card>
          )
        })}
      </div>

      {contacts.length === 0 && !loading && (
        <Card>
          <CardContent className="py-8 text-center">
            <p className="text-muted-foreground">Nenhum contato encontrado</p>
          </CardContent>
        </Card>
      )}

      {/* Pagination */}
      {totalContacts > pageSize && (
        <Card>
          <CardContent className="py-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-4">
                <span className="text-sm text-muted-foreground">
                  Mostrando {((currentPage - 1) * pageSize) + 1} a {Math.min(currentPage * pageSize, totalContacts)} de {totalContacts}
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

      {/* Modal de Detalhes do Contato */}
      {showContactDetailModal && selectedContactDetail && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
          <Card className="w-full max-w-4xl h-[90vh] overflow-hidden flex flex-col">
            <CardHeader className="border-b flex-shrink-0">
              <div className="flex items-center justify-between">
                <CardTitle className="text-2xl">Detalhes do Contato</CardTitle>
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={() => {
                    setShowContactDetailModal(false)
                    setSelectedContactDetail(null)
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
                  Empresa
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
              </div>
            </div>

            <CardContent className="flex-1 overflow-y-auto p-6">
              {/* Aba: Informações Básicas */}
              {activeTab === 'basicas' && (
                <div className="space-y-4">
                  <div className="grid gap-4 md:grid-cols-2">
                    <div>
                      <label className="text-sm font-medium text-muted-foreground">Nome</label>
                      <p className="text-base font-medium mt-1">{selectedContactDetail.first_name} {selectedContactDetail.last_name}</p>
                    </div>
                    {selectedContactDetail.email && (
                      <div>
                        <label className="text-sm font-medium text-muted-foreground">Email</label>
                        <p className="text-base mt-1">
                          <a href={`mailto:${selectedContactDetail.email}`} className="hover:underline flex items-center gap-2">
                            <Mail className="h-4 w-4" />
                            {selectedContactDetail.email}
                          </a>
                        </p>
                      </div>
                    )}
                    {selectedContactDetail.phone && (
                      <div>
                        <label className="text-sm font-medium text-muted-foreground">Telefone</label>
                        <p className="text-base mt-1">
                          <a href={`tel:${selectedContactDetail.phone}`} className="hover:underline flex items-center gap-2">
                            <Phone className="h-4 w-4" />
                            {selectedContactDetail.phone}
                          </a>
                        </p>
                      </div>
                    )}
                    {selectedContactDetail.mobile && (
                      <div>
                        <label className="text-sm font-medium text-muted-foreground">Celular</label>
                        <p className="text-base mt-1">
                          <a href={`tel:${selectedContactDetail.mobile}`} className="hover:underline flex items-center gap-2">
                            <Phone className="h-4 w-4" />
                            {selectedContactDetail.mobile}
                          </a>
                        </p>
                      </div>
                    )}
                    {selectedContactDetail.position && (
                      <div>
                        <label className="text-sm font-medium text-muted-foreground">Cargo</label>
                        <p className="text-base mt-1 flex items-center gap-2">
                          <Briefcase className="h-4 w-4" />
                          {selectedContactDetail.position}
                        </p>
                      </div>
                    )}
                    {selectedContactDetail.department && (
                      <div>
                        <label className="text-sm font-medium text-muted-foreground">Departamento</label>
                        <p className="text-base mt-1">{selectedContactDetail.department}</p>
                      </div>
                    )}
                    {selectedContactDetail.linkedin_url && (
                      <div className="md:col-span-2">
                        <label className="text-sm font-medium text-muted-foreground">LinkedIn</label>
                        <p className="text-base mt-1">
                          <a href={selectedContactDetail.linkedin_url} target="_blank" rel="noopener noreferrer" className="hover:underline flex items-center gap-2">
                            <LinkIcon className="h-4 w-4" />
                            LinkedIn Profile
                          </a>
                        </p>
                      </div>
                    )}
                    {selectedContactDetail.owner && (
                      <div>
                        <label className="text-sm font-medium text-muted-foreground">Responsável</label>
                        <p className="text-base mt-1 flex items-center gap-2">
                          <User className="h-4 w-4" />
                          {selectedContactDetail.owner.full_name}
                        </p>
                      </div>
                    )}
                  </div>
                  {selectedContactDetail.notes && (
                    <div className="mt-4">
                      <label className="text-sm font-medium text-muted-foreground">Notas</label>
                      <p className="text-base mt-1">{selectedContactDetail.notes}</p>
                    </div>
                  )}
                </div>
              )}

              {/* Aba: Empresa */}
              {activeTab === 'empresa' && (
                <div className="space-y-4">
                  {selectedContactDetail.account_id ? (
                    <div>
                      <p className="text-sm text-muted-foreground">
                        Empresa associada: {accounts.find(a => a.id === selectedContactDetail.account_id)?.name || 'N/A'}
                      </p>
                    </div>
                  ) : (
                    <p className="text-sm text-muted-foreground">Nenhuma empresa associada.</p>
                  )}
                </div>
              )}

              {/* Aba: Oportunidades */}
              {activeTab === 'oportunidades' && (
                <div className="space-y-4">
                  {loadingOpportunities ? (
                    <div className="text-center py-4 text-muted-foreground">Carregando oportunidades...</div>
                  ) : contactOpportunities.length === 0 ? (
                    <p className="text-sm text-muted-foreground">Nenhuma oportunidade associada a este contato.</p>
                  ) : (
                    <div className="space-y-3">
                      {contactOpportunities.map((opp) => (
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
                            {opp.description && (
                              <div className="text-sm text-muted-foreground mt-2 line-clamp-2">
                                {opp.description}
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

