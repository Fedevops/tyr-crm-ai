import { useState, useEffect } from 'react'
import { useTranslation } from 'react-i18next'
import api, { proposalTemplatesApi, itemsApi } from '@/lib/api'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { AdvancedFilters } from '@/components/AdvancedFilters'
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
  Plus, 
  Trash2, 
  Edit, 
  Search, 
  Send,
  CheckCircle2,
  XCircle,
  FileText,
  DollarSign,
  Calendar,
  User,
  Filter,
  Download,
  X,
  FileDown,
  Package,
  PlusCircle,
  Trash2 as Trash2Icon
} from 'lucide-react'

interface Proposal {
  id: number
  opportunity_id: number
  template_id?: number | null
  title: string
  content: string
  items?: string | null  // JSON string
  amount: number
  currency: string
  valid_until: string | null
  status: 'draft' | 'sent' | 'accepted' | 'rejected' | 'expired'
  sent_at: string | null
  accepted_at: string | null
  rejected_at: string | null
  rejection_reason: string | null
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

interface ProposalItem {
  item_id: number
  name: string
  sku?: string | null
  type: string
  quantity: number
  unit_price: number
  subtotal: number
}

interface Item {
  id: number
  name: string
  sku: string | null
  image_url: string | null
  type: 'product' | 'service'
  unit_price: number
  currency: string
}

interface Opportunity {
  id: number
  name: string
  account_id: number
}

export function Proposals() {
  const { t } = useTranslation()
  const [proposals, setProposals] = useState<Proposal[]>([])
  const [opportunities, setOpportunities] = useState<Opportunity[]>([])
  const [templates, setTemplates] = useState<Array<{id: number, name: string, description?: string}>>([])
  const [loading, setLoading] = useState(true)
  const [showForm, setShowForm] = useState(false)
  const [editingId, setEditingId] = useState<number | null>(null)
  const [searchTerm, setSearchTerm] = useState('')
  const [statusFilter, setStatusFilter] = useState<'all' | 'draft' | 'sent' | 'accepted' | 'rejected' | 'expired'>('all')
  const [currentPage, setCurrentPage] = useState(1)
  const [pageSize, setPageSize] = useState(20)
  const [totalProposals, setTotalProposals] = useState(0)
  
  // Selection and bulk actions
  const [selectedProposals, setSelectedProposals] = useState<Set<number>>(new Set())
  
  // Detail modal
  const [showProposalDetailModal, setShowProposalDetailModal] = useState(false)
  const [selectedProposalDetail, setSelectedProposalDetail] = useState<Proposal | null>(null)
  const [activeTab, setActiveTab] = useState<'basicas' | 'oportunidade' | 'comentarios'>('basicas')
  const [proposalComments, setProposalComments] = useState<any[]>([])
  const [loadingComments, setLoadingComments] = useState(false)
  const [newComment, setNewComment] = useState('')
  const [addingComment, setAddingComment] = useState(false)
  
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
    opportunity_id: null as number | null,
    template_id: null as number | null,
    title: '',
    content: '',
    amount: '',
    currency: 'BRL',
    valid_until: '',
    notes: '',
    owner_id: null as number | null
  })
  const [users, setUsers] = useState<Array<{id: number, full_name: string, email: string}>>([])
  
  // Items management
  const [proposalItems, setProposalItems] = useState<ProposalItem[]>([])
  const [availableItems, setAvailableItems] = useState<Item[]>([])
  const [showItemsModal, setShowItemsModal] = useState(false)
  const [itemsSearchTerm, setItemsSearchTerm] = useState('')
  const [selectedItemForAdd, setSelectedItemForAdd] = useState<Item | null>(null)
  const [itemQuantity, setItemQuantity] = useState(1)

  useEffect(() => {
    fetchUsers()
    fetchOpportunities()
    fetchTemplates()
    fetchAvailableItems()
    fetchProposals()
  }, [currentPage, pageSize, searchTerm, statusFilter, advancedFilters, filterLogic])

  const fetchUsers = async () => {
    try {
      const response = await api.get('/api/users')
      setUsers(response.data)
    } catch (error) {
      console.error('Error fetching users:', error)
    }
  }

  const fetchOpportunities = async () => {
    try {
      const response = await api.get('/api/opportunities?limit=1000')
      setOpportunities(response.data)
    } catch (error) {
      console.error('Error fetching opportunities:', error)
    }
  }

  const fetchTemplates = async () => {
    try {
      const response = await proposalTemplatesApi.getTemplates(true) // Apenas templates ativos
      setTemplates(response.data || [])
    } catch (error) {
      console.error('Error fetching templates:', error)
    }
  }

  const fetchAvailableItems = async () => {
    try {
      const response = await itemsApi.getItems({ limit: 1000 })
      setAvailableItems(response.data || [])
    } catch (error) {
      console.error('Error fetching items:', error)
    }
  }

  const fetchProposals = async () => {
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
          
          if (statusFilter !== 'all') {
            params.status_filter = statusFilter
          }
          
          const queryString = new URLSearchParams(params).toString()
          const response = await api.get(`/api/proposals${queryString ? `?${queryString}` : ''}`)
          setProposals(response.data)
          
          const totalCount = response.headers['x-total-count']
          if (totalCount) {
            setTotalProposals(parseInt(totalCount, 10))
          } else {
            setTotalProposals(response.data.length)
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
        
        const response = await api.post('/api/proposals/filter', filtersRequest)
        setProposals(response.data)
        
        const totalCount = response.headers['x-total-count']
        if (totalCount) {
          setTotalProposals(parseInt(totalCount, 10))
        } else {
          setTotalProposals(response.data.length)
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
        
        if (statusFilter !== 'all') {
          params.status_filter = statusFilter
        }
        
        const queryString = new URLSearchParams(params).toString()
        const response = await api.get(`/api/proposals${queryString ? `?${queryString}` : ''}`)
        setProposals(response.data)
        
        const totalCount = response.headers['x-total-count']
        if (totalCount) {
          setTotalProposals(parseInt(totalCount, 10))
        } else {
          if (response.data.length < pageSize) {
            setTotalProposals((currentPage - 1) * pageSize + response.data.length)
          } else {
            setTotalProposals(currentPage * pageSize + 1)
          }
        }
      }
    } catch (error) {
      console.error('Error fetching proposals:', error)
    } finally {
      setLoading(false)
    }
  }

  const calculateProposalTotals = (items: ProposalItem[]) => {
    const subtotal = items.reduce((sum, item) => sum + item.subtotal, 0)
    return { subtotal, total: subtotal }
  }

  const handleAddItem = () => {
    if (!selectedItemForAdd) return
    
    const newItem: ProposalItem = {
      item_id: selectedItemForAdd.id,
      name: selectedItemForAdd.name,
      sku: selectedItemForAdd.sku,
      type: selectedItemForAdd.type,
      quantity: itemQuantity,
      unit_price: selectedItemForAdd.unit_price,
      subtotal: itemQuantity * selectedItemForAdd.unit_price,
    }
    
    setProposalItems([...proposalItems, newItem])
    setSelectedItemForAdd(null)
    setItemQuantity(1)
    setShowItemsModal(false)
    
    // Atualizar amount automaticamente
    const totals = calculateProposalTotals([...proposalItems, newItem])
    setFormData({ ...formData, amount: totals.total.toFixed(2) })
  }

  const handleRemoveItem = (index: number) => {
    const newItems = proposalItems.filter((_, i) => i !== index)
    setProposalItems(newItems)
    
    // Atualizar amount automaticamente
    const totals = calculateProposalTotals(newItems)
    setFormData({ ...formData, amount: totals.total.toFixed(2) })
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!formData.opportunity_id) {
      alert('Oportunidade é obrigatória')
      return
    }
    
    try {
      const payload: any = {
        opportunity_id: formData.opportunity_id,
        title: formData.title,
        amount: parseFloat(formData.amount),
        currency: formData.currency,
        valid_until: formData.valid_until || null,
        notes: formData.notes || null,
        owner_id: formData.owner_id || null
      }
      
      // Adicionar itens se houver
      if (proposalItems.length > 0) {
        payload.items = JSON.stringify(proposalItems.map(item => ({
          item_id: item.item_id,
          quantity: item.quantity,
          unit_price: item.unit_price
        })))
      }
      
      // Se template_id foi selecionado, enviar apenas template_id (backend gera o conteúdo)
      if (formData.template_id) {
        payload.template_id = formData.template_id
        // Não enviar content quando usar template - backend gera automaticamente
      } else {
        // Sem template, enviar conteúdo manual
        payload.content = formData.content || ''
      }
      
      if (editingId) {
        await api.put(`/api/proposals/${editingId}`, payload)
      } else {
        await api.post('/api/proposals', payload)
      }
      resetForm()
      fetchProposals()
    } catch (error: any) {
      console.error('Error saving proposal:', error)
      alert(error.response?.data?.detail || 'Erro ao salvar proposta')
    }
  }

  const handleEdit = (proposal: Proposal) => {
    setEditingId(proposal.id)
    setFormData({
      opportunity_id: proposal.opportunity_id,
      template_id: proposal.template_id || null,
      title: proposal.title || '',
      content: proposal.content || '',
      amount: String(proposal.amount),
      currency: proposal.currency || 'BRL',
      valid_until: proposal.valid_until ? proposal.valid_until.split('T')[0] : '',
      notes: proposal.notes || '',
      owner_id: proposal.owner_id || null
    })
    
    // Carregar itens se existirem
    if (proposal.items) {
      try {
        const itemsData = JSON.parse(proposal.items)
        if (itemsData.items && Array.isArray(itemsData.items)) {
          setProposalItems(itemsData.items)
        }
      } catch (error) {
        console.error('Error parsing proposal items:', error)
        setProposalItems([])
      }
    } else {
      setProposalItems([])
    }
    
    setShowForm(true)
  }

  const handleDelete = async (id: number) => {
    if (!confirm('Tem certeza que deseja excluir esta proposta?')) return
    
    try {
      await api.delete(`/api/proposals/${id}`)
      fetchProposals()
    } catch (error: any) {
      console.error('Error deleting proposal:', error)
      alert(error.response?.data?.detail || 'Erro ao excluir proposta')
    }
  }

  const handleSend = async (id: number) => {
    try {
      await api.post(`/api/proposals/${id}/send`)
      fetchProposals()
    } catch (error: any) {
      console.error('Error sending proposal:', error)
      alert(error.response?.data?.detail || 'Erro ao enviar proposta')
    }
  }

  const handleAccept = async (id: number) => {
    try {
      await api.post(`/api/proposals/${id}/accept`)
      fetchProposals()
    } catch (error: any) {
      console.error('Error accepting proposal:', error)
      alert(error.response?.data?.detail || 'Erro ao aceitar proposta')
    }
  }

  const handleReject = async (id: number) => {
    const reason = prompt('Motivo da rejeição (opcional):')
    try {
      await api.post(`/api/proposals/${id}/reject`, null, {
        params: { rejection_reason: reason || null }
      })
      fetchProposals()
    } catch (error: any) {
      console.error('Error rejecting proposal:', error)
      alert(error.response?.data?.detail || 'Erro ao rejeitar proposta')
    }
  }

  const resetForm = () => {
    setFormData({
      opportunity_id: null,
      template_id: null,
      title: '',
      content: '',
      amount: '',
      currency: 'BRL',
      valid_until: '',
      notes: '',
      owner_id: null
    })
    setProposalItems([])
    setEditingId(null)
    setShowForm(false)
  }

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'accepted': return 'bg-green-100 text-green-700 dark:bg-green-900 dark:text-green-200'
      case 'rejected': return 'bg-red-100 text-red-700 dark:bg-red-900 dark:text-red-200'
      case 'sent': return 'bg-blue-100 text-blue-700 dark:bg-blue-900 dark:text-blue-200'
      case 'expired': return 'bg-gray-100 text-gray-700 dark:bg-gray-900 dark:text-gray-200'
      default: return 'bg-yellow-100 text-yellow-700 dark:bg-yellow-900 dark:text-yellow-200'
    }
  }

  const getStatusLabel = (status: string) => {
    switch (status) {
      case 'draft': return 'Rascunho'
      case 'sent': return 'Enviada'
      case 'accepted': return 'Aceita'
      case 'rejected': return 'Rejeitada'
      case 'expired': return 'Expirada'
      default: return status
    }
  }

  // Selection handlers
  const handleSelectAll = () => {
    if (selectedProposals.size === proposals.length) {
      setSelectedProposals(new Set())
    } else {
      setSelectedProposals(new Set(proposals.map(p => p.id)))
    }
  }

  const handleSelectProposal = (proposalId: number) => {
    const newSelected = new Set(selectedProposals)
    if (newSelected.has(proposalId)) {
      newSelected.delete(proposalId)
    } else {
      newSelected.add(proposalId)
    }
    setSelectedProposals(newSelected)
  }

  // Bulk actions
  const handleBulkDelete = async () => {
    const selected = Array.from(selectedProposals)
    if (selected.length === 0) {
      alert('Selecione pelo menos uma proposta')
      return
    }
    
    if (!confirm(`Tem certeza que deseja excluir ${selected.length} proposta(s)?`)) return
    
    try {
      await Promise.all(selected.map(id => api.delete(`/api/proposals/${id}`)))
      setSelectedProposals(new Set())
      fetchProposals()
    } catch (error: any) {
      console.error('Error bulk deleting proposals:', error)
      alert('Erro ao excluir propostas. Tente novamente.')
    }
  }

  const handleExportSelected = () => {
    const selected = proposals.filter(p => selectedProposals.has(p.id))
    if (selected.length === 0) {
      alert('Selecione pelo menos uma proposta')
      return
    }
    
    // Criar CSV
    const headers = ['Título', 'Oportunidade', 'Valor', 'Status', 'Válida até', 'Enviada em']
    const rows = selected.map(p => {
      const opp = opportunities.find(o => o.id === p.opportunity_id)
      return [
        p.title || '',
        opp?.name || '',
        p.amount ? `${p.currency} ${p.amount}` : '',
        getStatusLabel(p.status),
        p.valid_until ? new Date(p.valid_until).toLocaleDateString('pt-BR') : '',
        p.sent_at ? new Date(p.sent_at).toLocaleDateString('pt-BR') : ''
      ]
    })
    
    const csv = [headers.join(','), ...rows.map(r => r.map(cell => `"${cell}"`).join(','))].join('\n')
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8-sig;' })
    const url = window.URL.createObjectURL(blob)
    const link = document.createElement('a')
    link.href = url
    link.setAttribute('download', `propostas_${new Date().toISOString().split('T')[0]}.csv`)
    document.body.appendChild(link)
    link.click()
    link.remove()
    window.URL.revokeObjectURL(url)
  }

  const handleExportPDF = async (proposal: Proposal) => {
  try {
    let content = proposal.content || '<p>Nenhum conteúdo disponível.</p>';
    
    // Remover elementos de interface
    const tempDiv = document.createElement('div');
    tempDiv.innerHTML = content;
    const elementsToRemove = tempDiv.querySelectorAll('button, a[href="#"], .btn, .button, nav, header, .topbar, .actions');
    elementsToRemove.forEach(el => el.remove());
    content = tempDiv.innerHTML;

    // Parse e renderizar itens se existirem
    let itemsTableHTML = '';
    if (proposal.items) {
      try {
        const itemsData = JSON.parse(proposal.items);
        if (itemsData.items && Array.isArray(itemsData.items) && itemsData.items.length > 0) {
          itemsTableHTML = `
            <div style="margin: 20px 0; page-break-inside: avoid;">
              <h3 style="margin-bottom: 12px;">Itens da Proposta</h3>
              <table class="table" style="width: 100%; border-collapse: collapse; margin: 10px 0; border: 1px solid rgba(17, 24, 39, 0.12); border-radius: 10px; overflow: hidden;">
                <thead>
                  <tr>
                    <th style="padding: 8px 10px; background: rgba(21, 79, 161, 0.06); font-family: 'Orbitron', system-ui, sans-serif; letter-spacing: 0.04em; font-size: 10px; text-transform: uppercase; color: #0B1220; font-weight: 600; text-align: left;">Item</th>
                    <th style="padding: 8px 10px; background: rgba(21, 79, 161, 0.06); font-family: 'Orbitron', system-ui, sans-serif; letter-spacing: 0.04em; font-size: 10px; text-transform: uppercase; color: #0B1220; font-weight: 600; text-align: right;">Qtd</th>
                    <th style="padding: 8px 10px; background: rgba(21, 79, 161, 0.06); font-family: 'Orbitron', system-ui, sans-serif; letter-spacing: 0.04em; font-size: 10px; text-transform: uppercase; color: #0B1220; font-weight: 600; text-align: right;">Preço Unit.</th>
                    <th style="padding: 8px 10px; background: rgba(21, 79, 161, 0.06); font-family: 'Orbitron', system-ui, sans-serif; letter-spacing: 0.04em; font-size: 10px; text-transform: uppercase; color: #0B1220; font-weight: 600; text-align: right;">Total</th>
                  </tr>
                </thead>
                <tbody>
                  ${itemsData.items.map((item: ProposalItem) => `
                    <tr style="page-break-inside: avoid;">
                      <td style="padding: 8px 10px; border-bottom: 1px solid rgba(17, 24, 39, 0.08); vertical-align: top; font-size: 11px;">
                        <div style="font-weight: 600;">${item.name}</div>
                        ${item.sku ? `<div style="font-size: 10px; color: rgba(11, 18, 32, 0.62);">SKU: ${item.sku}</div>` : ''}
                      </td>
                      <td style="padding: 8px 10px; border-bottom: 1px solid rgba(17, 24, 39, 0.08); vertical-align: top; font-size: 11px; text-align: right;">${item.quantity}</td>
                      <td style="padding: 8px 10px; border-bottom: 1px solid rgba(17, 24, 39, 0.08); vertical-align: top; font-size: 11px; text-align: right;">${new Intl.NumberFormat('pt-BR', { style: 'currency', currency: proposal.currency }).format(item.unit_price)}</td>
                      <td style="padding: 8px 10px; border-bottom: 1px solid rgba(17, 24, 39, 0.08); vertical-align: top; font-size: 11px; text-align: right; font-weight: 600;">${new Intl.NumberFormat('pt-BR', { style: 'currency', currency: proposal.currency }).format(item.subtotal)}</td>
                    </tr>
                  `).join('')}
                </tbody>
                <tfoot>
                  <tr style="background: rgba(21, 79, 161, 0.06); font-weight: 700;">
                    <td colspan="3" style="padding: 12px 10px; text-align: right; font-size: 12px; font-family: 'Orbitron', system-ui, sans-serif;">TOTAL</td>
                    <td style="padding: 12px 10px; text-align: right; font-size: 14px; font-family: 'Orbitron', system-ui, sans-serif;">${new Intl.NumberFormat('pt-BR', { style: 'currency', currency: proposal.currency }).format(itemsData.total || itemsData.subtotal || 0)}</td>
                  </tr>
                </tfoot>
              </table>
            </div>
          `;
        }
      } catch (error) {
        console.error('Error parsing proposal items:', error);
      }
    }

    // Criar janela de impressão
    const printWindow = window.open('', '_blank');
    if (!printWindow) {
      alert('Por favor, permita pop-ups para gerar o PDF');
      return;
    }

    printWindow.document.write(`
      <!DOCTYPE html>
      <html lang="pt-br">
      <head>
        <meta charset="UTF-8">
        <title>${proposal.title} - TYR</title>
        <link rel="preconnect" href="https://fonts.googleapis.com">
        <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
        <link href="https://fonts.googleapis.com/css2?family=Montserrat:wght@300;400;500;600;700&family=Orbitron:wght@500;600;700&display=swap" rel="stylesheet">
        <style>
          @page {
            size: A4;
            margin: 15mm 12mm;
          }
          
          * {
            margin: 0;
            padding: 0;
            box-sizing: border-box;
          }
          
          body {
            font-family: 'Montserrat', system-ui, sans-serif;
            font-size: 11pt;
            line-height: 1.6;
            color: #0B1220;
            background: #FFFFFF;
            padding: 0;
          }
          
          /* Remover elementos de interface */
          .topbar, .btn, .actions, button {
            display: none !important;
          }
          
          /* Páginas */
          .page {
            width: 100%;
            min-height: 100vh;
            padding: 0;
            page-break-after: always;
            page-break-inside: avoid;
          }
          
          .page:last-child {
            page-break-after: auto;
          }
          
          /* Tipografia */
          .kicker {
            display: inline-flex;
            align-items: center;
            gap: 6px;
            color: rgba(11, 18, 32, 0.62);
            font-weight: 600;
            letter-spacing: 0.08em;
            text-transform: uppercase;
            font-size: 10px;
            margin-bottom: 10px;
          }
          
          .dot {
            width: 5px;
            height: 5px;
            border-radius: 50%;
            background: #3672F8;
          }
          
          h1, h2, h3 {
            font-family: 'Orbitron', system-ui, sans-serif;
            letter-spacing: 0.02em;
            margin: 10px 0 8px;
            color: #0B1220;
            page-break-after: avoid;
            page-break-inside: avoid;
          }
          
          h1 { font-size: 24px; line-height: 1.2; }
          h2 { font-size: 18px; }
          h3 { font-size: 15px; }
          
          p {
            margin: 8px 0;
            color: rgba(11, 18, 32, 0.78);
            line-height: 1.6;
            orphans: 3;
            widows: 3;
          }
          
          .muted2 { color: rgba(11, 18, 32, 0.62); }
          .small { font-size: 10px; }
          
          /* Layout */
          .row {
            display: flex;
            gap: 12px;
            flex-wrap: wrap;
            margin: 10px 0;
          }
          
          .hero {
            display: flex;
            gap: 16px;
            align-items: flex-start;
            margin: 12px 0;
          }
          
          .hero .left { flex: 1; min-width: 200px; }
          .hero .right { width: 250px; min-width: 180px; }
          
          /* Cards */
          .card {
            background: rgba(255, 255, 255, 0.95);
            border: 1px solid rgba(17, 24, 39, 0.12);
            border-radius: 12px;
            padding: 12px;
            margin: 8px 0;
            page-break-inside: avoid;
          }
          
          .grid2 {
            display: grid;
            grid-template-columns: repeat(2, 1fr);
            gap: 12px;
            margin: 10px 0;
          }
          
          .grid3 {
            display: grid;
            grid-template-columns: repeat(3, 1fr);
            gap: 12px;
            margin: 10px 0;
          }
          
          @media print {
            .grid2, .grid3 {
              grid-template-columns: repeat(2, 1fr);
            }
          }
          
          /* Badges */
          .badge {
            display: inline-block;
            padding: 5px 8px;
            border-radius: 8px;
            border: 1px solid rgba(17, 24, 39, 0.12);
            background: rgba(21, 79, 161, 0.06);
            font-weight: 700;
            font-size: 10px;
            color: #0B1220;
            margin-bottom: 6px;
          }
          
          .pill {
            display: inline-block;
            padding: 6px 10px;
            border-radius: 16px;
            border: 1px solid rgba(54, 114, 248, 0.32);
            background: rgba(54, 114, 248, 0.08);
            color: #0B1220;
            font-weight: 600;
            font-size: 10px;
            margin: 3px 3px 3px 0;
          }
          
          /* Listas */
          .list {
            margin: 6px 0;
            padding-left: 18px;
            color: rgba(11, 18, 32, 0.78);
            line-height: 1.7;
          }
          
          .list li {
            margin: 3px 0;
          }
          
          /* Separador */
          .hr {
            height: 1px;
            background: rgba(17, 24, 39, 0.12);
            margin: 12px 0;
            border: none;
          }
          
          /* Preço */
          .price {
            font-family: 'Orbitron', system-ui, sans-serif;
            font-size: 18px;
            letter-spacing: 0.03em;
            margin-top: 4px;
            color: #0B1220;
            font-weight: 600;
          }
          
          /* Tabelas */
          .table {
            width: 100%;
            border-collapse: collapse;
            margin: 10px 0;
            border: 1px solid rgba(17, 24, 39, 0.12);
            border-radius: 10px;
            overflow: hidden;
            page-break-inside: auto;
          }
          
          .table thead {
            display: table-header-group;
          }
          
          .table tfoot {
            display: table-footer-group;
          }
          
          .table tr {
            page-break-inside: avoid;
          }
          
          .table th,
          .table td {
            padding: 8px 10px;
            border-bottom: 1px solid rgba(17, 24, 39, 0.08);
            vertical-align: top;
            font-size: 11px;
            text-align: left;
          }
          
          .table th {
            background: rgba(21, 79, 161, 0.06);
            font-family: 'Orbitron', system-ui, sans-serif;
            letter-spacing: 0.04em;
            font-size: 10px;
            text-transform: uppercase;
            color: #0B1220;
            font-weight: 600;
          }
          
          .table tr:last-child td {
            border-bottom: none;
          }
          
          /* Footer */
          .footer {
            position: fixed;
            left: 12mm;
            right: 12mm;
            bottom: 12mm;
            display: flex;
            justify-content: space-between;
            align-items: center;
            color: rgba(11, 18, 32, 0.62);
            font-size: 9px;
            border-top: 1px solid rgba(17, 24, 39, 0.10);
            padding-top: 6px;
          }
          
          .page-no {
            font-family: 'Orbitron', system-ui, sans-serif;
            letter-spacing: 0.10em;
            color: rgba(11, 18, 32, 0.55);
            font-size: 9px;
          }
          
          /* Imagens */
          img {
            max-width: 100%;
            height: auto;
            page-break-inside: avoid;
          }
          
          /* Quebras de página */
          .page-break {
            page-break-before: always;
          }
          
          /* Evitar quebras ruins */
          h1, h2, h3, h4, h5, h6 {
            page-break-after: avoid;
          }
          
          blockquote, pre {
            page-break-inside: avoid;
          }
        </style>
      </head>
      <body>
        ${itemsTableHTML}
        ${content}
      </body>
      </html>
    `);

    printWindow.document.close();
    
    // Aguardar carregamento e abrir diálogo de impressão
    printWindow.onload = () => {
      setTimeout(() => {
        printWindow.print();
      }, 500);
    };
    
  } catch (error) {
    console.error('Erro ao gerar PDF:', error);
    alert('Erro ao gerar PDF. Verifique se o conteúdo da proposta é válido.');
  }
  }

  const totalPages = Math.ceil(totalProposals / pageSize)

  const handleOpenProposalDetail = (proposal: Proposal) => {
    setSelectedProposalDetail(proposal)
    setShowProposalDetailModal(true)
    setActiveTab('basicas')
  }

  useEffect(() => {
    if (showProposalDetailModal && selectedProposalDetail?.id) {
      fetchProposalComments(selectedProposalDetail.id)
    }
  }, [showProposalDetailModal, selectedProposalDetail?.id])

  const fetchProposalComments = async (proposalId: number) => {
    try {
      setLoadingComments(true)
      const response = await api.get(`/api/proposals/${proposalId}/comments`)
      setProposalComments(response.data || [])
    } catch (error) {
      console.error('Error fetching proposal comments:', error)
      setProposalComments([])
    } finally {
      setLoadingComments(false)
    }
  }

  const handleAddComment = async () => {
    if (!selectedProposalDetail || !newComment.trim()) return
    
    try {
      setAddingComment(true)
      const response = await api.post(`/api/proposals/${selectedProposalDetail.id}/comments`, {
        comment: newComment.trim()
      })
      
      setProposalComments([response.data, ...proposalComments])
      setNewComment('')
      
      const propResponse = await api.get(`/api/proposals/${selectedProposalDetail.id}`)
      setSelectedProposalDetail(prev => prev ? { ...prev, updated_at: propResponse.data.updated_at } : propResponse.data)
    } catch (error: any) {
      console.error('Error adding comment:', error)
      alert(error.response?.data?.detail || 'Erro ao adicionar comentário')
    } finally {
      setAddingComment(false)
    }
  }

  const handleDeleteComment = async (commentId: number) => {
    if (!confirm('Tem certeza que deseja excluir este comentário?')) return
    
    try {
      await api.delete(`/api/proposals/comments/${commentId}`)
      setProposalComments(prevComments => prevComments.filter(c => c.id !== commentId))
      
      if (selectedProposalDetail) {
        const propResponse = await api.get(`/api/proposals/${selectedProposalDetail.id}`)
        setSelectedProposalDetail(prev => prev ? { ...prev, updated_at: propResponse.data.updated_at } : propResponse.data)
      }
    } catch (error: any) {
      console.error('Error deleting comment:', error)
      alert(error.response?.data?.detail || 'Erro ao excluir comentário')
    }
  }

  if (loading && proposals.length === 0) {
    return <div className="flex-1 space-y-6 p-6">Carregando...</div>
  }

  return (
    <div className="flex-1 space-y-6 p-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold">Propostas Comerciais</h1>
          <p className="text-muted-foreground">Gerencie suas propostas comerciais</p>
        </div>
        <Button 
          onClick={() => setShowForm(!showForm)}
          className="bg-gradient-to-r from-amber-600 to-amber-700 hover:from-amber-700 hover:to-amber-800 text-white shadow-md hover:shadow-lg transition-all duration-200"
        >
          <Plus className="mr-2 h-4 w-4" />
          Nova Proposta
        </Button>
      </div>

      {showForm && (
        <Card className="border-t-4 border-t-amber-500 bg-gradient-to-br from-amber-50/30 to-white dark:from-amber-950/10 dark:to-background">
          <CardHeader className="bg-gradient-to-r from-amber-50/50 to-transparent dark:from-amber-950/20">
            <CardTitle className="text-amber-900 dark:text-amber-100">
              {editingId ? 'Editar' : 'Nova'} Proposta
            </CardTitle>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleSubmit} className="space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium mb-1">Oportunidade *</label>
                  <select
                    value={formData.opportunity_id || ''}
                    onChange={(e) => setFormData({ ...formData, opportunity_id: e.target.value ? Number(e.target.value) : null })}
                    required
                    className="w-full px-3 py-2 border rounded-md focus:ring-2 focus:ring-amber-500 focus:border-amber-500 transition-all duration-200"
                  >
                    <option value="">Selecione uma oportunidade</option>
                    {opportunities.map(opp => (
                      <option key={opp.id} value={opp.id}>{opp.name}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-medium mb-1">Template de Proposta</label>
                  <select
                    value={formData.template_id || ''}
                    onChange={(e) => {
                      const templateId = e.target.value ? Number(e.target.value) : null
                      setFormData({ 
                        ...formData, 
                        template_id: templateId,
                        // Limpar conteúdo quando selecionar template (será gerado pelo backend)
                        content: templateId ? '' : formData.content
                      })
                    }}
                    className="w-full px-3 py-2 border rounded-md focus:ring-2 focus:ring-amber-500 focus:border-amber-500 transition-all duration-200"
                  >
                    <option value="">Sem template (conteúdo manual)</option>
                    {templates.map(template => (
                      <option key={template.id} value={template.id}>
                        {template.name} {template.description ? `- ${template.description}` : ''}
                      </option>
                    ))}
                  </select>
                  <p className="text-xs text-muted-foreground mt-1">
                    Selecione um template para preencher automaticamente o conteúdo da proposta com dados da oportunidade
                  </p>
                </div>
                <div>
                  <label className="block text-sm font-medium mb-1">Título *</label>
                  <Input
                    value={formData.title}
                    onChange={(e) => setFormData({ ...formData, title: e.target.value })}
                    required
                    className="focus:ring-2 focus:ring-amber-500 focus:border-amber-500 transition-all duration-200"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium mb-1">Valor *</label>
                  <div className="flex gap-2">
                    <Input
                      type="number"
                      step="0.01"
                      value={formData.amount}
                      onChange={(e) => setFormData({ ...formData, amount: e.target.value })}
                      required
                      className="focus:ring-2 focus:ring-amber-500 focus:border-amber-500 transition-all duration-200"
                    />
                    <select
                      value={formData.currency}
                      onChange={(e) => setFormData({ ...formData, currency: e.target.value })}
                      className="w-24 px-3 py-2 border rounded-md focus:ring-2 focus:ring-amber-500 focus:border-amber-500 transition-all duration-200"
                    >
                      <option value="BRL">BRL</option>
                      <option value="USD">USD</option>
                      <option value="EUR">EUR</option>
                    </select>
                  </div>
                </div>
                <div>
                  <label className="block text-sm font-medium mb-1">Válida até</label>
                  <Input
                    type="date"
                    value={formData.valid_until}
                    onChange={(e) => setFormData({ ...formData, valid_until: e.target.value })}
                    className="focus:ring-2 focus:ring-amber-500 focus:border-amber-500 transition-all duration-200"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium mb-1">Responsável</label>
                  <select
                    value={formData.owner_id || ''}
                    onChange={(e) => setFormData({ ...formData, owner_id: e.target.value ? Number(e.target.value) : null })}
                    className="w-full px-3 py-2 border rounded-md focus:ring-2 focus:ring-amber-500 focus:border-amber-500 transition-all duration-200"
                  >
                    <option value="">Sem responsável</option>
                    {users.map((user) => (
                      <option key={user.id} value={user.id}>
                        {user.full_name} ({user.email})
                      </option>
                    ))}
                  </select>
                </div>
              </div>
              
              {/* Seção de Itens */}
              <div className="border-t pt-4">
                <div className="flex items-center justify-between mb-4">
                  <label className="block text-sm font-medium">Itens da Proposta</label>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() => {
                      fetchAvailableItems()
                      setShowItemsModal(true)
                    }}
                  >
                    <PlusCircle className="mr-2 h-4 w-4" />
                    Adicionar Item
                  </Button>
                </div>
                
                {proposalItems.length > 0 ? (
                  <div className="space-y-2">
                    <div className="border rounded-md overflow-hidden">
                      <Table>
                        <TableHeader>
                          <TableRow>
                            <TableHead>Item</TableHead>
                            <TableHead className="text-right">Qtd</TableHead>
                            <TableHead className="text-right">Preço Unit.</TableHead>
                            <TableHead className="text-right">Total</TableHead>
                            <TableHead className="w-[50px]"></TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {proposalItems.map((item, index) => (
                            <TableRow key={index}>
                              <TableCell>
                                <div>
                                  <div className="font-medium">{item.name}</div>
                                  {item.sku && (
                                    <div className="text-xs text-muted-foreground">SKU: {item.sku}</div>
                                  )}
                                </div>
                              </TableCell>
                              <TableCell className="text-right">{item.quantity}</TableCell>
                              <TableCell className="text-right">
                                {new Intl.NumberFormat('pt-BR', {
                                  style: 'currency',
                                  currency: formData.currency,
                                }).format(item.unit_price)}
                              </TableCell>
                              <TableCell className="text-right font-medium">
                                {new Intl.NumberFormat('pt-BR', {
                                  style: 'currency',
                                  currency: formData.currency,
                                }).format(item.subtotal)}
                              </TableCell>
                              <TableCell>
                                <Button
                                  type="button"
                                  variant="ghost"
                                  size="sm"
                                  onClick={() => handleRemoveItem(index)}
                                >
                                  <Trash2Icon className="h-4 w-4 text-destructive" />
                                </Button>
                              </TableCell>
                            </TableRow>
                          ))}
                        </TableBody>
                      </Table>
                    </div>
                    <div className="flex justify-end pt-2 border-t">
                      <div className="text-right">
                        <div className="text-sm text-muted-foreground">Total:</div>
                        <div className="text-xl font-bold">
                          {new Intl.NumberFormat('pt-BR', {
                            style: 'currency',
                            currency: formData.currency,
                          }).format(calculateProposalTotals(proposalItems).total)}
                        </div>
                      </div>
                    </div>
                  </div>
                ) : (
                  <div className="text-center py-8 text-muted-foreground border rounded-md">
                    <Package className="h-8 w-8 mx-auto mb-2 opacity-50" />
                    <p>Nenhum item adicionado</p>
                    <p className="text-xs mt-1">Clique em "Adicionar Item" para começar</p>
                  </div>
                )}
              </div>
              
              <div>
                <label className="block text-sm font-medium mb-1">
                  Conteúdo *
                  {formData.template_id && (
                    <span className="text-xs text-muted-foreground ml-2 font-normal">
                      (Será preenchido automaticamente pelo template)
                    </span>
                  )}
                </label>
                <Textarea
                  value={formData.content}
                  onChange={(e) => setFormData({ ...formData, content: e.target.value })}
                  rows={10}
                  required
                  className="focus:ring-2 focus:ring-amber-500 focus:border-amber-500 transition-all duration-200"
                  placeholder={formData.template_id ? "O conteúdo será gerado automaticamente do template selecionado..." : "Digite o conteúdo da proposta ou selecione um template acima..."}
                  disabled={!!formData.template_id}
                />
                {formData.template_id && (
                  <p className="text-xs text-muted-foreground mt-1">
                    O conteúdo será gerado automaticamente quando você salvar a proposta.
                  </p>
                )}
              </div>
              <div>
                <label className="block text-sm font-medium mb-1">Notas</label>
                <Textarea
                  value={formData.notes}
                  onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
                  rows={2}
                  className="focus:ring-2 focus:ring-amber-500 focus:border-amber-500 transition-all duration-200"
                />
              </div>
              <div className="flex gap-2">
                <Button 
                  type="submit"
                  className="bg-gradient-to-r from-amber-600 to-amber-700 hover:from-amber-700 hover:to-amber-800 text-white shadow-md hover:shadow-lg transition-all duration-200"
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

      {/* Filtros */}
      <Card className="border-t-4 border-t-amber-500 bg-gradient-to-br from-amber-50/30 to-white dark:from-amber-950/10 dark:to-background">
        <CardHeader className="bg-gradient-to-r from-amber-50/50 to-transparent dark:from-amber-950/20">
          <div className="flex items-center justify-between">
            <CardTitle className="text-amber-900 dark:text-amber-100">Filtros</CardTitle>
            <div className="flex items-center gap-2">
              <label className="text-sm font-medium">Itens por página:</label>
              <select
                value={pageSize}
                onChange={(e) => {
                  const newPageSize = Number(e.target.value)
                  setPageSize(newPageSize)
                  setCurrentPage(1)
                }}
                className="px-3 py-1.5 border rounded-md text-sm bg-background"
              >
                <option value={10}>10</option>
                <option value={20}>20</option>
                <option value={50}>50</option>
                <option value={100}>100</option>
              </select>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <Input
                  placeholder="Buscar propostas..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="focus:ring-2 focus:ring-amber-500 focus:border-amber-500 transition-all duration-200"
                />
              </div>
              <div>
                <select
                  value={statusFilter}
                  onChange={(e) => setStatusFilter(e.target.value as any)}
                  className="w-full px-3 py-2 border rounded-md focus:ring-2 focus:ring-amber-500 focus:border-amber-500 transition-all duration-200"
                >
                  <option value="all">Todos os status</option>
                  <option value="draft">Rascunho</option>
                  <option value="sent">Enviada</option>
                  <option value="accepted">Aceita</option>
                  <option value="rejected">Rejeitada</option>
                  <option value="expired">Expirada</option>
                </select>
              </div>
            </div>
            <AdvancedFilters
              filters={advancedFilters}
              onFiltersChange={setAdvancedFilters}
              logic={filterLogic}
              onLogicChange={setFilterLogic}
              endpoint="/api/proposals/filter-fields"
            />
          </div>
        </CardContent>
      </Card>

      {/* Bulk Actions */}
      {selectedProposals.size > 0 && (
        <Card className="border-l-4 border-l-amber-500">
          <CardContent className="py-3">
            <div className="flex items-center justify-between">
              <span className="text-sm font-medium">
                {selectedProposals.size} proposta(s) selecionada(s)
              </span>
              <div className="flex gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={handleExportSelected}
                >
                  <Download className="mr-2 h-4 w-4" />
                  Exportar
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={handleBulkDelete}
                  className="text-red-600 hover:text-red-700"
                >
                  <Trash2 className="mr-2 h-4 w-4" />
                  Excluir
                </Button>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => setSelectedProposals(new Set())}
                >
                  <X className="h-4 w-4" />
                </Button>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Lista de Propostas */}
      {proposals.length === 0 && !loading ? (
        <Card>
          <CardContent className="py-8 text-center">
            <p className="text-muted-foreground">Nenhuma proposta encontrada</p>
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-4">
          {proposals.map((proposal) => {
            const opportunity = opportunities.find(o => o.id === proposal.opportunity_id)
            
            return (
              <Card 
                key={proposal.id}
                className="border-l-4 border-l-amber-400 hover:border-l-amber-600 transition-all duration-200 bg-gradient-to-r from-white to-amber-50/30 dark:from-background dark:to-amber-950/20 hover:shadow-lg cursor-pointer"
                onClick={() => handleOpenProposalDetail(proposal)}
              >
                <CardHeader>
                  <div className="flex items-start justify-between">
                    <div className="flex-1">
                      <div className="flex items-center gap-2">
                        <input
                          type="checkbox"
                          checked={selectedProposals.has(proposal.id)}
                          onChange={(e) => {
                            e.stopPropagation()
                            handleSelectProposal(proposal.id)
                          }}
                          onClick={(e) => e.stopPropagation()}
                          className="rounded border-gray-300"
                        />
                        <CardTitle className="text-amber-900 dark:text-amber-100">{proposal.title}</CardTitle>
                      </div>
                      {opportunity && (
                        <CardDescription className="text-amber-700/80 dark:text-amber-300/80 mt-1">
                          {opportunity.name}
                        </CardDescription>
                      )}
                    </div>
                    <div className="flex gap-2" onClick={(e) => e.stopPropagation()}>
                      <Button
                        size="icon"
                        variant="ghost"
                        onClick={(e) => {
                          e.stopPropagation()
                          handleEdit(proposal)
                        }}
                        disabled={proposal.status !== 'draft'}
                      >
                        <Edit className="h-4 w-4" />
                      </Button>
                      <Button
                        size="icon"
                        variant="ghost"
                        onClick={(e) => {
                          e.stopPropagation()
                          handleDelete(proposal.id)
                        }}
                        disabled={proposal.status === 'accepted'}
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                  </div>
                </CardHeader>
                <CardContent className="space-y-2">
                  <div className="flex items-center gap-2">
                    <span className={`text-xs px-2 py-1 rounded ${getStatusColor(proposal.status)}`}>
                      {getStatusLabel(proposal.status)}
                    </span>
                  </div>
                  <div className="flex items-center gap-2 text-sm">
                    <DollarSign className="h-4 w-4 text-amber-600" />
                    <span className="font-semibold">
                      {new Intl.NumberFormat('pt-BR', { style: 'currency', currency: proposal.currency }).format(proposal.amount)}
                    </span>
                  </div>
                  {proposal.valid_until && (
                    <div className="flex items-center gap-2 text-sm">
                      <Calendar className="h-4 w-4 text-amber-600" />
                      <span className="text-muted-foreground">
                        Válida até: {new Date(proposal.valid_until).toLocaleDateString('pt-BR')}
                      </span>
                    </div>
                  )}
                  {proposal.owner && (
                    <div className="flex items-center gap-2 text-sm">
                      <User className="h-4 w-4 text-amber-600" />
                      <span className="text-muted-foreground">{proposal.owner.full_name}</span>
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
                  {proposal.notes && (
                    <CardContent className="pt-2 border-t">
                      <p className="text-sm text-muted-foreground line-clamp-2">{proposal.notes}</p>
                    </CardContent>
                  )}
                  <div className="flex gap-2 pt-2 border-t" onClick={(e) => e.stopPropagation()}>
                    {proposal.status === 'draft' && (
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={(e) => {
                          e.stopPropagation()
                          handleSend(proposal.id)
                        }}
                        className="text-xs"
                      >
                        <Send className="mr-1 h-3 w-3" />
                        Enviar
                      </Button>
                    )}
                    {proposal.status === 'sent' && (
                      <>
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={(e) => {
                            e.stopPropagation()
                            handleAccept(proposal.id)
                          }}
                          className="text-xs text-green-600"
                        >
                          <CheckCircle2 className="mr-1 h-3 w-3" />
                          Aceitar
                        </Button>
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={(e) => {
                            e.stopPropagation()
                            handleReject(proposal.id)
                          }}
                          className="text-xs text-red-600"
                        >
                          <XCircle className="mr-1 h-3 w-3" />
                          Rejeitar
                        </Button>
                      </>
                    )}
                  </div>
                </CardContent>
              </Card>
            )
          })}
        </div>
      )}

      {/* Pagination */}
      {totalProposals > pageSize && (
        <Card>
          <CardContent className="py-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-4">
                <span className="text-sm text-muted-foreground">
                  Mostrando {((currentPage - 1) * pageSize) + 1} a {Math.min(currentPage * pageSize, totalProposals)} de {totalProposals}
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

      {/* Modal de Detalhes da Proposta */}
      {showProposalDetailModal && selectedProposalDetail && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <Card className="w-full max-w-5xl h-[90vh] overflow-hidden flex flex-col shadow-2xl">
            <CardHeader className="border-b bg-gradient-to-r from-amber-50 to-orange-50 dark:from-amber-950 dark:to-orange-950 flex-shrink-0">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <CardTitle className="text-2xl font-bold">Detalhes da Proposta</CardTitle>
                  <span className={`text-xs px-3 py-1 rounded-full font-medium ${getStatusColor(selectedProposalDetail.status)}`}>
                    {getStatusLabel(selectedProposalDetail.status)}
                  </span>
                </div>
                <div className="flex items-center gap-2">
                  <Button
                    variant="default"
                    size="sm"
                    onClick={() => handleExportPDF(selectedProposalDetail)}
                    className="bg-gradient-to-r from-amber-600 to-amber-700 hover:from-amber-700 hover:to-amber-800 text-white shadow-md"
                  >
                    <FileDown className="h-4 w-4 mr-2" />
                    Exportar PDF
                  </Button>
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={() => {
                      setShowProposalDetailModal(false)
                      setSelectedProposalDetail(null)
                      setActiveTab('basicas')
                    }}
                    className="hover:bg-red-100 dark:hover:bg-red-900"
                  >
                    <XCircle className="h-5 w-5" />
                  </Button>
                </div>
              </div>
            </CardHeader>
            
            {/* Abas */}
            <div className="border-b bg-background px-6 flex-shrink-0">
              <div className="flex gap-1 overflow-x-auto">
                <button
                  onClick={() => setActiveTab('basicas')}
                  className={`px-4 py-3 text-sm font-medium border-b-2 transition-all whitespace-nowrap ${
                    activeTab === 'basicas'
                      ? 'border-amber-600 text-amber-600 bg-amber-50 dark:bg-amber-950/30'
                      : 'border-transparent text-muted-foreground hover:text-foreground hover:bg-accent/50'
                  }`}
                >
                  Informações Básicas
                </button>
                <button
                  onClick={() => setActiveTab('oportunidade')}
                  className={`px-4 py-3 text-sm font-medium border-b-2 transition-all whitespace-nowrap ${
                    activeTab === 'oportunidade'
                      ? 'border-amber-600 text-amber-600 bg-amber-50 dark:bg-amber-950/30'
                      : 'border-transparent text-muted-foreground hover:text-foreground hover:bg-accent/50'
                  }`}
                >
                  Oportunidade
                </button>
                <button
                  onClick={() => setActiveTab('comentarios')}
                  className={`px-4 py-3 text-sm font-medium border-b-2 transition-all whitespace-nowrap ${
                    activeTab === 'comentarios'
                      ? 'border-amber-600 text-amber-600 bg-amber-50 dark:bg-amber-950/30'
                      : 'border-transparent text-muted-foreground hover:text-foreground hover:bg-accent/50'
                  }`}
                >
                  Comentários
                </button>
              </div>
            </div>

            <CardContent className="flex-1 overflow-y-auto p-0 bg-background">
              {/* Aba: Informações Básicas */}
              {activeTab === 'basicas' && (
                <div className="h-full flex flex-col">
                  <div className="p-6 space-y-4 border-b bg-card">
                    <div className="grid gap-4 md:grid-cols-2">
                      <div>
                        <label className="text-sm font-medium text-muted-foreground">Título</label>
                        <p className="text-base font-medium mt-1">{selectedProposalDetail.title}</p>
                      </div>
                      <div>
                        <label className="text-sm font-medium text-muted-foreground">Status</label>
                        <p className="mt-1">
                          <span className={`text-xs px-2 py-1 rounded ${getStatusColor(selectedProposalDetail.status)}`}>
                            {getStatusLabel(selectedProposalDetail.status)}
                          </span>
                        </p>
                      </div>
                      {selectedProposalDetail.amount && (
                        <div>
                          <label className="text-sm font-medium text-muted-foreground">Valor</label>
                          <p className="text-base mt-1 flex items-center gap-2">
                            <DollarSign className="h-4 w-4" />
                            <span className="font-semibold">
                              {new Intl.NumberFormat('pt-BR', { style: 'currency', currency: selectedProposalDetail.currency }).format(selectedProposalDetail.amount)}
                            </span>
                          </p>
                        </div>
                      )}
                      {selectedProposalDetail.valid_until && (
                        <div>
                          <label className="text-sm font-medium text-muted-foreground">Válida até</label>
                          <p className="text-base mt-1 flex items-center gap-2">
                            <Calendar className="h-4 w-4" />
                            {new Date(selectedProposalDetail.valid_until).toLocaleDateString('pt-BR')}
                          </p>
                        </div>
                      )}
                      {selectedProposalDetail.owner && (
                        <div>
                          <label className="text-sm font-medium text-muted-foreground">Responsável</label>
                          <p className="text-base mt-1 flex items-center gap-2">
                            <User className="h-4 w-4" />
                            {selectedProposalDetail.owner.full_name}
                          </p>
                        </div>
                      )}
                      {selectedProposalDetail.sent_at && (
                        <div>
                          <label className="text-sm font-medium text-muted-foreground">Enviada em</label>
                          <p className="text-base mt-1 flex items-center gap-2">
                            <Calendar className="h-4 w-4" />
                            {new Date(selectedProposalDetail.sent_at).toLocaleDateString('pt-BR')}
                          </p>
                        </div>
                      )}
                      {selectedProposalDetail.accepted_at && (
                        <div>
                          <label className="text-sm font-medium text-muted-foreground">Aceita em</label>
                          <p className="text-base mt-1 flex items-center gap-2">
                            <Calendar className="h-4 w-4" />
                            {new Date(selectedProposalDetail.accepted_at).toLocaleDateString('pt-BR')}
                          </p>
                        </div>
                      )}
                      {selectedProposalDetail.rejected_at && (
                        <div>
                          <label className="text-sm font-medium text-muted-foreground">Rejeitada em</label>
                          <p className="text-base mt-1 flex items-center gap-2">
                            <Calendar className="h-4 w-4" />
                            {new Date(selectedProposalDetail.rejected_at).toLocaleDateString('pt-BR')}
                          </p>
                          {selectedProposalDetail.rejection_reason && (
                            <p className="text-sm text-muted-foreground mt-1">Motivo: {selectedProposalDetail.rejection_reason}</p>
                          )}
                        </div>
                      )}
                    </div>
                  </div>
                  {selectedProposalDetail.content && (
                    <div className="flex-1 overflow-y-auto p-8 bg-white dark:bg-gray-900 border-t">
                      <div className="mb-4 pb-4 border-b">
                        <h3 className="text-lg font-semibold text-foreground mb-2">Conteúdo da Proposta</h3>
                        <p className="text-sm text-muted-foreground">Visualização do conteúdo gerado para esta proposta</p>
                      </div>
                      <style>{`
                        .proposal-content-wrapper {
                          font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif;
                          line-height: 1.6;
                          color: #333;
                          max-width: 100%;
                        }
                        .dark .proposal-content-wrapper {
                          color: #e5e7eb;
                        }
                        .proposal-content-wrapper h1, 
                        .proposal-content-wrapper h2, 
                        .proposal-content-wrapper h3,
                        .proposal-content-wrapper h4,
                        .proposal-content-wrapper h5,
                        .proposal-content-wrapper h6 {
                          margin-top: 1.5em;
                          margin-bottom: 0.5em;
                          font-weight: 600;
                          line-height: 1.2;
                        }
                        .proposal-content-wrapper h1 {
                          font-size: 2em;
                          border-bottom: 2px solid #0066CC;
                          padding-bottom: 0.5em;
                          color: #0066CC;
                        }
                        .proposal-content-wrapper h2 {
                          font-size: 1.5em;
                          border-bottom: 1px solid #e0e0e0;
                          padding-bottom: 0.3em;
                          color: #2c3e50;
                        }
                        .dark .proposal-content-wrapper h2 {
                          border-bottom-color: #4b5563;
                          color: #e5e7eb;
                        }
                        .proposal-content-wrapper h3 {
                          font-size: 1.25em;
                          color: #374151;
                        }
                        .dark .proposal-content-wrapper h3 {
                          color: #d1d5db;
                        }
                        .proposal-content-wrapper table {
                          width: 100%;
                          border-collapse: collapse;
                          margin: 1em 0;
                          box-shadow: 0 1px 3px rgba(0,0,0,0.1);
                        }
                        .proposal-content-wrapper table th,
                        .proposal-content-wrapper table td {
                          border: 1px solid #ddd;
                          padding: 12px;
                          text-align: left;
                        }
                        .dark .proposal-content-wrapper table th,
                        .dark .proposal-content-wrapper table td {
                          border-color: #4b5563;
                        }
                        .proposal-content-wrapper table th {
                          background-color: #f5f5f5;
                          font-weight: 600;
                        }
                        .dark .proposal-content-wrapper table th {
                          background-color: #374151;
                        }
                        .proposal-content-wrapper img {
                          max-width: 100%;
                          height: auto;
                          margin: 1em 0;
                          border-radius: 4px;
                        }
                        .proposal-content-wrapper p {
                          margin: 0.8em 0;
                        }
                        .proposal-content-wrapper ul, 
                        .proposal-content-wrapper ol {
                          margin: 0.8em 0;
                          padding-left: 2em;
                        }
                        .proposal-content-wrapper li {
                          margin: 0.3em 0;
                        }
                        .proposal-content-wrapper blockquote {
                          border-left: 4px solid #0066CC;
                          padding-left: 1em;
                          margin: 1em 0;
                          font-style: italic;
                          color: #666;
                        }
                        .dark .proposal-content-wrapper blockquote {
                          border-left-color: #3b82f6;
                          color: #9ca3af;
                        }
                        .proposal-content-wrapper code {
                          background-color: #f5f5f5;
                          padding: 2px 6px;
                          border-radius: 3px;
                          font-family: 'Courier New', monospace;
                          font-size: 0.9em;
                        }
                        .dark .proposal-content-wrapper code {
                          background-color: #374151;
                        }
                        .proposal-content-wrapper pre {
                          background-color: #f5f5f5;
                          padding: 1em;
                          border-radius: 4px;
                          overflow-x: auto;
                        }
                        .dark .proposal-content-wrapper pre {
                          background-color: #374151;
                        }
                        .proposal-content-wrapper a {
                          color: #0066CC;
                          text-decoration: underline;
                        }
                        .dark .proposal-content-wrapper a {
                          color: #3b82f6;
                        }
                        .proposal-content-wrapper strong {
                          font-weight: 600;
                        }
                        .proposal-content-wrapper em {
                          font-style: italic;
                        }
                      `}</style>
                      <div 
                        className="proposal-content-wrapper"
                        dangerouslySetInnerHTML={{ __html: selectedProposalDetail.content }}
                      />
                    </div>
                  )}
                  {selectedProposalDetail.notes && (
                    <div className="mt-4">
                      <label className="text-sm font-medium text-muted-foreground">Notas</label>
                      <p className="text-base mt-1">{selectedProposalDetail.notes}</p>
                    </div>
                  )}
                </div>
              )}

              {/* Aba: Oportunidade */}
              {activeTab === 'oportunidade' && (() => {
                const detailOpportunity = opportunities.find(o => o.id === selectedProposalDetail.opportunity_id)
                
                return (
                  <div className="space-y-4">
                    {detailOpportunity ? (
                      <div>
                        <label className="text-sm font-medium text-muted-foreground">Oportunidade</label>
                        <p className="text-base mt-1">{detailOpportunity.name}</p>
                      </div>
                    ) : (
                      <p className="text-sm text-muted-foreground">Nenhuma oportunidade associada.</p>
                    )}
                  </div>
                )
              })()}

              {/* Aba: Comentários */}
              {activeTab === 'comentarios' && (
                <div className="space-y-6">
                  <div>
                    <h3 className="text-lg font-semibold mb-4">Comentários</h3>
                    
                    {/* Formulário para adicionar comentário */}
                    <div className="mb-4 space-y-2">
                      <Textarea
                        placeholder="Adicione um comentário sobre esta proposta..."
                        value={newComment}
                        onChange={(e) => setNewComment(e.target.value)}
                        rows={3}
                        className="w-full"
                      />
                      <div className="flex justify-end">
                        <Button
                          onClick={handleAddComment}
                          disabled={!newComment.trim() || addingComment}
                          size="sm"
                        >
                          {addingComment ? 'Adicionando...' : 'Adicionar Comentário'}
                        </Button>
                      </div>
                    </div>

                    {/* Lista de comentários */}
                    {loadingComments ? (
                      <p className="text-sm text-muted-foreground">Carregando comentários...</p>
                    ) : proposalComments.length === 0 ? (
                      <p className="text-sm text-muted-foreground">Nenhum comentário ainda. Seja o primeiro a comentar!</p>
                    ) : (
                      <div className="space-y-3">
                        {proposalComments.map((comment) => (
                          <div
                            key={comment.id}
                            className="bg-gray-50 dark:bg-gray-900 p-4 rounded-lg border"
                          >
                            <div className="flex items-start justify-between mb-2">
                              <div className="flex-1">
                                <div className="flex items-center gap-2 mb-1">
                                  <User className="h-4 w-4 text-muted-foreground" />
                                  <span className="font-medium text-sm">
                                    {comment.user_name || comment.user_email || 'Usuário'}
                                  </span>
                                  <span className="text-xs text-muted-foreground">
                                    • {new Date(comment.created_at).toLocaleString('pt-BR')}
                                  </span>
                                </div>
                                <p className="text-sm whitespace-pre-wrap mt-2">{comment.comment}</p>
                              </div>
                              <Button
                                variant="ghost"
                                size="icon"
                                className="h-6 w-6"
                                onClick={() => handleDeleteComment(comment.id)}
                                title="Excluir comentário"
                              >
                                <Trash2 className="h-3 w-3" />
                              </Button>
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      )}

      {/* Modal de Seleção de Itens */}
      <Dialog open={showItemsModal} onOpenChange={setShowItemsModal}>
        <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Adicionar Item à Proposta</DialogTitle>
            <DialogDescription>
              Selecione um item do catálogo para adicionar à proposta
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <div className="relative">
                <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-muted-foreground h-4 w-4" />
                <Input
                  placeholder="Buscar item por nome ou SKU..."
                  value={itemsSearchTerm}
                  onChange={(e) => setItemsSearchTerm(e.target.value)}
                  className="pl-10"
                />
              </div>
            </div>
            <div className="border rounded-md max-h-[400px] overflow-y-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-[80px]">Foto</TableHead>
                    <TableHead>Item</TableHead>
                    <TableHead>Tipo</TableHead>
                    <TableHead className="text-right">Preço</TableHead>
                    <TableHead className="w-[100px]">Ação</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {availableItems
                    .filter(item => {
                      if (!itemsSearchTerm) return true
                      const search = itemsSearchTerm.toLowerCase()
                      return item.name.toLowerCase().includes(search) ||
                             (item.sku && item.sku.toLowerCase().includes(search))
                    })
                    .map((item) => (
                      <TableRow key={item.id}>
                        <TableCell>
                          {item.image_url ? (
                            <img
                              src={item.image_url}
                              alt={item.name}
                              className="w-12 h-12 object-cover rounded-md border"
                              onError={(e) => {
                                (e.target as HTMLImageElement).style.display = 'none'
                              }}
                            />
                          ) : (
                            <div className="w-12 h-12 bg-muted rounded-md border flex items-center justify-center">
                              <Package className="h-5 w-5 text-muted-foreground" />
                            </div>
                          )}
                        </TableCell>
                        <TableCell>
                          <div>
                            <div className="font-medium">{item.name}</div>
                            {item.sku && (
                              <div className="text-xs text-muted-foreground">SKU: {item.sku}</div>
                            )}
                          </div>
                        </TableCell>
                        <TableCell>
                          <span className="text-xs px-2 py-1 rounded bg-muted">
                            {item.type === 'product' ? 'Produto' : 'Serviço'}
                          </span>
                        </TableCell>
                        <TableCell className="text-right">
                          {new Intl.NumberFormat('pt-BR', {
                            style: 'currency',
                            currency: item.currency,
                          }).format(item.unit_price)}
                        </TableCell>
                        <TableCell>
                          <Button
                            type="button"
                            size="sm"
                            onClick={() => {
                              setSelectedItemForAdd(item)
                              setItemQuantity(1)
                            }}
                          >
                            Selecionar
                          </Button>
                        </TableCell>
                      </TableRow>
                    ))}
                </TableBody>
              </Table>
            </div>
            {selectedItemForAdd && (
              <div className="border-t pt-4 space-y-4">
                <div>
                  <label className="block text-sm font-medium mb-2">
                    Item selecionado: <strong>{selectedItemForAdd.name}</strong>
                  </label>
                  <div className="flex items-center gap-4">
                    {selectedItemForAdd.image_url && (
                      <div className="flex-shrink-0">
                        <img
                          src={selectedItemForAdd.image_url}
                          alt={selectedItemForAdd.name}
                          className="w-20 h-20 object-cover rounded-md border"
                          onError={(e) => {
                            (e.target as HTMLImageElement).style.display = 'none'
                          }}
                        />
                      </div>
                    )}
                    <div className="flex-1">
                      <label className="block text-sm font-medium mb-1">Quantidade</label>
                      <Input
                        type="number"
                        min="1"
                        value={itemQuantity}
                        onChange={(e) => setItemQuantity(Math.max(1, parseInt(e.target.value) || 1))}
                      />
                    </div>
                    <div className="text-right">
                      <div className="text-sm text-muted-foreground">Subtotal</div>
                      <div className="text-lg font-bold">
                        {new Intl.NumberFormat('pt-BR', {
                          style: 'currency',
                          currency: selectedItemForAdd.currency,
                        }).format(itemQuantity * selectedItemForAdd.unit_price)}
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            )}
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => {
              setShowItemsModal(false)
              setSelectedItemForAdd(null)
              setItemQuantity(1)
              setItemsSearchTerm('')
            }}>
              Cancelar
            </Button>
            <Button
              type="button"
              onClick={handleAddItem}
              disabled={!selectedItemForAdd}
            >
              Adicionar à Proposta
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
