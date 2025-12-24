import { useState, useEffect } from 'react'
import { useTranslation } from 'react-i18next'
import api from '@/lib/api'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { 
  Search,
  User,
  Calendar,
  FileText,
  Filter
} from 'lucide-react'

interface AuditLog {
  id: number
  user_id: number
  entity_type: string
  entity_id: number
  action: 'create' | 'update' | 'delete' | 'assign' | 'status_change' | 'stage_change' | 'convert'
  field_name: string | null
  old_value: string | null
  new_value: string | null
  metadata_json: string | null
  created_at: string
  user_name: string | null
  user_email: string | null
}

const actionLabels: Record<string, string> = {
  create: 'Criar',
  update: 'Atualizar',
  delete: 'Excluir',
  assign: 'Atribuir',
  status_change: 'Mudança de Status',
  stage_change: 'Mudança de Estágio',
  convert: 'Converter'
}

const actionColors: Record<string, string> = {
  create: 'bg-green-100 text-green-700 dark:bg-green-900 dark:text-green-200',
  update: 'bg-blue-100 text-blue-700 dark:bg-blue-900 dark:text-blue-200',
  delete: 'bg-red-100 text-red-700 dark:bg-red-900 dark:text-red-200',
  assign: 'bg-purple-100 text-purple-700 dark:bg-purple-900 dark:text-purple-200',
  status_change: 'bg-amber-100 text-amber-700 dark:bg-amber-900 dark:text-amber-200',
  stage_change: 'bg-indigo-100 text-indigo-700 dark:bg-indigo-900 dark:text-indigo-200',
  convert: 'bg-teal-100 text-teal-700 dark:bg-teal-900 dark:text-teal-200'
}

