import { useState, useEffect } from 'react'
import { useTranslation } from 'react-i18next'
import { useNavigate, useLocation } from 'react-router-dom'
import { ordersApi, itemsApi } from '@/lib/api'
import api from '@/lib/api'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { 
  Plus, 
  Search, 
  Eye,
  Download,
  Calendar,
  Filter,
  Package,
  CheckCircle2,
  XCircle,
  Clock,
  Truck,
  X
} from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { useToast } from '@/components/ui/use-toast'
import { format } from 'date-fns'
import { ptBR } from 'date-fns/locale'

interface Order {
  id: number
  proposal_id?: number | null
  contact_id?: number | null
  account_id?: number | null
  customer_name: string
  customer_email?: string | null
  customer_phone?: string | null
  status: 'pending' | 'processing' | 'completed' | 'cancelled' | 'shipped'
  total_amount: number
  currency: string
  notes?: string | null
  owner_id: number
  created_by_id: number
  created_at: string
  updated_at: string
  items: OrderItem[]
  status_history: OrderStatusHistory[]
  contact_name?: string | null
  account_name?: string | null
}

interface OrderItem {
  id: number
  item_id: number
  quantity: number
  unit_price: number
  subtotal: number
  item_name?: string
  item_sku?: string
  item_type?: string
}

interface OrderStatusHistory {
  id: number
  status: string
  notes?: string | null
  changed_by_id: number
  created_at: string
  changed_by_name?: string
  changed_by_email?: string
}

interface Item {
  id: number
  name: string
  sku: string | null
  type: 'product' | 'service'
  unit_price: number
  currency: string
}

