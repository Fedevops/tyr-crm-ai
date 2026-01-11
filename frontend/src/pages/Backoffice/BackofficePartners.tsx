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
import { Plus, Edit, CheckCircle, XCircle, Trash2, Search } from 'lucide-react'
import { backofficeApi } from '@/lib/api'
import { useToast } from '@/components/ui/use-toast'

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
          <h1 className="text-3xl font-bold">Gestão de Parceiros</h1>
          <p className="text-gray-600 mt-2">Gerencie parceiros e suas comissões</p>
        </div>
        <Button onClick={handleCreate}>
          <Plus className="h-4 w-4 mr-2" />
          Novo Parceiro
        </Button>
      </div>

      {/* Filtros */}
      <Card>
        <CardContent className="pt-6">
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
            <div className="relative">
              <Search className="absolute left-3 top-3 h-4 w-4 text-gray-400" />
              <Input
                placeholder="Buscar por nome, CNPJ ou email..."
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
                <SelectItem value="all">Todos os Status</SelectItem>
                <SelectItem value="ativo">Ativo</SelectItem>
                <SelectItem value="pendente">Pendente</SelectItem>
                <SelectItem value="inativo">Inativo</SelectItem>
              </SelectContent>
            </Select>
            <Select value={nivelFilter} onValueChange={setNivelFilter}>
              <SelectTrigger>
                <SelectValue placeholder="Nível" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todos os Níveis</SelectItem>
                <SelectItem value="bronze">Bronze</SelectItem>
                <SelectItem value="silver">Silver</SelectItem>
                <SelectItem value="gold">Gold</SelectItem>
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
                    <th className="text-left p-2">Nome</th>
                    <th className="text-left p-2">CNPJ</th>
                    <th className="text-left p-2">Nível</th>
                    <th className="text-left p-2">Comissão</th>
                    <th className="text-left p-2">Status</th>
                    <th className="text-left p-2">Clientes</th>
                    <th className="text-left p-2">Total Comissões</th>
                    <th className="text-right p-2">Ações</th>
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
    </div>
  )
}

