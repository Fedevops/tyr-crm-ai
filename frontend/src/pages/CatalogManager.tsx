import { useState, useEffect, useMemo } from 'react'
import { itemsApi } from '@/lib/api'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { Label } from '@/components/ui/label'
import { Badge } from '@/components/ui/badge'
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
import { Switch } from '@/components/ui/switch'
import { useToast } from '@/components/ui/use-toast'
import {
  Plus,
  Trash2,
  Edit,
  Search,
  Package,
  AlertTriangle,
  TrendingUp,
  X,
  Warehouse,
  XCircle,
  Eye,
  Calendar,
  DollarSign,
  BarChart3
} from 'lucide-react'

interface Item {
  id: number
  name: string
  sku: string | null
  description: string | null
  image_url: string | null
  type: 'product' | 'service'
  cost_price: number | null
  unit_price: number
  currency: string
  track_stock: boolean
  stock_quantity: number | null
  low_stock_threshold: number | null
  margin_percentage: number | null
  owner_id: number
  created_by_id: number
  created_at: string
  updated_at: string
}

export function CatalogManager() {
  const { toast } = useToast()
  const [items, setItems] = useState<Item[]>([])
  const [loading, setLoading] = useState(true)
  const [showForm, setShowForm] = useState(false)
  const [editingId, setEditingId] = useState<number | null>(null)
  const [searchTerm, setSearchTerm] = useState('')
  const [typeFilter, setTypeFilter] = useState<'all' | 'product' | 'service'>('all')
  const [lowStockFilter, setLowStockFilter] = useState<boolean | null>(null)
  
  // Stock adjustment modal
  const [showStockModal, setShowStockModal] = useState(false)
  const [selectedItemForStock, setSelectedItemForStock] = useState<Item | null>(null)
  const [stockAdjustment, setStockAdjustment] = useState({
    quantity_change: 0,
    transaction_type: 'adjustment' as 'in' | 'out' | 'adjustment' | 'sale' | 'return',
    reason: ''
  })

  // Item detail modal
  const [showDetailModal, setShowDetailModal] = useState(false)
  const [selectedItemDetail, setSelectedItemDetail] = useState<Item | null>(null)
  const [stockHistory, setStockHistory] = useState<any[]>([])
  const [loadingHistory, setLoadingHistory] = useState(false)

  const [formData, setFormData] = useState({
    name: '',
    sku: '',
    description: '',
    image_url: '',
    type: 'product' as 'product' | 'service',
    cost_price: '',
    unit_price: '',
    currency: 'BRL',
    track_stock: false,
    stock_quantity: '',
    low_stock_threshold: '',
  })

  const fetchItems = async () => {
    setLoading(true)
    try {
      const params: any = {}
      if (typeFilter !== 'all') {
        params.type = typeFilter
      }
      if (lowStockFilter !== null) {
        params.low_stock = lowStockFilter
      }
      if (searchTerm) {
        params.search = searchTerm
      }
      
      const response = await itemsApi.getItems(params)
      const itemsData = Array.isArray(response.data) ? response.data : []
      setItems(itemsData)
    } catch (error: any) {
      console.error('Erro ao buscar itens:', error)
      toast({
        title: 'Erro',
        description: error.response?.data?.detail || 'Não foi possível carregar os itens.',
        variant: 'destructive',
      })
      setItems([])
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    fetchItems()
  }, [typeFilter, lowStockFilter, searchTerm])

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    
    try {
      const payload: any = {
        name: formData.name,
        sku: formData.sku || undefined,
        description: formData.description || undefined,
        image_url: formData.image_url || undefined,
        type: formData.type,
        unit_price: parseFloat(formData.unit_price),
        currency: formData.currency,
      }

      if (formData.cost_price) {
        payload.cost_price = parseFloat(formData.cost_price)
      }

      if (formData.type === 'product') {
        payload.track_stock = formData.track_stock
        if (formData.track_stock) {
          payload.stock_quantity = formData.stock_quantity ? parseInt(formData.stock_quantity) : 0
          payload.low_stock_threshold = formData.low_stock_threshold ? parseInt(formData.low_stock_threshold) : undefined
        }
      } else {
        payload.track_stock = false
      }

      if (editingId) {
        await itemsApi.updateItem(editingId, payload)
        toast({
          title: 'Sucesso',
          description: 'Item atualizado com sucesso.',
        })
      } else {
        await itemsApi.createItem(payload)
        toast({
          title: 'Sucesso',
          description: 'Item criado com sucesso.',
        })
      }

      setShowForm(false)
      resetForm()
      fetchItems()
    } catch (error: any) {
      console.error('Erro ao salvar item:', error)
      toast({
        title: 'Erro',
        description: error.response?.data?.detail || 'Não foi possível salvar o item.',
        variant: 'destructive',
      })
    }
  }

  const handleEdit = (item: Item) => {
    setEditingId(item.id)
    setFormData({
      name: item.name,
      sku: item.sku || '',
      description: item.description || '',
      image_url: item.image_url || '',
      type: item.type,
      cost_price: item.cost_price?.toString() || '',
      unit_price: item.unit_price.toString(),
      currency: item.currency,
      track_stock: item.track_stock,
      stock_quantity: item.stock_quantity?.toString() || '',
      low_stock_threshold: item.low_stock_threshold?.toString() || '',
    })
    setShowForm(true)
  }

  const handleDelete = async (id: number) => {
    if (!confirm('Tem certeza que deseja excluir este item?')) {
      return
    }

    try {
      await itemsApi.deleteItem(id)
      toast({
        title: 'Sucesso',
        description: 'Item excluído com sucesso.',
      })
      fetchItems()
    } catch (error: any) {
      console.error('Erro ao excluir item:', error)
      toast({
        title: 'Erro',
        description: error.response?.data?.detail || 'Não foi possível excluir o item.',
        variant: 'destructive',
      })
    }
  }

  const handleStockAdjust = async () => {
    if (!selectedItemForStock) return

    try {
      await itemsApi.adjustStock(selectedItemForStock.id, {
        quantity_change: stockAdjustment.quantity_change,
        transaction_type: stockAdjustment.transaction_type,
        reason: stockAdjustment.reason || undefined,
      })
      toast({
        title: 'Sucesso',
        description: 'Estoque ajustado com sucesso.',
      })
      setShowStockModal(false)
      setSelectedItemForStock(null)
      setStockAdjustment({ quantity_change: 0, transaction_type: 'adjustment', reason: '' })
      fetchItems()
    } catch (error: any) {
      console.error('Erro ao ajustar estoque:', error)
      toast({
        title: 'Erro',
        description: error.response?.data?.detail || 'Não foi possível ajustar o estoque.',
        variant: 'destructive',
      })
    }
  }

  const resetForm = () => {
    setEditingId(null)
    setFormData({
      name: '',
      sku: '',
      description: '',
      image_url: '',
      type: 'product',
      cost_price: '',
      unit_price: '',
      currency: 'BRL',
      track_stock: false,
      stock_quantity: '',
      low_stock_threshold: '',
    })
  }

  const fetchStockHistory = async (itemId: number) => {
    setLoadingHistory(true)
    try {
      const response = await itemsApi.getStockHistory(itemId, { skip: 0, limit: 50 })
      setStockHistory(response.data || [])
    } catch (error) {
      console.error('Erro ao buscar histórico de estoque:', error)
      setStockHistory([])
    } finally {
      setLoadingHistory(false)
    }
  }

  const calculateMargin = useMemo(() => {
    if (!formData.cost_price || !formData.unit_price) return null
    const cost = parseFloat(formData.cost_price)
    const unit = parseFloat(formData.unit_price)
    if (cost <= 0) return null
    return ((unit - cost) / cost * 100).toFixed(2)
  }, [formData.cost_price, formData.unit_price])

  const isLowStock = (item: Item) => {
    if (!item.track_stock || item.stock_quantity === null || item.low_stock_threshold === null) {
      return false
    }
    return item.stock_quantity <= item.low_stock_threshold
  }

  const filteredItems = useMemo(() => {
    return items.filter(item => {
      if (typeFilter !== 'all' && item.type !== typeFilter) return false
      if (lowStockFilter === true && !isLowStock(item)) return false
      if (lowStockFilter === false && isLowStock(item)) return false
      return true
    })
  }, [items, typeFilter, lowStockFilter])

  return (
    <div className="space-y-6 p-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold">Catálogo de Produtos e Serviços</h1>
          <p className="text-muted-foreground mt-1">
            Gerencie seus produtos e serviços, controle estoque e calcule margens
          </p>
        </div>
        <Button onClick={() => { resetForm(); setShowForm(true) }}>
          <Plus className="mr-2 h-4 w-4" />
          Novo Item
        </Button>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Filtros</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex gap-4">
            <div className="flex-1">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-muted-foreground h-4 w-4" />
                <Input
                  placeholder="Buscar por nome, SKU ou descrição..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="pl-10"
                />
              </div>
            </div>
            <Select value={typeFilter} onValueChange={(value: any) => setTypeFilter(value)}>
              <SelectTrigger className="w-[180px]">
                <SelectValue placeholder="Tipo" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todos os tipos</SelectItem>
                <SelectItem value="product">Produtos</SelectItem>
                <SelectItem value="service">Serviços</SelectItem>
              </SelectContent>
            </Select>
            <Select 
              value={lowStockFilter === null ? 'all' : lowStockFilter ? 'low' : 'normal'} 
              onValueChange={(value) => {
                if (value === 'all') setLowStockFilter(null)
                else if (value === 'low') setLowStockFilter(true)
                else setLowStockFilter(false)
              }}
            >
              <SelectTrigger className="w-[180px]">
                <SelectValue placeholder="Estoque" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todos</SelectItem>
                <SelectItem value="low">Estoque baixo</SelectItem>
                <SelectItem value="normal">Estoque normal</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Itens ({filteredItems.length})</CardTitle>
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className="text-center py-8">Carregando...</div>
          ) : filteredItems.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground">
              Nenhum item encontrado.
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-[80px]">Foto</TableHead>
                  <TableHead>Nome / SKU</TableHead>
                  <TableHead>Tipo</TableHead>
                  <TableHead>Preço Venda</TableHead>
                  <TableHead>Custo</TableHead>
                  <TableHead>Margem</TableHead>
                  <TableHead>Estoque</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="text-right">Ações</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredItems.map((item) => (
                  <TableRow 
                    key={item.id}
                    className="cursor-pointer hover:bg-accent/50"
                    onClick={(e) => {
                      // Não abrir modal se clicar nos botões de ação
                      if ((e.target as HTMLElement).closest('button')) {
                        return
                      }
                      setSelectedItemDetail(item)
                      setShowDetailModal(true)
                      if (item.track_stock) {
                        fetchStockHistory(item.id)
                      }
                    }}
                  >
                    <TableCell>
                      {item.image_url ? (
                        <img
                          src={item.image_url.startsWith('http') ? item.image_url : `${import.meta.env.VITE_API_URL || 'http://localhost:8000'}${item.image_url}`}
                          alt={item.name}
                          className="w-16 h-16 object-cover rounded-md border"
                          onError={(e) => {
                            (e.target as HTMLImageElement).style.display = 'none'
                          }}
                        />
                      ) : (
                        <div className="w-16 h-16 bg-muted rounded-md border flex items-center justify-center">
                          <Package className="h-6 w-6 text-muted-foreground" />
                        </div>
                      )}
                    </TableCell>
                    <TableCell>
                      <div>
                        <div className="font-medium">{item.name}</div>
                        {item.sku && (
                          <div className="text-sm text-muted-foreground">SKU: {item.sku}</div>
                        )}
                      </div>
                    </TableCell>
                    <TableCell>
                      <Badge variant={item.type === 'product' ? 'default' : 'secondary'}>
                        {item.type === 'product' ? 'Produto' : 'Serviço'}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      {new Intl.NumberFormat('pt-BR', {
                        style: 'currency',
                        currency: item.currency,
                      }).format(item.unit_price)}
                    </TableCell>
                    <TableCell>
                      {item.cost_price
                        ? new Intl.NumberFormat('pt-BR', {
                            style: 'currency',
                            currency: item.currency,
                          }).format(item.cost_price)
                        : '-'}
                    </TableCell>
                    <TableCell>
                      {item.margin_percentage !== null ? (
                        <div className="flex items-center gap-1">
                          <TrendingUp className="h-4 w-4 text-green-600" />
                          <span className="font-medium text-green-600">
                            {item.margin_percentage.toFixed(2)}%
                          </span>
                        </div>
                      ) : (
                        '-'
                      )}
                    </TableCell>
                    <TableCell>
                      {item.track_stock ? (
                        <div className="flex items-center gap-2">
                          <Warehouse className="h-4 w-4" />
                          <span>{item.stock_quantity ?? 0}</span>
                        </div>
                      ) : (
                        '-'
                      )}
                    </TableCell>
                    <TableCell>
                      {isLowStock(item) && (
                        <Badge variant="destructive" className="flex items-center gap-1 w-fit">
                          <AlertTriangle className="h-3 w-3" />
                          Estoque baixo
                        </Badge>
                      )}
                    </TableCell>
                    <TableCell className="text-right">
                      <div className="flex justify-end gap-2">
                        {item.track_stock && (
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => {
                              setSelectedItemForStock(item)
                              setShowStockModal(true)
                            }}
                          >
                            <Package className="h-4 w-4" />
                          </Button>
                        )}
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => handleEdit(item)}
                        >
                          <Edit className="h-4 w-4" />
                        </Button>
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => handleDelete(item.id)}
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      {/* Form Modal */}
      <Dialog open={showForm} onOpenChange={setShowForm}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{editingId ? 'Editar Item' : 'Novo Item'}</DialogTitle>
            <DialogDescription>
              {editingId ? 'Atualize as informações do item' : 'Adicione um novo produto ou serviço ao catálogo'}
            </DialogDescription>
          </DialogHeader>
          <form onSubmit={handleSubmit}>
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <Label htmlFor="name">Nome *</Label>
                  <Input
                    id="name"
                    value={formData.name}
                    onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                    required
                  />
                </div>
                <div>
                  <Label htmlFor="sku">SKU</Label>
                  <Input
                    id="sku"
                    value={formData.sku}
                    onChange={(e) => setFormData({ ...formData, sku: e.target.value })}
                    placeholder="Código único"
                  />
                </div>
              </div>

              <div>
                <Label htmlFor="description">Descrição</Label>
                <Textarea
                  id="description"
                  value={formData.description}
                  onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                  rows={3}
                />
              </div>

              <div>
                <Label htmlFor="image">Imagem do Produto</Label>
                <div className="space-y-2">
                  <Input
                    id="image"
                    type="file"
                    accept="image/*"
                    onChange={async (e) => {
                      const file = e.target.files?.[0]
                      if (file) {
                        try {
                          setLoading(true)
                          const response = await itemsApi.uploadImage(file)
                          setFormData({ ...formData, image_url: response.data.image_url })
                          toast({
                            title: 'Sucesso',
                            description: 'Imagem enviada com sucesso!',
                            variant: 'default',
                          })
                        } catch (error: any) {
                          console.error('Erro ao fazer upload:', error)
                          toast({
                            title: 'Erro',
                            description: error.response?.data?.detail || 'Erro ao fazer upload da imagem',
                            variant: 'destructive',
                          })
                        } finally {
                          setLoading(false)
                        }
                      }
                    }}
                  />
                  <Input
                    id="image_url"
                    type="url"
                    value={formData.image_url}
                    onChange={(e) => setFormData({ ...formData, image_url: e.target.value })}
                    placeholder="Ou cole uma URL da imagem"
                  />
                  {formData.image_url && (
                    <div className="mt-2">
                      <img
                        src={formData.image_url.startsWith('http') ? formData.image_url : `${import.meta.env.VITE_API_URL || 'http://localhost:8000'}${formData.image_url}`}
                        alt="Preview"
                        className="w-32 h-32 object-cover rounded-md border"
                        onError={(e) => {
                          (e.target as HTMLImageElement).style.display = 'none'
                        }}
                      />
                    </div>
                  )}
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <Label htmlFor="type">Tipo *</Label>
                  <Select
                    value={formData.type}
                    onValueChange={(value: 'product' | 'service') => {
                      setFormData({
                        ...formData,
                        type: value,
                        track_stock: value === 'service' ? false : formData.track_stock,
                      })
                    }}
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="product">Produto</SelectItem>
                      <SelectItem value="service">Serviço</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label htmlFor="currency">Moeda *</Label>
                  <Select
                    value={formData.currency}
                    onValueChange={(value) => setFormData({ ...formData, currency: value })}
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="BRL">BRL (R$)</SelectItem>
                      <SelectItem value="USD">USD ($)</SelectItem>
                      <SelectItem value="EUR">EUR (€)</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <Label htmlFor="cost_price">Preço de Custo</Label>
                  <Input
                    id="cost_price"
                    type="number"
                    step="0.01"
                    min="0"
                    value={formData.cost_price}
                    onChange={(e) => setFormData({ ...formData, cost_price: e.target.value })}
                    placeholder="0.00"
                  />
                </div>
                <div>
                  <Label htmlFor="unit_price">Preço de Venda *</Label>
                  <Input
                    id="unit_price"
                    type="number"
                    step="0.01"
                    min="0"
                    value={formData.unit_price}
                    onChange={(e) => setFormData({ ...formData, unit_price: e.target.value })}
                    required
                    placeholder="0.00"
                  />
                </div>
              </div>

              {calculateMargin !== null && (
                <div className="p-3 bg-green-50 dark:bg-green-900/20 rounded-md">
                  <div className="flex items-center gap-2">
                    <TrendingUp className="h-4 w-4 text-green-600" />
                    <span className="font-medium text-green-600">
                      Margem: {calculateMargin}%
                    </span>
                  </div>
                </div>
              )}

              {formData.type === 'product' && (
                <>
                  <div className="flex items-center space-x-2">
                    <Switch
                      id="track_stock"
                      checked={formData.track_stock}
                      onCheckedChange={(checked) =>
                        setFormData({ ...formData, track_stock: checked })
                      }
                    />
                    <Label htmlFor="track_stock">Controlar Estoque</Label>
                  </div>

                  {formData.track_stock && (
                    <div className="grid grid-cols-2 gap-4">
                      <div>
                        <Label htmlFor="stock_quantity">Quantidade em Estoque</Label>
                        <Input
                          id="stock_quantity"
                          type="number"
                          min="0"
                          value={formData.stock_quantity}
                          onChange={(e) => setFormData({ ...formData, stock_quantity: e.target.value })}
                          placeholder="0"
                        />
                      </div>
                      <div>
                        <Label htmlFor="low_stock_threshold">Limite de Estoque Baixo</Label>
                        <Input
                          id="low_stock_threshold"
                          type="number"
                          min="0"
                          value={formData.low_stock_threshold}
                          onChange={(e) => setFormData({ ...formData, low_stock_threshold: e.target.value })}
                          placeholder="0"
                        />
                      </div>
                    </div>
                  )}
                </>
              )}
            </div>
            <DialogFooter className="mt-6">
              <Button type="button" variant="outline" onClick={() => { setShowForm(false); resetForm() }}>
                Cancelar
              </Button>
              <Button type="submit">{editingId ? 'Atualizar' : 'Criar'}</Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* Stock Adjustment Modal */}
      <Dialog open={showStockModal} onOpenChange={setShowStockModal}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Ajustar Estoque</DialogTitle>
            <DialogDescription>
              {selectedItemForStock && (
                <>Ajustar estoque de: <strong>{selectedItemForStock.name}</strong></>
              )}
            </DialogDescription>
          </DialogHeader>
          {selectedItemForStock && (
            <div className="space-y-4">
              <div>
                <Label>Estoque Atual</Label>
                <div className="text-2xl font-bold">{selectedItemForStock.stock_quantity ?? 0}</div>
              </div>
              <div>
                <Label htmlFor="transaction_type">Tipo de Transação</Label>
                <Select
                  value={stockAdjustment.transaction_type}
                  onValueChange={(value: any) =>
                    setStockAdjustment({ ...stockAdjustment, transaction_type: value })
                  }
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="in">Entrada</SelectItem>
                    <SelectItem value="out">Saída</SelectItem>
                    <SelectItem value="adjustment">Ajuste Manual</SelectItem>
                    <SelectItem value="sale">Venda</SelectItem>
                    <SelectItem value="return">Devolução</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label htmlFor="quantity_change">
                  {stockAdjustment.transaction_type === 'in' || stockAdjustment.transaction_type === 'return'
                    ? 'Quantidade a Adicionar'
                    : 'Quantidade a Remover'}
                </Label>
                <Input
                  id="quantity_change"
                  type="number"
                  min={stockAdjustment.transaction_type === 'in' || stockAdjustment.transaction_type === 'return' ? 1 : undefined}
                  max={stockAdjustment.transaction_type === 'out' || stockAdjustment.transaction_type === 'sale' ? selectedItemForStock.stock_quantity ?? 0 : undefined}
                  value={stockAdjustment.quantity_change}
                  onChange={(e) => {
                    const value = parseInt(e.target.value) || 0
                    const absValue = Math.abs(value)
                    setStockAdjustment({
                      ...stockAdjustment,
                      quantity_change: stockAdjustment.transaction_type === 'in' || stockAdjustment.transaction_type === 'return'
                        ? absValue
                        : -absValue,
                    })
                  }}
                />
                {stockAdjustment.quantity_change !== 0 && (
                  <div className="mt-2 text-sm text-muted-foreground">
                    Novo estoque: {selectedItemForStock.stock_quantity! + stockAdjustment.quantity_change}
                  </div>
                )}
              </div>
              <div>
                <Label htmlFor="reason">Motivo (opcional)</Label>
                <Textarea
                  id="reason"
                  value={stockAdjustment.reason}
                  onChange={(e) => setStockAdjustment({ ...stockAdjustment, reason: e.target.value })}
                  rows={2}
                />
              </div>
            </div>
          )}
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setShowStockModal(false)}>
              Cancelar
            </Button>
            <Button
              onClick={handleStockAdjust}
              disabled={stockAdjustment.quantity_change === 0}
            >
              Ajustar Estoque
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Modal de Detalhes do Item */}
      {showDetailModal && selectedItemDetail && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
          <Card className="w-full max-w-4xl h-[90vh] overflow-hidden flex flex-col">
            <CardHeader className="border-b flex-shrink-0">
              <div className="flex items-center justify-between">
                <CardTitle className="text-2xl">Detalhes do {selectedItemDetail.type === 'product' ? 'Produto' : 'Serviço'}</CardTitle>
                <div className="flex items-center gap-2">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => {
                      handleEdit(selectedItemDetail)
                      setShowDetailModal(false)
                      setShowForm(true)
                    }}
                  >
                    <Edit className="h-4 w-4 mr-2" />
                    Editar
                  </Button>
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={() => {
                      setShowDetailModal(false)
                      setSelectedItemDetail(null)
                      setStockHistory([])
                    }}
                  >
                    <XCircle className="h-5 w-5" />
                  </Button>
                </div>
              </div>
            </CardHeader>
            
            <CardContent className="flex-1 overflow-y-auto p-6">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                {/* Imagem */}
                <div className="md:col-span-2">
                  {selectedItemDetail.image_url ? (
                    <img
                      src={selectedItemDetail.image_url.startsWith('http') ? selectedItemDetail.image_url : `${import.meta.env.VITE_API_URL || 'http://localhost:8000'}${selectedItemDetail.image_url}`}
                      alt={selectedItemDetail.name}
                      className="w-full h-64 object-cover rounded-lg border"
                      onError={(e) => {
                        (e.target as HTMLImageElement).style.display = 'none'
                      }}
                    />
                  ) : (
                    <div className="w-full h-64 bg-muted rounded-lg border flex items-center justify-center">
                      <Package className="h-16 w-16 text-muted-foreground" />
                    </div>
                  )}
                </div>

                {/* Informações Básicas */}
                <div className="space-y-4">
                  <div>
                    <Label className="text-sm font-semibold text-muted-foreground">Nome</Label>
                    <p className="text-lg font-medium">{selectedItemDetail.name}</p>
                  </div>

                  {selectedItemDetail.sku && (
                    <div>
                      <Label className="text-sm font-semibold text-muted-foreground">SKU</Label>
                      <p className="text-base">{selectedItemDetail.sku}</p>
                    </div>
                  )}

                  <div>
                    <Label className="text-sm font-semibold text-muted-foreground">Tipo</Label>
                    <div className="mt-1">
                      <Badge variant={selectedItemDetail.type === 'product' ? 'default' : 'secondary'}>
                        {selectedItemDetail.type === 'product' ? 'Produto' : 'Serviço'}
                      </Badge>
                    </div>
                  </div>

                  {selectedItemDetail.description && (
                    <div>
                      <Label className="text-sm font-semibold text-muted-foreground">Descrição</Label>
                      <p className="text-base text-muted-foreground whitespace-pre-wrap">{selectedItemDetail.description}</p>
                    </div>
                  )}
                </div>

                {/* Informações Financeiras */}
                <div className="space-y-4">
                  <div>
                    <Label className="text-sm font-semibold text-muted-foreground">Preço de Venda</Label>
                    <p className="text-2xl font-bold text-green-600">
                      {new Intl.NumberFormat('pt-BR', {
                        style: 'currency',
                        currency: selectedItemDetail.currency,
                      }).format(selectedItemDetail.unit_price)}
                    </p>
                  </div>

                  {selectedItemDetail.cost_price && (
                    <div>
                      <Label className="text-sm font-semibold text-muted-foreground">Preço de Custo</Label>
                      <p className="text-xl font-semibold">
                        {new Intl.NumberFormat('pt-BR', {
                          style: 'currency',
                          currency: selectedItemDetail.currency,
                        }).format(selectedItemDetail.cost_price)}
                      </p>
                    </div>
                  )}

                  {selectedItemDetail.margin_percentage !== null && (
                    <div>
                      <Label className="text-sm font-semibold text-muted-foreground">Margem</Label>
                      <div className="flex items-center gap-2">
                        <TrendingUp className="h-5 w-5 text-green-600" />
                        <p className="text-xl font-semibold text-green-600">
                          {selectedItemDetail.margin_percentage.toFixed(2)}%
                        </p>
                      </div>
                    </div>
                  )}

                  <div>
                    <Label className="text-sm font-semibold text-muted-foreground">Moeda</Label>
                    <p className="text-base">{selectedItemDetail.currency}</p>
                  </div>
                </div>

                {/* Informações de Estoque (apenas para produtos) */}
                {selectedItemDetail.type === 'product' && selectedItemDetail.track_stock && (
                  <div className="md:col-span-2 space-y-4">
                    <div className="border-t pt-4">
                      <Label className="text-lg font-semibold flex items-center gap-2 mb-4">
                        <Warehouse className="h-5 w-5" />
                        Controle de Estoque
                      </Label>
                      <div className="grid grid-cols-2 gap-4">
                        <div>
                          <Label className="text-sm font-semibold text-muted-foreground">Quantidade em Estoque</Label>
                          <p className="text-2xl font-bold">
                            {selectedItemDetail.stock_quantity ?? 0}
                          </p>
                        </div>
                        {selectedItemDetail.low_stock_threshold !== null && (
                          <div>
                            <Label className="text-sm font-semibold text-muted-foreground">Limite de Estoque Baixo</Label>
                            <p className="text-xl font-semibold">
                              {selectedItemDetail.low_stock_threshold}
                            </p>
                            {selectedItemDetail.stock_quantity !== null && 
                             selectedItemDetail.stock_quantity <= selectedItemDetail.low_stock_threshold && (
                              <Badge variant="destructive" className="mt-2">
                                <AlertTriangle className="h-3 w-3 mr-1" />
                                Estoque Baixo
                              </Badge>
                            )}
                          </div>
                        )}
                      </div>
                    </div>

                    {/* Histórico de Estoque */}
                    <div className="border-t pt-4">
                      <Label className="text-lg font-semibold flex items-center gap-2 mb-4">
                        <BarChart3 className="h-5 w-5" />
                        Histórico de Movimentações
                      </Label>
                      {loadingHistory ? (
                        <div className="text-center py-4">Carregando...</div>
                      ) : stockHistory.length === 0 ? (
                        <div className="text-center py-4 text-muted-foreground">
                          Nenhuma movimentação registrada
                        </div>
                      ) : (
                        <div className="space-y-2 max-h-64 overflow-y-auto">
                          {stockHistory.map((transaction: any) => (
                            <div
                              key={transaction.id}
                              className="flex items-center justify-between p-3 bg-muted rounded-lg"
                            >
                              <div className="flex-1">
                                <p className="font-medium">
                                  {transaction.transaction_type === 'in' && 'Entrada'}
                                  {transaction.transaction_type === 'out' && 'Saída'}
                                  {transaction.transaction_type === 'adjustment' && 'Ajuste'}
                                  {transaction.transaction_type === 'sale' && 'Venda'}
                                  {transaction.transaction_type === 'return' && 'Devolução'}
                                </p>
                                {transaction.reason && (
                                  <p className="text-sm text-muted-foreground">{transaction.reason}</p>
                                )}
                                <p className="text-xs text-muted-foreground">
                                  {new Date(transaction.created_at).toLocaleString('pt-BR')}
                                </p>
                              </div>
                              <div className="text-right">
                                <p className={`font-semibold ${transaction.quantity_change > 0 ? 'text-green-600' : 'text-red-600'}`}>
                                  {transaction.quantity_change > 0 ? '+' : ''}{transaction.quantity_change}
                                </p>
                                <p className="text-xs text-muted-foreground">
                                  Estoque: {transaction.new_quantity}
                                </p>
                              </div>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  </div>
                )}

                {/* Informações de Sistema */}
                <div className="md:col-span-2 border-t pt-4 space-y-2">
                  <Label className="text-sm font-semibold text-muted-foreground">Informações do Sistema</Label>
                  <div className="grid grid-cols-2 gap-4 text-sm">
                    <div>
                      <span className="text-muted-foreground">Criado em:</span>
                      <p>{new Date(selectedItemDetail.created_at).toLocaleString('pt-BR')}</p>
                    </div>
                    <div>
                      <span className="text-muted-foreground">Atualizado em:</span>
                      <p>{new Date(selectedItemDetail.updated_at).toLocaleString('pt-BR')}</p>
                    </div>
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>
      )}
    </div>
  )
}