export function Orders() {
  const { t } = useTranslation()
  const { toast } = useToast()
  const navigate = useNavigate()
  const location = useLocation()
  const [orders, setOrders] = useState<Order[]>([])
  const [loading, setLoading] = useState(true)
  const [showForm, setShowForm] = useState(false)
  const [editingId, setEditingId] = useState<number | null>(null)
  const [selectedOrder, setSelectedOrder] = useState<Order | null>(null)
  const [showDetailModal, setShowDetailModal] = useState(false)
  
  // Filtros
  const [statusFilter, setStatusFilter] = useState<string>('all')
  const [customerNameFilter, setCustomerNameFilter] = useState('')
  const [dateFromFilter, setDateFromFilter] = useState('')
  const [dateToFilter, setDateToFilter] = useState('')
  
  // Form data
  const [formData, setFormData] = useState({
    contact_id: null as number | null,
    account_id: null as number | null,
    customer_name: '',
    customer_email: '',
    customer_phone: '',
    proposal_id: null as number | null,
    items: [] as Array<{ item_id: number; quantity: number; unit_price?: number }>,
    notes: '',
    currency: 'BRL',
  })
  
  const [availableItems, setAvailableItems] = useState<Item[]>([])
  const [availableContacts, setAvailableContacts] = useState<Array<{id: number, first_name: string, last_name: string, email?: string, phone?: string, account_id?: number, account_name?: string}>>([])
  const [showItemsModal, setShowItemsModal] = useState(false)
  const [selectedItemForAdd, setSelectedItemForAdd] = useState<Item | null>(null)
  const [itemQuantity, setItemQuantity] = useState(1)

  useEffect(() => {
    fetchOrders()
    fetchAvailableItems()
    fetchAvailableContacts()
    
    // Verificar se há dados pré-preenchidos da proposta
    if (location.state) {
      const state = location.state as any
      setFormData({
        contact_id: state.contact_id || null,
        account_id: state.account_id || null,
        customer_name: state.customer_name || '',
        customer_email: state.customer_email || '',
        customer_phone: state.customer_phone || '',
        proposal_id: state.proposal_id || null,
        items: state.items || [],
        notes: state.notes || '',
        currency: state.currency || 'BRL',
      })
      setShowForm(true)
      // Limpar state após usar
      navigate(location.pathname, { replace: true, state: null })
    }
  }, [statusFilter, customerNameFilter, dateFromFilter, dateToFilter, location, navigate])
  
  const fetchAvailableContacts = async () => {
    try {
      const response = await api.get('/api/contacts?limit=1000')
      const contacts = response.data || []
      // Buscar nomes das contas para cada contato
      const contactsWithAccounts = await Promise.all(
        contacts.map(async (contact: any) => {
          if (contact.account_id) {
            try {
              const accountResponse = await api.get(`/api/accounts/${contact.account_id}`)
              return {
                ...contact,
                account_name: accountResponse.data.name
              }
            } catch {
              return contact
            }
          }
          return contact
        })
      )
      setAvailableContacts(contactsWithAccounts)
    } catch (error) {
      console.error('Error fetching contacts:', error)
    }
  }
  
  const handleContactChange = (contactId: string) => {
    const contact = availableContacts.find(c => c.id === parseInt(contactId))
    if (contact) {
      setFormData({
        ...formData,
        contact_id: contact.id,
        account_id: contact.account_id || null,
        customer_name: `${contact.first_name} ${contact.last_name}`.trim(),
        customer_email: contact.email || '',
        customer_phone: contact.phone || contact.mobile || '',
      })
    }
  }

  const fetchOrders = async () => {
    setLoading(true)
    try {
      const params: any = {}
      if (statusFilter !== 'all') {
        params.status = statusFilter
      }
      if (customerNameFilter) {
        params.customer_name = customerNameFilter
      }
      if (dateFromFilter) {
        params.date_from = dateFromFilter
      }
      if (dateToFilter) {
        params.date_to = dateToFilter
      }
      
      const response = await ordersApi.getOrders(params)
      setOrders(response.data)
    } catch (error: any) {
      console.error('Error fetching orders:', error)
      toast({
        variant: 'destructive',
        title: 'Erro',
        description: 'Não foi possível carregar os pedidos.',
      })
    } finally {
      setLoading(false)
    }
  }

  const fetchAvailableItems = async () => {
    try {
      const response = await itemsApi.getItems()
      setAvailableItems(response.data)
    } catch (error) {
      console.error('Error fetching items:', error)
    }
  }

  const getStatusBadge = (status: string) => {
    const variants: Record<string, 'default' | 'secondary' | 'destructive' | 'outline'> = {
      pending: 'outline',
      processing: 'secondary',
      completed: 'default',
      cancelled: 'destructive',
      shipped: 'default',
    }
    const labels: Record<string, string> = {
      pending: 'Pendente',
      processing: 'Processando',
      completed: 'Finalizado',
      cancelled: 'Cancelado',
      shipped: 'Enviado',
    }
    return (
      <Badge variant={variants[status] || 'outline'}>
        {labels[status] || status}
      </Badge>
    )
  }

  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'completed':
        return <CheckCircle2 className="h-4 w-4" />
      case 'cancelled':
        return <XCircle className="h-4 w-4" />
      case 'shipped':
        return <Truck className="h-4 w-4" />
      case 'processing':
        return <Clock className="h-4 w-4" />
      default:
        return <Clock className="h-4 w-4" />
    }
  }

  const handleViewDetails = async (order: Order) => {
    try {
      const response = await ordersApi.getOrder(order.id)
      setSelectedOrder(response.data)
      setShowDetailModal(true)
    } catch (error) {
      console.error('Error fetching order details:', error)
      toast({
        variant: 'destructive',
        title: 'Erro',
        description: 'Não foi possível carregar os detalhes do pedido.',
      })
    }
  }

  const handleExportPDF = async (order: Order) => {
    try {
      const response = await ordersApi.exportOrderHtml(order.id)
      const htmlContent = response.data
      
      // Criar nova janela para impressão
      const printWindow = window.open('', '_blank')
      if (!printWindow) {
        toast({
          variant: 'destructive',
          title: 'Erro',
          description: 'Não foi possível abrir a janela de impressão.',
        })
        return
      }
      
      printWindow.document.write(htmlContent)
      printWindow.document.close()
      
      // Aguardar carregamento e abrir diálogo de impressão
      printWindow.onload = () => {
        setTimeout(() => {
          printWindow.print()
        }, 500)
      }
    } catch (error) {
      console.error('Error exporting PDF:', error)
      toast({
        variant: 'destructive',
        title: 'Erro',
        description: 'Não foi possível gerar o PDF do pedido.',
      })
    }
  }

  const handleAddItem = () => {
    if (!selectedItemForAdd) return
    
    const existingItem = formData.items.find(item => item.item_id === selectedItemForAdd.id)
    if (existingItem) {
      toast({
        variant: 'destructive',
        title: 'Erro',
        description: 'Item já foi adicionado. Use a quantidade para alterar.',
      })
      return
    }
    
    setFormData({
      ...formData,
      items: [
        ...formData.items,
        {
          item_id: selectedItemForAdd.id,
          quantity: itemQuantity,
          unit_price: selectedItemForAdd.unit_price,
        },
      ],
    })
    
    setSelectedItemForAdd(null)
    setItemQuantity(1)
    setShowItemsModal(false)
  }

  const handleRemoveItem = (itemId: number) => {
    setFormData({
      ...formData,
      items: formData.items.filter(item => item.item_id !== itemId),
    })
  }

  const calculateTotal = () => {
    return formData.items.reduce((total, item) => {
      const itemData = availableItems.find(i => i.id === item.item_id)
      const price = item.unit_price || itemData?.unit_price || 0
      return total + (price * item.quantity)
    }, 0)
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    
    if (formData.items.length === 0) {
      toast({
        variant: 'destructive',
        title: 'Erro',
        description: 'Adicione pelo menos um item ao pedido.',
      })
      return
    }
    
    // Validar que temos um contato ou pelo menos um nome
    if (!formData.contact_id && !formData.customer_name) {
      toast({
        variant: 'destructive',
        title: 'Erro',
        description: 'Selecione um contato ou informe o nome do cliente.',
      })
      return
    }
    
    try {
      if (editingId) {
        await ordersApi.updateOrder(editingId, {
          status: formData.status,
          notes: formData.notes,
        })
        toast({
          title: 'Sucesso',
          description: 'Pedido atualizado com sucesso!',
        })
      } else {
        await ordersApi.createOrder({
          contact_id: formData.contact_id || undefined,
          account_id: formData.account_id || undefined,
          customer_name: formData.customer_name || undefined,
          customer_email: formData.customer_email || undefined,
          customer_phone: formData.customer_phone || undefined,
          proposal_id: formData.proposal_id || undefined,
          items: formData.items,
          notes: formData.notes || undefined,
          currency: formData.currency,
        })
        toast({
          title: 'Sucesso',
          description: 'Pedido criado com sucesso!',
        })
      }
      
      setShowForm(false)
      resetForm()
      fetchOrders()
    } catch (error: any) {
      console.error('Error saving order:', error)
      toast({
        variant: 'destructive',
        title: 'Erro',
        description: error.response?.data?.detail || 'Não foi possível salvar o pedido.',
      })
    }
  }

  const resetForm = () => {
    setFormData({
      contact_id: null,
      account_id: null,
      customer_name: '',
      customer_email: '',
      customer_phone: '',
      proposal_id: null,
      items: [],
      notes: '',
      currency: 'BRL',
    })
    setEditingId(null)
  }

  if (loading) {
    return (
      <div className="flex-1 space-y-6 p-6">
        <div className="flex items-center justify-center h-64">
          <div className="text-muted-foreground">Carregando pedidos...</div>
        </div>
      </div>
    )
  }

  return (
    <div className="flex-1 space-y-6 p-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold">Pedidos</h1>
          <p className="text-muted-foreground mt-1">
            Gerencie todos os pedidos de venda
          </p>
        </div>
        <Button onClick={() => { resetForm(); setShowForm(true) }}>
          <Plus className="h-4 w-4 mr-2" />
          Novo Pedido
        </Button>
      </div>

      {/* Filtros */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Filter className="h-5 w-5" />
            Filtros
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
            <div>
              <label className="text-sm font-medium mb-2 block">Status</label>
              <Select value={statusFilter} onValueChange={setStatusFilter}>
                <SelectTrigger>
                  <SelectValue placeholder="Todos" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Todos</SelectItem>
                  <SelectItem value="pending">Pendente</SelectItem>
                  <SelectItem value="processing">Processando</SelectItem>
                  <SelectItem value="completed">Finalizado</SelectItem>
                  <SelectItem value="cancelled">Cancelado</SelectItem>
                  <SelectItem value="shipped">Enviado</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <label className="text-sm font-medium mb-2 block">Cliente</label>
              <Input
                placeholder="Nome do cliente"
                value={customerNameFilter}
                onChange={(e) => setCustomerNameFilter(e.target.value)}
              />
            </div>
            <div>
              <label className="text-sm font-medium mb-2 block">Data Início</label>
              <Input
                type="date"
                value={dateFromFilter}
                onChange={(e) => setDateFromFilter(e.target.value)}
              />
            </div>
            <div>
              <label className="text-sm font-medium mb-2 block">Data Fim</label>
              <Input
                type="date"
                value={dateToFilter}
                onChange={(e) => setDateToFilter(e.target.value)}
              />
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Lista de Pedidos */}
      <Card>
        <CardHeader>
          <CardTitle>Pedidos ({orders.length})</CardTitle>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>ID</TableHead>
                <TableHead>Cliente</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Total</TableHead>
                <TableHead>Data</TableHead>
                <TableHead>Ações</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {orders.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={6} className="text-center text-muted-foreground">
                    Nenhum pedido encontrado
                  </TableCell>
                </TableRow>
              ) : (
                orders.map((order) => (
                  <TableRow key={order.id}>
                    <TableCell className="font-medium">#{order.id}</TableCell>
                    <TableCell>{order.customer_name}</TableCell>
                    <TableCell>
                      <div className="flex items-center gap-2">
                        {getStatusIcon(order.status)}
                        {getStatusBadge(order.status)}
                      </div>
                    </TableCell>
                    <TableCell>
                      {new Intl.NumberFormat('pt-BR', {
                        style: 'currency',
                        currency: order.currency,
                      }).format(order.total_amount)}
                    </TableCell>
                    <TableCell>
                      {format(new Date(order.created_at), 'dd/MM/yyyy', { locale: ptBR })}
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center gap-2">
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => handleViewDetails(order)}
                        >
                          <Eye className="h-4 w-4" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => handleExportPDF(order)}
                        >
                          <Download className="h-4 w-4" />
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      {/* Modal de Detalhes */}
      {showDetailModal && selectedOrder && (
        <Dialog open={showDetailModal} onOpenChange={setShowDetailModal}>
          <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle>Pedido #{selectedOrder.id}</DialogTitle>
              <DialogDescription>
                Detalhes completos do pedido
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                {selectedOrder.contact_name && (
                  <div>
                    <p className="text-sm font-medium">Contato</p>
                    <p className="text-sm text-muted-foreground">{selectedOrder.contact_name}</p>
                  </div>
                )}
                {selectedOrder.account_name && (
                  <div>
                    <p className="text-sm font-medium">Empresa</p>
                    <p className="text-sm text-muted-foreground">{selectedOrder.account_name}</p>
                  </div>
                )}
                <div>
                  <p className="text-sm font-medium">Cliente</p>
                  <p className="text-sm text-muted-foreground">{selectedOrder.customer_name}</p>
                </div>
                <div>
                  <p className="text-sm font-medium">Email</p>
                  <p className="text-sm text-muted-foreground">{selectedOrder.customer_email || 'N/A'}</p>
                </div>
                <div>
                  <p className="text-sm font-medium">Telefone</p>
                  <p className="text-sm text-muted-foreground">{selectedOrder.customer_phone || 'N/A'}</p>
                </div>
                {selectedOrder.proposal_id && (
                  <div>
                    <p className="text-sm font-medium">Proposta</p>
                    <p className="text-sm text-muted-foreground">#{selectedOrder.proposal_id}</p>
                  </div>
                )}
                <div>
                  <p className="text-sm font-medium mb-2">Status</p>
                  <Select
                    value={selectedOrder.status}
                    onValueChange={async (newStatus) => {
                      try {
                        await ordersApi.updateOrder(selectedOrder.id, {
                          status: newStatus,
                        })
                        toast({
                          title: 'Sucesso',
                          description: 'Status do pedido atualizado com sucesso!',
                        })
                        // Recarregar detalhes do pedido
                        const response = await ordersApi.getOrder(selectedOrder.id)
                        setSelectedOrder(response.data)
                        fetchOrders() // Atualizar lista
                      } catch (error: any) {
                        console.error('Error updating order status:', error)
                        toast({
                          variant: 'destructive',
                          title: 'Erro',
                          description: error.response?.data?.detail || 'Não foi possível atualizar o status do pedido.',
                        })
                      }
                    }}
                  >
                    <SelectTrigger className="w-full">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="pending">Pendente</SelectItem>
                      <SelectItem value="processing">Processando</SelectItem>
                      <SelectItem value="completed">Finalizado</SelectItem>
                      <SelectItem value="shipped">Enviado</SelectItem>
                      <SelectItem value="cancelled">Cancelado</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <p className="text-sm font-medium">Total</p>
                  <p className="text-sm font-semibold">
                    {new Intl.NumberFormat('pt-BR', {
                      style: 'currency',
                      currency: selectedOrder.currency,
                    }).format(selectedOrder.total_amount)}
                  </p>
                </div>
                <div>
                  <p className="text-sm font-medium">Data</p>
                  <p className="text-sm text-muted-foreground">
                    {format(new Date(selectedOrder.created_at), 'dd/MM/yyyy HH:mm', { locale: ptBR })}
                  </p>
                </div>
              </div>
              
              <div>
                <p className="text-sm font-medium mb-2">Itens do Pedido</p>
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Item</TableHead>
                      <TableHead>Quantidade</TableHead>
                      <TableHead>Preço Unit.</TableHead>
                      <TableHead>Subtotal</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {selectedOrder.items.map((item) => (
                      <TableRow key={item.id}>
                        <TableCell>{item.item_name || 'N/A'}</TableCell>
                        <TableCell>{item.quantity}</TableCell>
                        <TableCell>
                          {new Intl.NumberFormat('pt-BR', {
                            style: 'currency',
                            currency: selectedOrder.currency,
                          }).format(item.unit_price)}
                        </TableCell>
                        <TableCell>
                          {new Intl.NumberFormat('pt-BR', {
                            style: 'currency',
                            currency: selectedOrder.currency,
                          }).format(item.subtotal)}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
              
              {selectedOrder.status_history && selectedOrder.status_history.length > 0 && (
                <div>
                  <p className="text-sm font-medium mb-2">Histórico de Status</p>
                  <div className="space-y-2">
                    {selectedOrder.status_history.map((history) => (
                      <div key={history.id} className="flex items-start gap-2 p-2 border rounded">
                        <div className="flex-1">
                          <p className="text-sm font-medium">{getStatusBadge(history.status)}</p>
                          <p className="text-xs text-muted-foreground">
                            {history.changed_by_name || 'Sistema'} - {format(new Date(history.created_at), 'dd/MM/yyyy HH:mm', { locale: ptBR })}
                          </p>
                          {history.notes && (
                            <p className="text-xs text-muted-foreground mt-1">{history.notes}</p>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setShowDetailModal(false)}>
                Fechar
              </Button>
              <Button onClick={() => handleExportPDF(selectedOrder)}>
                <Download className="h-4 w-4 mr-2" />
                Exportar PDF
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      )}

      {/* Modal de Criar/Editar Pedido */}
      <Dialog open={showForm} onOpenChange={setShowForm}>
        <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{editingId ? 'Editar Pedido' : 'Novo Pedido'}</DialogTitle>
            <DialogDescription>
              {editingId ? 'Atualize as informações do pedido' : 'Preencha os dados do novo pedido'}
            </DialogDescription>
          </DialogHeader>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="text-sm font-medium mb-2 block">Contato *</label>
                <Select
                  value={formData.contact_id?.toString() || ''}
                  onValueChange={handleContactChange}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Selecione um contato" />
                  </SelectTrigger>
                  <SelectContent>
                    {availableContacts.map((contact) => (
                      <SelectItem key={contact.id} value={contact.id.toString()}>
                        {contact.first_name} {contact.last_name}
                        {contact.account_name && ` - ${contact.account_name}`}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <p className="text-xs text-muted-foreground mt-1">
                  Ou preencha manualmente os campos abaixo
                </p>
              </div>
              <div>
                <label className="text-sm font-medium mb-2 block">Moeda</label>
                <Select
                  value={formData.currency}
                  onValueChange={(value) => setFormData({ ...formData, currency: value })}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="BRL">BRL</SelectItem>
                    <SelectItem value="USD">USD</SelectItem>
                    <SelectItem value="EUR">EUR</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div>
                <label className="text-sm font-medium mb-2 block">Nome do Cliente {!formData.contact_id && '*'}</label>
                <Input
                  value={formData.customer_name}
                  onChange={(e) => setFormData({ ...formData, customer_name: e.target.value })}
                  required={!formData.contact_id}
                  disabled={!!formData.contact_id}
                />
              </div>
              <div>
                <label className="text-sm font-medium mb-2 block">Email</label>
                <Input
                  type="email"
                  value={formData.customer_email}
                  onChange={(e) => setFormData({ ...formData, customer_email: e.target.value })}
                  disabled={!!formData.contact_id}
                />
              </div>
              <div>
                <label className="text-sm font-medium mb-2 block">Telefone</label>
                <Input
                  value={formData.customer_phone}
                  onChange={(e) => setFormData({ ...formData, customer_phone: e.target.value })}
                  disabled={!!formData.contact_id}
                />
              </div>
            </div>
            
            <div>
              <div className="flex items-center justify-between mb-2">
                <label className="text-sm font-medium">Itens do Pedido *</label>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => setShowItemsModal(true)}
                >
                  <Plus className="h-4 w-4 mr-2" />
                  Adicionar Item
                </Button>
              </div>
              
              {formData.items.length === 0 ? (
                <p className="text-sm text-muted-foreground">Nenhum item adicionado</p>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Item</TableHead>
                      <TableHead>Quantidade</TableHead>
                      <TableHead>Preço Unit.</TableHead>
                      <TableHead>Subtotal</TableHead>
                      <TableHead>Ações</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {formData.items.map((item) => {
                      const itemData = availableItems.find(i => i.id === item.item_id)
                      const price = item.unit_price || itemData?.unit_price || 0
                      const subtotal = price * item.quantity
                      return (
                        <TableRow key={item.item_id}>
                          <TableCell>{itemData?.name || 'N/A'}</TableCell>
                          <TableCell>
                            <Input
                              type="number"
                              min="1"
                              value={item.quantity}
                              onChange={(e) => {
                                const newItems = formData.items.map(i =>
                                  i.item_id === item.item_id
                                    ? { ...i, quantity: parseInt(e.target.value) || 1 }
                                    : i
                                )
                                setFormData({ ...formData, items: newItems })
                              }}
                              className="w-20"
                            />
                          </TableCell>
                          <TableCell>
                            {new Intl.NumberFormat('pt-BR', {
                              style: 'currency',
                              currency: formData.currency,
                            }).format(price)}
                          </TableCell>
                          <TableCell>
                            {new Intl.NumberFormat('pt-BR', {
                              style: 'currency',
                              currency: formData.currency,
                            }).format(subtotal)}
                          </TableCell>
                          <TableCell>
                            <Button
                              type="button"
                              variant="ghost"
                              size="sm"
                              onClick={() => handleRemoveItem(item.item_id)}
                            >
                              <X className="h-4 w-4" />
                            </Button>
                          </TableCell>
                        </TableRow>
                      )
                    })}
                  </TableBody>
                  <tfoot>
                    <TableRow>
                      <TableCell colSpan={3} className="text-right font-semibold">
                        Total:
                      </TableCell>
                      <TableCell className="font-semibold">
                        {new Intl.NumberFormat('pt-BR', {
                          style: 'currency',
                          currency: formData.currency,
                        }).format(calculateTotal())}
                      </TableCell>
                      <TableCell></TableCell>
                    </TableRow>
                  </tfoot>
                </Table>
              )}
            </div>
            
            <div>
              <label className="text-sm font-medium mb-2 block">Observações</label>
              <textarea
                className="w-full min-h-[100px] p-2 border rounded-md"
                value={formData.notes}
                onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
              />
            </div>
            
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => { setShowForm(false); resetForm() }}>
                Cancelar
              </Button>
              <Button type="submit">
                {editingId ? 'Atualizar' : 'Criar'} Pedido
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* Modal de Seleção de Itens */}
      <Dialog open={showItemsModal} onOpenChange={setShowItemsModal}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>Adicionar Item</DialogTitle>
            <DialogDescription>
              Selecione um item do catálogo para adicionar ao pedido
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <label className="text-sm font-medium mb-2 block">Item</label>
              <Select
                value={selectedItemForAdd?.id.toString() || ''}
                onValueChange={(value) => {
                  const item = availableItems.find(i => i.id === parseInt(value))
                  setSelectedItemForAdd(item || null)
                }}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Selecione um item" />
                </SelectTrigger>
                <SelectContent>
                  {availableItems.map((item) => (
                    <SelectItem key={item.id} value={item.id.toString()}>
                      {item.name} - {new Intl.NumberFormat('pt-BR', {
                        style: 'currency',
                        currency: item.currency,
                      }).format(item.unit_price)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            {selectedItemForAdd && (
              <div>
                <label className="text-sm font-medium mb-2 block">Quantidade</label>
                <Input
                  type="number"
                  min="1"
                  value={itemQuantity}
                  onChange={(e) => setItemQuantity(parseInt(e.target.value) || 1)}
                />
                <p className="text-xs text-muted-foreground mt-1">
                  Subtotal: {new Intl.NumberFormat('pt-BR', {
                    style: 'currency',
                    currency: selectedItemForAdd.currency,
                  }).format(selectedItemForAdd.unit_price * itemQuantity)}
                </p>
              </div>
            )}
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setShowItemsModal(false)}>
              Cancelar
            </Button>
            <Button
              type="button"
              onClick={handleAddItem}
              disabled={!selectedItemForAdd}
            >
              Adicionar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}