export function AuditLog() {
  const { t } = useTranslation()
  const [logs, setLogs] = useState<AuditLog[]>([])
  const [loading, setLoading] = useState(true)
  const [entityTypeFilter, setEntityTypeFilter] = useState<string>('all')
  const [actionFilter, setActionFilter] = useState<string>('all')
  const [entityIdFilter, setEntityIdFilter] = useState<string>('')
  const [currentPage, setCurrentPage] = useState(1)
  const [pageSize, setPageSize] = useState(50)

  useEffect(() => {
    fetchLogs()
  }, [currentPage, pageSize, entityTypeFilter, actionFilter, entityIdFilter])

  const fetchLogs = async () => {
    try {
      setLoading(true)
      const params = new URLSearchParams({
        skip: String((currentPage - 1) * pageSize),
        limit: String(pageSize)
      })
      
      if (entityTypeFilter !== 'all') {
        params.append('entity_type', entityTypeFilter)
      }
      
      if (actionFilter !== 'all') {
        params.append('action', actionFilter)
      }
      
      if (entityIdFilter) {
        params.append('entity_id', entityIdFilter)
      }
      
      const response = await api.get(`/api/audit?${params.toString()}`)
      setLogs(response.data)
    } catch (error) {
      console.error('Error fetching audit logs:', error)
    } finally {
      setLoading(false)
    }
  }

  const formatValue = (value: string | null) => {
    if (!value) return '-'
    try {
      // Tentar parsear como JSON
      const parsed = JSON.parse(value)
      return JSON.stringify(parsed, null, 2)
    } catch {
      return value
    }
  }

  if (loading && logs.length === 0) {
    return <div className="flex-1 space-y-6 p-6">Carregando...</div>
  }

  return (
    <div className="flex-1 space-y-6 p-6">
      <div>
        <h1 className="text-3xl font-bold">Log de Auditoria</h1>
        <p className="text-muted-foreground">Histórico de todas as ações realizadas no sistema</p>
      </div>

      <Card className="border-t-4 border-t-slate-500 bg-gradient-to-br from-slate-50/30 to-white dark:from-slate-950/10 dark:to-background">
        <CardHeader className="bg-gradient-to-r from-slate-50/50 to-transparent dark:from-slate-950/20">
          <CardTitle className="text-slate-900 dark:text-slate-100">Filtros</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div>
              <label className="block text-sm font-medium mb-1">Tipo de Entidade</label>
              <select
                value={entityTypeFilter}
                onChange={(e) => setEntityTypeFilter(e.target.value)}
                className="w-full px-3 py-2 border rounded-md focus:ring-2 focus:ring-slate-500 focus:border-slate-500 transition-all duration-200"
              >
                <option value="all">Todos</option>
                <option value="Lead">Lead</option>
                <option value="Account">Account</option>
                <option value="Contact">Contact</option>
                <option value="Opportunity">Opportunity</option>
                <option value="Proposal">Proposal</option>
                <option value="Task">Task</option>
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium mb-1">Ação</label>
              <select
                value={actionFilter}
                onChange={(e) => setActionFilter(e.target.value)}
                className="w-full px-3 py-2 border rounded-md focus:ring-2 focus:ring-slate-500 focus:border-slate-500 transition-all duration-200"
              >
                <option value="all">Todas</option>
                <option value="create">Criar</option>
                <option value="update">Atualizar</option>
                <option value="delete">Excluir</option>
                <option value="assign">Atribuir</option>
                <option value="status_change">Mudança de Status</option>
                <option value="stage_change">Mudança de Estágio</option>
                <option value="convert">Converter</option>
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium mb-1">ID da Entidade</label>
              <Input
                type="number"
                value={entityIdFilter}
                onChange={(e) => setEntityIdFilter(e.target.value)}
                placeholder="Filtrar por ID"
                className="focus:ring-2 focus:ring-slate-500 focus:border-slate-500 transition-all duration-200"
              />
            </div>
          </div>
        </CardContent>
      </Card>

      <div className="space-y-3">
        {logs.map((log) => (
          <Card 
            key={log.id}
            className="border-l-4 border-l-slate-400 hover:border-l-slate-600 transition-all duration-200 bg-gradient-to-r from-white to-slate-50/30 dark:from-background dark:to-slate-950/20 hover:shadow-lg"
          >
            <CardContent className="pt-4">
              <div className="flex items-start justify-between">
                <div className="flex-1 space-y-2">
                  <div className="flex items-center gap-3">
                    <span className={`text-xs px-2 py-1 rounded ${actionColors[log.action] || 'bg-gray-100 text-gray-700'}`}>
                      {actionLabels[log.action] || log.action}
                    </span>
                    <span className="text-sm font-semibold">{log.entity_type}</span>
                    <span className="text-xs text-muted-foreground">ID: {log.entity_id}</span>
                  </div>
                  
                  {log.field_name && (
                    <div className="text-sm">
                      <span className="font-medium">Campo:</span> {log.field_name}
                    </div>
                  )}
                  
                  {log.old_value && (
                    <div className="text-sm">
                      <span className="font-medium text-red-600">Valor antigo:</span>
                      <pre className="mt-1 text-xs bg-red-50 dark:bg-red-950/20 p-2 rounded overflow-x-auto">
                        {formatValue(log.old_value)}
                      </pre>
                    </div>
                  )}
                  
                  {log.new_value && (
                    <div className="text-sm">
                      <span className="font-medium text-green-600">Valor novo:</span>
                      <pre className="mt-1 text-xs bg-green-50 dark:bg-green-950/20 p-2 rounded overflow-x-auto">
                        {formatValue(log.new_value)}
                      </pre>
                    </div>
                  )}
                  
                  <div className="flex items-center gap-4 text-xs text-muted-foreground pt-2 border-t">
                    <div className="flex items-center gap-1">
                      <User className="h-3 w-3" />
                      <span>{log.user_name || log.user_email || `Usuário ${log.user_id}`}</span>
                    </div>
                    <div className="flex items-center gap-1">
                      <Calendar className="h-3 w-3" />
                      <span>{new Date(log.created_at).toLocaleString('pt-BR')}</span>
                    </div>
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      {logs.length === 0 && !loading && (
        <Card>
          <CardContent className="py-8 text-center">
            <p className="text-muted-foreground">Nenhum log encontrado</p>
          </CardContent>
        </Card>
      )}

      {/* Pagination */}
      <div className="flex items-center justify-between">
        <div className="text-sm text-muted-foreground">
          Página {currentPage}
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
            disabled={logs.length < pageSize}
          >
            Próxima
          </Button>
        </div>
      </div>
    </div>
  )
}

