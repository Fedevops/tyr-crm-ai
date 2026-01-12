import { useState, useEffect } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { TyrLoadingSpinner } from '@/components/TyrLoadingSpinner'
import { Plus, Edit, CheckCircle, XCircle, Trash2, Search, Users, Copy } from 'lucide-react'
import { backofficeApi } from '@/lib/api'
import { useToast } from '@/components/ui/use-toast'
import { useTranslation } from 'react-i18next'

const formatCurrency = (value: number) => {
  return new Intl.NumberFormat('pt-BR', {
    style: 'currency',
    currency: 'BRL'
  }).format(value)
}

interface Partner {
  id: number
  nome: string
  cnpj: string | null
  nivel: 'bronze' | 'silver' | 'gold'
  porcentagem_comissao: number
  status: 'ativo' | 'pendente' | 'inativo'
  email: string | null
  telefone: string | null
  total_comissoes: number
  comissoes_pagas: number
  comissoes_pendentes: number
  total_clientes: number
}

export function BackofficePartners() {
    const { toast } = useToast()
    const [loading, setLoading] = useState(true)
    const [partners, setPartners] = useState<Partner[]>([])
    const [searchTerm, setSearchTerm] = useState('')
    const [statusFilter, setStatusFilter] = useState<string>('all')
    const [nivelFilter, setNivelFilter] = useState<string>('all')
    const [isDialogOpen, setIsDialogOpen] = useState(false)
    const [editingPartner, setEditingPartner] = useState<Partner | null>(null)
    const [formData, setFormData] = useState({
    nome: '',
    cnpj: '',
    nivel: 'bronze' as 'bronze' | 'silver' | 'gold',
    porcentagem_comissao: 0,
    status: 'pendente' as 'ativo' | 'pendente' | 'inativo',
    email: '',
    telefone: '',
    endereco: '',
    cidade: '',
    estado: '',
    cep: '',
    })
    const [isCreateUserDialogOpen, setIsCreateUserDialogOpen] = useState(false)
    const [selectedPartnerId, setSelectedPartnerId] = useState<number | null>(null)
    const [generatedPassword, setGeneratedPassword] = useState<string | null>(null)
    const [newUserData, setNewUserData] = useState({
    email: '',
    full_name: '',
    is_owner: false,
    })
    const { t } = useTranslation()

  useEffect(() => {
    loadPartners()
  }, [statusFilter, nivelFilter])

  const loadPartners = async () => {
    try {
      setLoading(true)
      const params: any = {}
      if (statusFilter !== 'all') params.status = statusFilter
      if (nivelFilter !== 'all') params.nivel = nivelFilter
      
      const response = await backofficeApi.getPartners(params)
      setPartners(response.data)
    } catch (err: any) {
      toast({
        title: 'Erro',
        description: err.response?.data?.detail || 'Erro ao carregar parceiros',
        variant: 'destructive',
      })
    } finally {
      setLoading(false)
    }
  }

  const handleCreate = () => {
    setEditingPartner(null)
    setFormData({
      nome: '',
      cnpj: '',
      nivel: 'bronze',
      porcentagem_comissao: 0,
      status: 'pendente',
      email: '',
      telefone: '',
      endereco: '',
      cidade: '',
      estado: '',
      cep: '',
    })
    setIsDialogOpen(true)
  }

  const handleEdit = (partner: Partner) => {
    setEditingPartner(partner)
    setFormData({
      nome: partner.nome,
      cnpj: partner.cnpj || '',
      nivel: partner.nivel,
      porcentagem_comissao: partner.porcentagem_comissao,
      status: partner.status,
      email: partner.email || '',
      telefone: partner.telefone || '',
      endereco: '',
      cidade: '',
      estado: '',
      cep: '',
    })
    setIsDialogOpen(true)
  }

  const handleCreatePartnerUser = async () => {
    if (!selectedPartnerId) return
    
    try {
      const response = await backofficeApi.createPartnerUser(selectedPartnerId, {
        email: newUserData.email,
        full_name: newUserData.full_name,
        is_owner: newUserData.is_owner,
        is_active: true,
      })

      console.log('Resposta completa:', response)
      console.log('response.data:', response.data)
      console.log('temporary_password:', response.data?.temporary_password)

      const tempPassword = response.data?.temporary_password || response.data?.temporary_password

      if (!tempPassword) {
        console.error('Senha temporária não encontrada na resposta:', response.data)
        toast({
          title: 'Aviso',
          description: 'Usuário criado, mas a senha temporária não foi retornada. Verifique o console.',
          variant: 'destructive',
        })
        return
      }
      
      // A senha temporária vem na resposta
      setGeneratedPassword(response.data.temporary_password)
      
      toast({
        title: 'Usuário criado com sucesso!',
        description: 'Anote a senha temporária exibida abaixo',
        duration: 10000,
      })
    } catch (err: any) {
            // Tratar erros de validação do FastAPI
        let errorMessage = 'Erro ao criar usuário'
        
        if (err.response?.data) {
        if (err.response.data.detail) {
            // Se for array de erros de validação
            if (Array.isArray(err.response.data.detail)) {
            errorMessage = err.response.data.detail
                .map((e: any) => `${e.loc?.join('.')}: ${e.msg}`)
                .join(', ')
            } else {
            // Se for string simples
            errorMessage = err.response.data.detail
            }
        }
        }
    
      toast({
        title: 'Erro',
        description: err.response?.data?.detail || 'Erro ao criar usuário',
        variant: 'destructive',
      })
    }
  }
  
    const handleOpenCreateUserDialog = (partnerId: number) => {
        setSelectedPartnerId(partnerId)
        setIsCreateUserDialogOpen(true)
        setGeneratedPassword(null)
        setNewUserData({
            email: '',
            full_name: '',
            is_owner: false,
        })
    }

  const handleSave = async () => {
    try {
      const data = {
        ...formData,
        cnpj: formData.cnpj || undefined,
        email: formData.email || undefined,
        telefone: formData.telefone || undefined,
      }

      if (editingPartner) {
        await backofficeApi.updatePartner(editingPartner.id, data)
        toast({
          title: 'Sucesso',
          description: 'Parceiro atualizado com sucesso',
        })
      } else {
        await backofficeApi.createPartner(data)
        toast({
          title: 'Sucesso',
          description: 'Parceiro criado com sucesso',
        })
      }
      setIsDialogOpen(false)
      loadPartners()
    } catch (err: any) {
      toast({
        title: 'Erro',
        description: err.response?.data?.detail || 'Erro ao salvar parceiro',
        variant: 'destructive',
      })
    }
  }

  const handleApprove = async (partnerId: number) => {
    try {
      await backofficeApi.approvePartner(partnerId)
      toast({
        title: 'Sucesso',
        description: 'Parceiro aprovado com sucesso',
      })
      loadPartners()
    } catch (err: any) {
      toast({
        title: 'Erro',
        description: err.response?.data?.detail || 'Erro ao aprovar parceiro',
        variant: 'destructive',
      })
    }
  }

  const handleDelete = async (partnerId: number) => {
    if (!confirm('Tem certeza que deseja deletar este parceiro?')) return

    try {
      await backofficeApi.deletePartner(partnerId)
      toast({
        title: 'Sucesso',
        description: 'Parceiro deletado com sucesso',
      })
      loadPartners()
    } catch (err: any) {
      toast({
        title: 'Erro',
        description: err.response?.data?.detail || 'Erro ao deletar parceiro',
        variant: 'destructive',
      })
    }
  }

  const filteredPartners = partners.filter(partner =>
    partner.nome.toLowerCase().includes(searchTerm.toLowerCase()) ||
    partner.cnpj?.toLowerCase().includes(searchTerm.toLowerCase()) ||
    partner.email?.toLowerCase().includes(searchTerm.toLowerCase())
  )

  const getStatusBadge = (status: string) => {
    const colors = {
      ativo: 'bg-green-100 text-green-800',
      pendente: 'bg-yellow-100 text-yellow-800',
      inativo: 'bg-gray-100 text-gray-800',
    }
    return (
      <span className={`px-2 py-1 rounded-full text-xs font-medium ${colors[status as keyof typeof colors]}`}>
        {status.charAt(0).toUpperCase() + status.slice(1)}
      </span>
    )
  }

  const getNivelBadge = (nivel: string) => {
    const colors = {
      bronze: 'bg-orange-100 text-orange-800',
      silver: 'bg-gray-100 text-gray-800',
      gold: 'bg-yellow-100 text-yellow-800',
    }
    return (
      <span className={`px-2 py-1 rounded-full text-xs font-medium ${colors[nivel as keyof typeof colors]}`}>
        {nivel.charAt(0).toUpperCase() + nivel.slice(1)}
      </span>
    )
  }

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-3xl font-bold">{t('backoffice-partners.title', 'Gestão de Parceiros')}</h1>
          <p className="text-gray-600 mt-2">{t('backoffice-partners.description', 'Gerencie parceiros e suas comissões')}</p>
        </div>
        <Button onClick={handleCreate}>
          <Plus className="h-4 w-4 mr-2" />
          {t('backoffice-partners.createNew', 'Novo Parceiro')}
        </Button>
      </div>

      {/* Filtros */}
      <Card>
        <CardContent className="pt-6">
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
            <div className="relative">
              <Search className="absolute left-3 top-3 h-4 w-4 text-gray-400" />
              <Input
                placeholder={t('backoffice-partners.searchPlaceholder', 'Buscar por nome, CNPJ ou email...')}
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="pl-10"
              />
            </div>
            <Select value={statusFilter} onValueChange={setStatusFilter}>
              <SelectTrigger>
                <SelectValue placeholder="Status" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">{t('backoffice-partners.allStatuses', 'Todos os Statuses')}</SelectItem>
                <SelectItem value="ativo">{t('backoffice-partners.active', 'Ativo')}</SelectItem>
                <SelectItem value="pendente">{t('backoffice-partners.pending', 'Pendente')}</SelectItem>
                <SelectItem value="inativo">{t('backoffice-partners.inactive', 'Inativo')}</SelectItem>
              </SelectContent>
            </Select>
            <Select value={nivelFilter} onValueChange={setNivelFilter}>
              <SelectTrigger>
                <SelectValue placeholder="Nível" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">{t('backoffice-partners.allLevels', 'Todos os Níveis')}</SelectItem>
                <SelectItem value="bronze">{t('backoffice-partners.bronze', 'Bronze')}</SelectItem>
                <SelectItem value="silver">{t('backoffice-partners.silver', 'Silver')}</SelectItem>
                <SelectItem value="gold">{t('backoffice-partners.gold', 'Gold')}</SelectItem>
              </SelectContent>
            </Select>
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
                    <th className="text-left p-2">{t('backoffice-partners.name', 'Nome')}</th>
                    <th className="text-left p-2">{t('backoffice-partners.cnpj', 'CNPJ')}</th>
                    <th className="text-left p-2">{t('backoffice-partners.level', 'Nível')}</th>
                    <th className="text-left p-2">{t('backoffice-partners.commission', 'Comissão')}</th>
                    <th className="text-left p-2">{t('backoffice-partners.status', 'Status')}</th>
                    <th className="text-left p-2">{t('backoffice-partners.clients', 'Clientes')}</th>
                    <th className="text-left p-2">{t('backoffice-partners.totalCommissions', 'Total Comissões')}</th>
                    <th className="text-right p-2">{t('backoffice-partners.actions', 'Ações')}</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredPartners.map((partner) => (
                    <tr key={partner.id} className="border-b hover:bg-gray-50">
                      <td className="p-2 font-medium">{partner.nome}</td>
                      <td className="p-2 text-sm text-gray-600">{partner.cnpj || '-'}</td>
                      <td className="p-2">{getNivelBadge(partner.nivel)}</td>
                      <td className="p-2">{partner.porcentagem_comissao}%</td>
                      <td className="p-2">{getStatusBadge(partner.status)}</td>
                      <td className="p-2">{partner.total_clientes}</td>
                      <td className="p-2">{formatCurrency(partner.total_comissoes)}</td>
                      <td className="p-2">
                        <div className="flex justify-end gap-2">
                          {partner.status === 'pendente' && (
                            <Button
                              size="sm"
                              variant="outline"
                              onClick={() => handleApprove(partner.id)}
                            >
                              <CheckCircle className="h-4 w-4" />
                            </Button>
                          )}
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => handleEdit(partner)}
                          >
                            <Edit className="h-4 w-4" />
                          </Button>
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => handleDelete(partner.id)}
                          >
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        </div>
                      </td>
                      <td className="p-2">
                        <div className="flex justify-end gap-2">
                            {partner.status === 'pendente' && (
                            <Button
                                size="sm"
                                variant="outline"
                                onClick={() => handleApprove(partner.id)}
                                title="Aprovar parceiro"
                            >
                                <CheckCircle className="h-4 w-4" />
                            </Button>
                            )}
                            <Button
                            size="sm"
                            variant="outline"
                            onClick={() => handleOpenCreateUserDialog(partner.id)}
                            title="Criar usuário para este parceiro"
                            >
                            <Users className="h-4 w-4" />
                            </Button>
                            <Button
                            size="sm"
                            variant="outline"
                            onClick={() => handleEdit(partner)}
                            title="Editar parceiro"
                            >
                            <Edit className="h-4 w-4" />
                            </Button>
                            <Button
                            size="sm"
                            variant="outline"
                            onClick={() => handleDelete(partner.id)}
                            title="Deletar parceiro"
                            >
                            <Trash2 className="h-4 w-4" />
                            </Button>
                        </div>
                        </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {filteredPartners.length === 0 && (
                <div className="text-center py-8 text-gray-500">
                  Nenhum parceiro encontrado
                </div>
              )}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Dialog de Criar/Editar */}
      <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>
              {editingPartner ? 'Editar Parceiro' : 'Novo Parceiro'}
            </DialogTitle>
            <DialogDescription>
              {editingPartner
                ? 'Atualize as informações do parceiro'
                : 'Preencha os dados do novo parceiro'}
            </DialogDescription>
          </DialogHeader>
          <div className="grid grid-cols-2 gap-4 py-4">
            <div className="col-span-2">
              <Label htmlFor="nome">Nome *</Label>
              <Input
                id="nome"
                value={formData.nome}
                onChange={(e) => setFormData({ ...formData, nome: e.target.value })}
              />
            </div>
            <div>
              <Label htmlFor="cnpj">CNPJ</Label>
              <Input
                id="cnpj"
                value={formData.cnpj}
                onChange={(e) => setFormData({ ...formData, cnpj: e.target.value })}
              />
            </div>
            <div>
              <Label htmlFor="nivel">Nível</Label>
              <Select
                value={formData.nivel}
                onValueChange={(value: 'bronze' | 'silver' | 'gold') =>
                  setFormData({ ...formData, nivel: value })
                }
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="bronze">Bronze</SelectItem>
                  <SelectItem value="silver">Silver</SelectItem>
                  <SelectItem value="gold">Gold</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label htmlFor="porcentagem_comissao">Porcentagem de Comissão (%)</Label>
              <Input
                id="porcentagem_comissao"
                type="number"
                min="0"
                max="100"
                value={formData.porcentagem_comissao}
                onChange={(e) =>
                  setFormData({ ...formData, porcentagem_comissao: parseFloat(e.target.value) || 0 })
                }
              />
            </div>
            <div>
              <Label htmlFor="status">Status</Label>
              <Select
                value={formData.status}
                onValueChange={(value: 'ativo' | 'pendente' | 'inativo') =>
                  setFormData({ ...formData, status: value })
                }
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="pendente">Pendente</SelectItem>
                  <SelectItem value="ativo">Ativo</SelectItem>
                  <SelectItem value="inativo">Inativo</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label htmlFor="email">Email</Label>
              <Input
                id="email"
                type="email"
                value={formData.email}
                onChange={(e) => setFormData({ ...formData, email: e.target.value })}
              />
            </div>
            <div>
              <Label htmlFor="telefone">Telefone</Label>
              <Input
                id="telefone"
                value={formData.telefone}
                onChange={(e) => setFormData({ ...formData, telefone: e.target.value })}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setIsDialogOpen(false)}>
              Cancelar
            </Button>
            <Button onClick={handleSave}>Salvar</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      <Dialog open={isCreateUserDialogOpen} onOpenChange={setIsCreateUserDialogOpen}>
  <DialogContent className="max-w-md">
    <DialogHeader>
      <DialogTitle>
        {generatedPassword ? 'Usuário Criado com Sucesso!' : 'Criar Usuário do Parceiro'}
      </DialogTitle>
      <DialogDescription>
        {generatedPassword
          ? 'Anote a senha temporária. Ela não será exibida novamente.'
          : 'Preencha os dados para criar um usuário que poderá acessar o Portal do Parceiro'}
      </DialogDescription>
    </DialogHeader>

    {generatedPassword ? (
      // Mostrar senha gerada
      <div className="space-y-4 py-4">
        <div className="bg-green-50 dark:bg-green-950/20 p-4 rounded-lg border-2 border-green-200 dark:border-green-800">
          <Label className="text-sm font-semibold text-green-800 dark:text-green-200 block mb-2">
            Senha Temporária Gerada:
          </Label>
          <div className="flex items-center gap-2">
            <Input
              value={generatedPassword}
              readOnly
              className="font-mono text-lg font-bold bg-white dark:bg-gray-900"
            />
            <Button
              variant="outline"
              size="icon"
              onClick={() => {
                navigator.clipboard.writeText(generatedPassword)
                toast({
                  title: 'Senha copiada!',
                  description: 'A senha foi copiada para a área de transferência',
                })
              }}
              title="Copiar senha"
            >
              <Copy className="h-4 w-4" />
            </Button>
          </div>
          <p className="text-sm text-green-700 dark:text-green-300 mt-3 flex items-center gap-2">
            <span className="text-lg">⚠️</span>
            <span>Anote esta senha! Ela não será exibida novamente.</span>
          </p>
        </div>
        
        <div className="bg-blue-50 dark:bg-blue-950/20 p-4 rounded-lg border border-blue-200 dark:border-blue-800">
          <p className="text-sm text-blue-800 dark:text-blue-200 font-semibold mb-1">
            Informações do Usuário:
          </p>
          <p className="text-sm text-blue-700 dark:text-blue-300">
            <strong>Email:</strong> {newUserData.email}
          </p>
          <p className="text-sm text-blue-700 dark:text-blue-300">
            <strong>Nome:</strong> {newUserData.full_name}
          </p>
          <p className="text-sm text-blue-700 dark:text-blue-300 mt-2">
            O usuário pode fazer login em: <code className="bg-blue-100 dark:bg-blue-900 px-1 rounded">/partner/login</code>
          </p>
        </div>

        <DialogFooter>
          <Button
            onClick={() => {
              setIsCreateUserDialogOpen(false)
              setGeneratedPassword(null)
              setNewUserData({ email: '', full_name: '', is_owner: false })
            }}
          >
            Fechar
          </Button>
        </DialogFooter>
      </div>
    ) : (
      // Formulário para criar usuário
      <div className="space-y-4 py-4">
        <div>
          <Label htmlFor="user-email">Email *</Label>
          <Input
            id="user-email"
            type="email"
            value={newUserData.email}
            onChange={(e) => setNewUserData({ ...newUserData, email: e.target.value })}
            placeholder="usuario@parceiro.com"
            required
          />
        </div>
        
        <div>
          <Label htmlFor="user-full-name">Nome Completo *</Label>
          <Input
            id="user-full-name"
            value={newUserData.full_name}
            onChange={(e) => setNewUserData({ ...newUserData, full_name: e.target.value })}
            placeholder="Nome do usuário"
            required
          />
        </div>
        
        <div className="flex items-center gap-2">
          <input
            type="checkbox"
            id="user-is-owner"
            checked={newUserData.is_owner}
            onChange={(e) => setNewUserData({ ...newUserData, is_owner: e.target.checked })}
            className="h-4 w-4"
          />
          <Label htmlFor="user-is-owner" className="cursor-pointer">
            É proprietário do parceiro?
          </Label>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => setIsCreateUserDialogOpen(false)}>
            Cancelar
          </Button>
          <Button
            onClick={handleCreatePartnerUser}
            disabled={!newUserData.email || !newUserData.full_name}
          >
            Criar Usuário
          </Button>
        </DialogFooter>
      </div>
    )}
  </DialogContent>
</Dialog>
    </div>
  )
}

