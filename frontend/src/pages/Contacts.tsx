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
  User,
  Mail,
  Phone,
  Building,
  Briefcase,
  Linkedin
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
  }, [currentPage, pageSize, searchTerm, accountFilter])

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
      const params = new URLSearchParams({
        skip: String((currentPage - 1) * pageSize),
        limit: String(pageSize)
      })
      
      if (searchTerm) {
        params.append('search', searchTerm)
      }
      
      if (accountFilter !== 'all') {
        params.append('account_id', String(accountFilter))
      }
      
      const response = await api.get(`/api/contacts?${params.toString()}`)
      setContacts(response.data)
      setTotalContacts(response.data.length)
    } catch (error) {
      console.error('Error fetching contacts:', error)
    } finally {
      setLoading(false)
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

      <Card className="border-t-4 border-t-teal-500 bg-gradient-to-br from-teal-50/30 to-white dark:from-teal-950/10 dark:to-background">
        <CardHeader className="bg-gradient-to-r from-teal-50/50 to-transparent dark:from-teal-950/20">
          <CardTitle className="text-teal-900 dark:text-teal-100">Buscar Contatos</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <Input
                placeholder="Buscar por nome, email ou telefone..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="focus:ring-2 focus:ring-teal-500 focus:border-teal-500 transition-all duration-200"
              />
            </div>
            <div>
              <select
                value={accountFilter}
                onChange={(e) => setAccountFilter(e.target.value === 'all' ? 'all' : Number(e.target.value))}
                className="w-full px-3 py-2 border rounded-md focus:ring-2 focus:ring-teal-500 focus:border-teal-500 transition-all duration-200"
              >
                <option value="all">Todas as empresas</option>
                {accounts.map(account => (
                  <option key={account.id} value={account.id}>{account.name}</option>
                ))}
              </select>
            </div>
          </div>
        </CardContent>
      </Card>

      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
        {contacts.map((contact) => {
          const account = accounts.find(a => a.id === contact.account_id)
          return (
            <Card 
              key={contact.id}
              className="border-l-4 border-l-teal-400 hover:border-l-teal-600 transition-all duration-200 bg-gradient-to-r from-white to-teal-50/30 dark:from-background dark:to-teal-950/20 hover:shadow-lg"
            >
              <CardHeader>
                <div className="flex items-start justify-between">
                  <div className="flex-1">
                    <CardTitle className="text-teal-900 dark:text-teal-100">
                      {contact.first_name} {contact.last_name}
                    </CardTitle>
                    {account && (
                      <CardDescription className="text-teal-700/80 dark:text-teal-300/80">
                        {account.name}
                      </CardDescription>
                    )}
                  </div>
                  <div className="flex gap-2">
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() => handleEdit(contact)}
                    >
                      <Edit className="h-4 w-4" />
                    </Button>
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() => handleDelete(contact.id)}
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                </div>
              </CardHeader>
              <CardContent className="space-y-2">
                {contact.position && (
                  <div className="flex items-center gap-2 text-sm">
                    <Briefcase className="h-4 w-4 text-teal-600" />
                    <span className="text-muted-foreground">{contact.position}</span>
                    {contact.department && (
                      <span className="text-muted-foreground"> - {contact.department}</span>
                    )}
                  </div>
                )}
                {contact.email && (
                  <div className="flex items-center gap-2 text-sm">
                    <Mail className="h-4 w-4 text-teal-600" />
                    <span className="text-muted-foreground">{contact.email}</span>
                  </div>
                )}
                {contact.phone && (
                  <div className="flex items-center gap-2 text-sm">
                    <Phone className="h-4 w-4 text-teal-600" />
                    <span className="text-muted-foreground">{contact.phone}</span>
                  </div>
                )}
                {contact.mobile && (
                  <div className="flex items-center gap-2 text-sm">
                    <Phone className="h-4 w-4 text-teal-600" />
                    <span className="text-muted-foreground">Cel: {contact.mobile}</span>
                  </div>
                )}
                {contact.linkedin_url && (
                  <div className="flex items-center gap-2 text-sm">
                    <Linkedin className="h-4 w-4 text-teal-600" />
                    <a 
                      href={contact.linkedin_url} 
                      target="_blank" 
                      rel="noopener noreferrer"
                      className="text-teal-600 hover:underline"
                    >
                      LinkedIn
                    </a>
                  </div>
                )}
                {contact.owner && (
                  <div className="flex items-center gap-2 text-sm">
                    <User className="h-4 w-4 text-teal-600" />
                    <span className="text-muted-foreground">Responsável: {contact.owner.full_name}</span>
                  </div>
                )}
                {contact.owner_id && !contact.owner && (
                  <div className="flex items-center gap-2 text-sm">
                    <User className="h-4 w-4 text-teal-600" />
                    <span className="text-muted-foreground">Responsável: {users.find(u => u.id === contact.owner_id)?.full_name || `ID: ${contact.owner_id}`}</span>
                  </div>
                )}
              </CardContent>
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
        <div className="flex items-center justify-between">
          <div className="text-sm text-muted-foreground">
            Mostrando {((currentPage - 1) * pageSize) + 1} a {Math.min(currentPage * pageSize, totalContacts)} de {totalContacts}
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
              disabled={currentPage * pageSize >= totalContacts}
            >
              Próxima
            </Button>
          </div>
        </div>
      )}
    </div>
  )
}

