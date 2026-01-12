import { useState, useEffect } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { TyrLoadingSpinner } from '@/components/TyrLoadingSpinner'
import { Search, Eye, CheckCircle, XCircle, Users as UsersIcon } from 'lucide-react'
import { backofficeApi } from '@/lib/api'
import { useToast } from '@/components/ui/use-toast'
import { useTranslation } from 'react-i18next'

const formatDate = (dateString: string) => {
  const date = new Date(dateString)
  return date.toLocaleDateString('pt-BR', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
  })
}

interface TenantUser {
  id: number
  email: string
  full_name: string
  role: string
  is_active: boolean
  created_at: string
}

interface Tenant {
  tenant_id: number
  tenant_name: string
  company_name: string
  partner_id: number | null
  partner_nome: string | null
  created_at: string
  license_status: 'ativo' | 'inativo'
  total_users: number
  active_users: number
  users: TenantUser[]
  total_paid: number
}

export function BackofficeTenants() {
  const { toast } = useToast()
  const [loading, setLoading] = useState(true)
  const [tenants, setTenants] = useState<Tenant[]>([])
  const [partners, setPartners] = useState<any[]>([])
  const [selectedTenant, setSelectedTenant] = useState<Tenant | null>(null)
  const [isDialogOpen, setIsDialogOpen] = useState(false)
  const { t } = useTranslation()
  const [filters, setFilters] = useState({
    partner_id: 'all',
    search: '',
  })
  const [currentPage, setCurrentPage] = useState(0)
  const [total, setTotal] = useState(0)
  const itemsPerPage = 20

  useEffect(() => {
    loadPartners()
    loadTenants()
  }, [currentPage, filters])

  const loadPartners = async () => {
    try {
      const response = await backofficeApi.getPartners()
      setPartners(response.data)
    } catch (err) {
      console.error('Erro ao carregar parceiros:', err)
    }
  }

  const loadTenants = async () => {
    try {
      setLoading(true)
      const params: any = {
        skip: currentPage * itemsPerPage,
        limit: itemsPerPage,
      }
      
      if (filters.partner_id && filters.partner_id !== 'all') {
        params.partner_id = parseInt(filters.partner_id)
      }
      
      if (filters.search) {
        params.search = filters.search
      }

      const response = await backofficeApi.getTenants(params)
      setTenants(response.data.items)
      setTotal(response.data.total)
    } catch (err: any) {
      toast({
        title: 'Erro',
        description: err.response?.data?.detail || 'Erro ao carregar clientes',
        variant: 'destructive',
      })
    } finally {
      setLoading(false)
    }
  }

  const handleViewDetails = async (tenantId: number) => {
    try {
      const response = await backofficeApi.getTenant(tenantId)
      setSelectedTenant(response.data)
      setIsDialogOpen(true)
    } catch (err: any) {
      toast({
        title: 'Erro',
        description: err.response?.data?.detail || 'Erro ao carregar detalhes',
        variant: 'destructive',
      })
    }
  }

  const getStatusBadge = (status: string) => {
    if (status === 'ativo') {
      return (
        <span className="flex items-center gap-1 px-2 py-1 rounded-full text-xs font-medium bg-green-100 text-green-800">
          <CheckCircle className="h-3 w-3" />
          {t('backoffice-customers.active', 'Ativo')}
        </span>
      )
    }
    return (
      <span className="flex items-center gap-1 px-2 py-1 rounded-full text-xs font-medium bg-gray-100 text-gray-800">
        <XCircle className="h-3 w-3" />
        {t('backoffice-customers.inactive', 'Inativo')}
      </span>
    )
  }

  const totalPages = Math.ceil(total / itemsPerPage)

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold">{t('backoffice-customers.title', 'Gestão de Clientes')}</h1>
        <p className="text-gray-600 mt-2">{t('backoffice-customers.description', 'Visualize todos os tenants e seus usuários')}</p>
      </div>

      {/* Filtros */}
      <Card>
        <CardHeader>
          <CardTitle>{t('backoffice-customers.filters', 'Filtros')}</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div>
              <Label htmlFor="search">{t('backoffice-customers.search', 'Buscar')}</Label>
              <div className="relative">
                <Search className="absolute left-3 top-3 h-4 w-4 text-gray-400" />
                <Input
                  id="search"
                  placeholder={t('backoffice-customers.searchPlaceholder', 'Nome ou empresa...')}
                  value={filters.search}
                  onChange={(e) => setFilters({ ...filters, search: e.target.value })}
                  className="pl-10"
                />
              </div>
            </div>
            <div>
              <Label htmlFor="partner">{t('backoffice-customers.partner', 'Parceiro')}</Label>
              <Select
                value={filters.partner_id}
                onValueChange={(value) => setFilters({ ...filters, partner_id: value })}
              >
                <SelectTrigger>
                  <SelectValue placeholder={t('backoffice-customers.allPartners', 'Todos os parceiros')}/>
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">{t('backoffice-customers.allPartners', 'Todos os parceiros')}</SelectItem>
                  {partners.map((partner) => (
                    <SelectItem key={partner.id} value={partner.id.toString()}>
                      {partner.nome}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="flex items-end">
              <Button onClick={loadTenants} className="w-full">
                <Search className="h-4 w-4 mr-2" />
                {t('backoffice-customers.filter', 'Filtrar')}
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Tabela */}
      {loading ? (
        <div className="flex items-center justify-center h-64">
          <TyrLoadingSpinner />
        </div>
      ) : (
        <Card>
          <CardContent className="pt-6">
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr className="border-b">
                    <th className="text-left p-2">{t('backoffice-customers.customer', 'Cliente')}</th>
                    <th className="text-left p-2">{t('backoffice-customers.partner', 'Parceiro')}</th>
                    <th className="text-left p-2">{t('backoffice-customers.licenseStatus', 'Status Licença')}</th>
                    <th className="text-left p-2">{t('backoffice-customers.users', 'Usuários')}</th>
                    <th className="text-left p-2">{t('backoffice-customers.registrationDate', 'Data Cadastro')}</th>
                    <th className="text-right p-2">{t('backoffice-customers.actions', 'Ações')}</th>
                  </tr>
                </thead>
                <tbody>
                  {tenants.map((tenant) => (
                    <tr key={tenant.tenant_id} className="border-b hover:bg-gray-50">
                      <td className="p-2">
                        <div>
                          <div className="font-medium">{tenant.tenant_name}</div>
                          <div className="text-sm text-gray-600">{tenant.company_name}</div>
                        </div>
                      </td>
                      <td className="p-2">{tenant.partner_nome || t('backoffice-customers.directSale', 'Venda Direta')}</td>
                      <td className="p-2">{getStatusBadge(t(tenant.license_status))}</td>
                      <td className="p-2">
                        <div className="flex items-center gap-2">
                          <UsersIcon className="h-4 w-4" />
                          <span>{tenant.active_users}/{tenant.total_users}</span>
                        </div>
                      </td>
                      <td className="p-2">{formatDate(tenant.created_at)}</td>
                      <td className="p-2">
                        <div className="flex justify-end">
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => handleViewDetails(tenant.tenant_id)}
                          >
                            <Eye className="h-4 w-4 mr-2" />
                            {t('backoffice-customers.viewDetails', 'Ver Detalhes')}
                          </Button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {tenants.length === 0 && (
                <div className="text-center py-8 text-gray-500">
                  Nenhum cliente encontrado
                </div>
              )}
            </div>

            {/* Paginação */}
            {total > itemsPerPage && (
              <div className="flex justify-between items-center mt-4">
                <div className="text-sm text-gray-600">
                  Mostrando {currentPage * itemsPerPage + 1} a{' '}
                  {Math.min((currentPage + 1) * itemsPerPage, total)} de {total}
                </div>
                <div className="flex gap-2">
                  <Button
                    variant="outline"
                    onClick={() => setCurrentPage((p) => Math.max(0, p - 1))}
                    disabled={currentPage === 0}
                  >
                    Anterior
                  </Button>
                  <Button
                    variant="outline"
                    onClick={() => setCurrentPage((p) => Math.min(totalPages - 1, p + 1))}
                    disabled={currentPage >= totalPages - 1}
                  >
                    Próxima
                  </Button>
                </div>
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {/* Dialog de Detalhes */}
      <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
        <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{selectedTenant?.tenant_name}</DialogTitle>
            <DialogDescription>
              Detalhes completos do cliente e seus usuários
            </DialogDescription>
          </DialogHeader>
          {selectedTenant && (
            <div className="space-y-4 py-4">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <Label>Empresa</Label>
                  <p className="font-medium">{selectedTenant.company_name}</p>
                </div>
                <div>
                  <Label>Parceiro</Label>
                  <p className="font-medium">{selectedTenant.partner_nome || 'Venda Direta'}</p>
                </div>
                <div>
                  <Label>Status da Licença</Label>
                  <div className="mt-1">{getStatusBadge(selectedTenant.license_status)}</div>
                </div>
                <div>
                  <Label>Data de Cadastro</Label>
                  <p className="font-medium">{formatDate(selectedTenant.created_at)}</p>
                </div>
              </div>

              <div>
                <Label className="text-lg font-semibold">Usuários ({selectedTenant.total_users})</Label>
                <div className="mt-2 space-y-2">
                  {selectedTenant.users.map((user) => (
                    <div key={user.id} className="flex justify-between items-center p-3 border rounded">
                      <div>
                        <p className="font-medium">{user.full_name}</p>
                        <p className="text-sm text-gray-600">{user.email}</p>
                        <p className="text-xs text-gray-500">Role: {user.role}</p>
                      </div>
                      <div className="flex items-center gap-2">
                        {user.is_active ? (
                          <span className="px-2 py-1 rounded-full text-xs bg-green-100 text-green-800">
                            Ativo
                          </span>
                        ) : (
                          <span className="px-2 py-1 rounded-full text-xs bg-gray-100 text-gray-800">
                            Inativo
                          </span>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setIsDialogOpen(false)}>
              Fechar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}