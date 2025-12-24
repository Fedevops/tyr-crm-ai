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
  Mail,
  Phone,
  Globe,
  MapPin,
  User
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
  }, [currentPage, pageSize, searchTerm])

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
      const params = new URLSearchParams({
        skip: String((currentPage - 1) * pageSize),
        limit: String(pageSize)
      })
      
      if (searchTerm) {
        params.append('search', searchTerm)
      }
      
      const response = await api.get(`/api/accounts?${params.toString()}`)
      setAccounts(response.data)
      // Nota: backend não retorna total count ainda, usar length por enquanto
      setTotalAccounts(response.data.length)
    } catch (error) {
      console.error('Error fetching accounts:', error)
    } finally {
      setLoading(false)
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

      <Card className="border-t-4 border-t-indigo-500 bg-gradient-to-br from-indigo-50/30 to-white dark:from-indigo-950/10 dark:to-background">
        <CardHeader className="bg-gradient-to-r from-indigo-50/50 to-transparent dark:from-indigo-950/20">
          <CardTitle className="text-indigo-900 dark:text-indigo-100">Buscar Empresas</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex gap-2">
            <div className="flex-1">
              <Input
                placeholder="Buscar por nome, CNPJ ou email..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 transition-all duration-200"
              />
            </div>
          </div>
        </CardContent>
      </Card>

      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
        {accounts.map((account) => (
          <Card 
            key={account.id}
            className="border-l-4 border-l-indigo-400 hover:border-l-indigo-600 transition-all duration-200 bg-gradient-to-r from-white to-indigo-50/30 dark:from-background dark:to-indigo-950/20 hover:shadow-lg"
          >
            <CardHeader>
              <div className="flex items-start justify-between">
                <div className="flex-1">
                  <CardTitle className="text-indigo-900 dark:text-indigo-100">{account.name}</CardTitle>
                  {account.nome_fantasia && (
                    <CardDescription className="text-indigo-700/80 dark:text-indigo-300/80">
                      {account.nome_fantasia}
                    </CardDescription>
                  )}
                  {account.owner && (
                    <CardDescription className="text-xs text-muted-foreground mt-1 flex items-center gap-1">
                      <User className="h-3 w-3" />
                      Responsável: {account.owner.full_name}
                    </CardDescription>
                  )}
                  {account.owner_id && !account.owner && (
                    <CardDescription className="text-xs text-muted-foreground mt-1 flex items-center gap-1">
                      <User className="h-3 w-3" />
                      Responsável: {users.find(u => u.id === account.owner_id)?.full_name || `ID: ${account.owner_id}`}
                    </CardDescription>
                  )}
                </div>
                <div className="flex gap-2">
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() => handleEdit(account)}
                  >
                    <Edit className="h-4 w-4" />
                  </Button>
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() => handleDelete(account.id)}
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>
              </div>
            </CardHeader>
            <CardContent className="space-y-2">
              {account.cnpj && (
                <div className="flex items-center gap-2 text-sm">
                  <Building className="h-4 w-4 text-indigo-600" />
                  <span className="text-muted-foreground">CNPJ: {account.cnpj}</span>
                </div>
              )}
              {account.email && (
                <div className="flex items-center gap-2 text-sm">
                  <Mail className="h-4 w-4 text-indigo-600" />
                  <span className="text-muted-foreground">{account.email}</span>
                </div>
              )}
              {account.phone && (
                <div className="flex items-center gap-2 text-sm">
                  <Phone className="h-4 w-4 text-indigo-600" />
                  <span className="text-muted-foreground">{account.phone}</span>
                </div>
              )}
              {account.website && (
                <div className="flex items-center gap-2 text-sm">
                  <Globe className="h-4 w-4 text-indigo-600" />
                  <a 
                    href={account.website} 
                    target="_blank" 
                    rel="noopener noreferrer"
                    className="text-indigo-600 hover:underline"
                  >
                    {account.website}
                  </a>
                </div>
              )}
              {(account.city || account.state) && (
                <div className="flex items-center gap-2 text-sm">
                  <MapPin className="h-4 w-4 text-indigo-600" />
                  <span className="text-muted-foreground">
                    {account.city}{account.city && account.state ? ', ' : ''}{account.state}
                  </span>
                </div>
              )}
              {account.industry && (
                <div className="text-sm">
                  <span className="text-muted-foreground">Indústria: </span>
                  <span className="font-medium">{account.industry}</span>
                </div>
              )}
            </CardContent>
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
        <div className="flex items-center justify-between">
          <div className="text-sm text-muted-foreground">
            Mostrando {((currentPage - 1) * pageSize) + 1} a {Math.min(currentPage * pageSize, totalAccounts)} de {totalAccounts}
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
              disabled={currentPage * pageSize >= totalAccounts}
            >
              Próxima
            </Button>
          </div>
        </div>
      )}
    </div>
  )
}

