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
import { Textarea } from '@/components/ui/textarea'
import { TyrLoadingSpinner } from '@/components/TyrLoadingSpinner'
import { Search, Eye, MessageSquare, CheckCircle, Clock, XCircle } from 'lucide-react'
import { partnerPortalApi } from '@/lib/api'
import { useToast } from '@/components/ui/use-toast'

const formatDate = (dateString: string | null) => {
  if (!dateString) return '-'
  const date = new Date(dateString)
  return date.toLocaleDateString('pt-BR', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  })
}

interface SupportTicket {
  id: number
  customer_id: number
  customer_name: string | null
  titulo: string
  descricao: string
  status: string
  prioridade: string
  categoria: string | null
  resolucao: string | null
  created_at: string
  updated_at: string
  resolved_at: string | null
  closed_at: string | null
}

export function PartnerSupport() {
  const { toast } = useToast()
  const [loading, setLoading] = useState(true)
  const [tickets, setTickets] = useState<SupportTicket[]>([])
  const [selectedTicket, setSelectedTicket] = useState<SupportTicket | null>(null)
  const [isDialogOpen, setIsDialogOpen] = useState(false)
  const [resolucao, setResolucao] = useState('')
  const [filters, setFilters] = useState({
    status: '',
    priority: '',
  })
  const [currentPage, setCurrentPage] = useState(0)
  const [total, setTotal] = useState(0)
  const itemsPerPage = 20

  useEffect(() => {
    loadTickets()
  }, [currentPage])

  const loadTickets = async () => {
    try {
      setLoading(true)
      const params: any = {
        skip: currentPage * itemsPerPage,
        limit: itemsPerPage,
      }
      
      if (filters.status) params.status = filters.status
      if (filters.priority) params.priority = filters.priority

      const response = await partnerPortalApi.getSupportTickets(params)
      setTickets(response.data.items)
      setTotal(response.data.total)
    } catch (err: any) {
      console.error('Erro ao carregar tickets:', err)
    } finally {
      setLoading(false)
    }
  }

  const handleViewTicket = async (ticketId: number) => {
    try {
      const response = await partnerPortalApi.getSupportTicket(ticketId)
      setSelectedTicket(response.data)
      setResolucao(response.data.resolucao || '')
      setIsDialogOpen(true)
    } catch (err: any) {
      toast({
        title: 'Erro',
        description: err.response?.data?.detail || 'Erro ao carregar ticket',
        variant: 'destructive',
      })
    }
  }

  const handleUpdateTicket = async () => {
    if (!selectedTicket) return

    try {
      await partnerPortalApi.updateSupportTicket(selectedTicket.id, {
        resolucao,
        status: resolucao ? 'resolvido' : selectedTicket.status,
      })
      toast({
        title: 'Sucesso',
        description: 'Ticket atualizado com sucesso',
      })
      setIsDialogOpen(false)
      loadTickets()
    } catch (err: any) {
      toast({
        title: 'Erro',
        description: err.response?.data?.detail || 'Erro ao atualizar ticket',
        variant: 'destructive',
      })
    }
  }

  const handleFilterChange = (field: string, value: string) => {
    setFilters({ ...filters, [field]: value })
  }

  const handleApplyFilters = () => {
    setCurrentPage(0)
    loadTickets()
  }

  const getStatusBadge = (status: string) => {
    const colors = {
      aberto: 'bg-blue-100 text-blue-800',
      em_andamento: 'bg-yellow-100 text-yellow-800',
      resolvido: 'bg-green-100 text-green-800',
      fechado: 'bg-gray-100 text-gray-800',
      cancelado: 'bg-red-100 text-red-800',
    }
    const icons = {
      aberto: Clock,
      em_andamento: Clock,
      resolvido: CheckCircle,
      fechado: XCircle,
      cancelado: XCircle,
    }
    const Icon = icons[status as keyof typeof icons] || Clock
    return (
      <span className={`flex items-center gap-1 px-2 py-1 rounded-full text-xs font-medium ${colors[status as keyof typeof colors] || 'bg-gray-100 text-gray-800'}`}>
        <Icon className="h-3 w-3" />
        {status.charAt(0).toUpperCase() + status.slice(1).replace('_', ' ')}
      </span>
    )
  }

  const getPriorityBadge = (priority: string) => {
    const colors = {
      baixa: 'bg-green-100 text-green-800',
      media: 'bg-yellow-100 text-yellow-800',
      alta: 'bg-orange-100 text-orange-800',
      urgente: 'bg-red-100 text-red-800',
    }
    return (
      <span className={`px-2 py-1 rounded-full text-xs font-medium ${colors[priority as keyof typeof colors] || 'bg-gray-100 text-gray-800'}`}>
        {priority.charAt(0).toUpperCase() + priority.slice(1)}
      </span>
    )
  }

  const totalPages = Math.ceil(total / itemsPerPage)

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold">Suporte</h1>
        <p className="text-gray-600 mt-2">Tickets de suporte dos seus clientes</p>
      </div>

      {/* Filtros */}
      <Card>
        <CardHeader>
          <CardTitle>Filtros</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div>
              <Label htmlFor="status">Status</Label>
              <Select
                value={filters.status}
                onValueChange={(value) => handleFilterChange('status', value)}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Todos" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="">Todos</SelectItem>
                  <SelectItem value="aberto">Aberto</SelectItem>
                  <SelectItem value="em_andamento">Em Andamento</SelectItem>
                  <SelectItem value="resolvido">Resolvido</SelectItem>
                  <SelectItem value="fechado">Fechado</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label htmlFor="priority">Prioridade</Label>
              <Select
                value={filters.priority}
                onValueChange={(value) => handleFilterChange('priority', value)}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Todas" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="">Todas</SelectItem>
                  <SelectItem value="baixa">Baixa</SelectItem>
                  <SelectItem value="media">Média</SelectItem>
                  <SelectItem value="alta">Alta</SelectItem>
                  <SelectItem value="urgente">Urgente</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="flex items-end">
              <Button onClick={handleApplyFilters} className="w-full">
                <Search className="h-4 w-4 mr-2" />
                Filtrar
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
                    <th className="text-left p-2">Cliente</th>
                    <th className="text-left p-2">Título</th>
                    <th className="text-left p-2">Status</th>
                    <th className="text-left p-2">Prioridade</th>
                    <th className="text-left p-2">Categoria</th>
                    <th className="text-left p-2">Data Abertura</th>
                    <th className="text-right p-2">Ações</th>
                  </tr>
                </thead>
                <tbody>
                  {tickets.map((ticket) => (
                    <tr key={ticket.id} className="border-b hover:bg-gray-50">
                      <td className="p-2 font-medium">
                        {ticket.customer_name || `Cliente #${ticket.customer_id}`}
                      </td>
                      <td className="p-2">{ticket.titulo}</td>
                      <td className="p-2">{getStatusBadge(ticket.status)}</td>
                      <td className="p-2">{getPriorityBadge(ticket.prioridade)}</td>
                      <td className="p-2 text-sm text-gray-600">{ticket.categoria || '-'}</td>
                      <td className="p-2 text-sm text-gray-600">{formatDate(ticket.created_at)}</td>
                      <td className="p-2">
                        <div className="flex justify-end">
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => handleViewTicket(ticket.id)}
                          >
                            <Eye className="h-4 w-4 mr-2" />
                            Ver
                          </Button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {tickets.length === 0 && (
                <div className="text-center py-8 text-gray-500">
                  Nenhum ticket encontrado
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
        <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{selectedTicket?.titulo}</DialogTitle>
            <DialogDescription>
              Ticket de suporte do cliente: {selectedTicket?.customer_name}
            </DialogDescription>
          </DialogHeader>
          {selectedTicket && (
            <div className="space-y-4 py-4">
              <div>
                <Label>Status</Label>
                <div className="mt-1">{getStatusBadge(selectedTicket.status)}</div>
              </div>
              <div>
                <Label>Prioridade</Label>
                <div className="mt-1">{getPriorityBadge(selectedTicket.prioridade)}</div>
              </div>
              <div>
                <Label>Descrição</Label>
                <div className="mt-1 p-3 bg-gray-50 dark:bg-gray-900 rounded-md">
                  {selectedTicket.descricao}
                </div>
              </div>
              <div>
                <Label htmlFor="resolucao">Resolução / Resposta</Label>
                <Textarea
                  id="resolucao"
                  value={resolucao}
                  onChange={(e) => setResolucao(e.target.value)}
                  placeholder="Digite a resolução ou resposta para o cliente..."
                  className="mt-1"
                  rows={5}
                />
              </div>
              <div className="text-sm text-gray-600">
                <p>Criado em: {formatDate(selectedTicket.created_at)}</p>
                {selectedTicket.resolved_at && (
                  <p>Resolvido em: {formatDate(selectedTicket.resolved_at)}</p>
                )}
              </div>
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setIsDialogOpen(false)}>
              Fechar
            </Button>
            <Button onClick={handleUpdateTicket}>Salvar Resolução</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}

