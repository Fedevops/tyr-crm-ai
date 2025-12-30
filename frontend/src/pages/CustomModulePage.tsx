import { useState, useEffect } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Plus, Trash2, Edit, ArrowLeft } from 'lucide-react'
import { customModulesApi, customFieldsApi } from '@/lib/api'
import { useToast } from '@/components/ui/use-toast'
import { DynamicForm } from '@/components/DynamicForm'

interface CustomModule {
  id: string
  name: string
  slug: string
  description?: string
  is_active: boolean
}

interface ModuleDataRecord {
  id: string
  [key: string]: any
}

export function CustomModulePage() {
  const { moduleId } = useParams<{ moduleId: string }>()
  const navigate = useNavigate()
  const { toast } = useToast()
  const [module, setModule] = useState<CustomModule | null>(null)
  const [moduleData, setModuleData] = useState<ModuleDataRecord[]>([])
  const [moduleFields, setModuleFields] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [showFormModal, setShowFormModal] = useState(false)
  const [editingRecord, setEditingRecord] = useState<ModuleDataRecord | null>(null)
  const [searchTerm, setSearchTerm] = useState('')

  useEffect(() => {
    if (moduleId) {
      loadModule()
      loadModuleData()
      loadModuleFields()
    }
  }, [moduleId])

  const loadModule = async () => {
    if (!moduleId) return
    try {
      const response = await customModulesApi.getModule(moduleId)
      setModule(response.data)
    } catch (error: any) {
      toast({
        variant: 'destructive',
        title: 'Erro',
        description: error.response?.data?.detail || error.message,
      })
    }
  }

  const loadModuleData = async () => {
    if (!moduleId) return
    try {
      const response = await customModulesApi.getModuleData(moduleId)
      setModuleData(response.data || [])
    } catch (error: any) {
      toast({
        variant: 'destructive',
        title: 'Erro',
        description: error.response?.data?.detail || error.message,
      })
    } finally {
      setLoading(false)
    }
  }

  const loadModuleFields = async () => {
    if (!module?.slug) return
    try {
      const response = await customFieldsApi.getFields(module.slug)
      setModuleFields(response.data || [])
    } catch (error: any) {
      console.error('Erro ao carregar campos:', error)
      setModuleFields([])
    }
  }

  const handleAddRecord = () => {
    setEditingRecord({} as ModuleDataRecord)
    setShowFormModal(true)
  }

  const handleEditRecord = (record: ModuleDataRecord) => {
    setEditingRecord({ ...record })
    setShowFormModal(true)
  }

  const handleSaveRecord = async (data: Record<string, any>) => {
    if (!moduleId) return

    try {
      setLoading(true)
      if (editingRecord?.id) {
        await customModulesApi.updateModuleData(moduleId, editingRecord.id, data)
        toast({
          title: 'Sucesso',
          description: 'Registro atualizado com sucesso',
        })
      } else {
        await customModulesApi.createModuleData(moduleId, data)
        toast({
          title: 'Sucesso',
          description: 'Registro criado com sucesso',
        })
      }
      setShowFormModal(false)
      setEditingRecord(null)
      await loadModuleData()
    } catch (error: any) {
      toast({
        variant: 'destructive',
        title: 'Erro',
        description: error.response?.data?.detail || error.message,
      })
    } finally {
      setLoading(false)
    }
  }

  const handleDeleteRecord = async (recordId: string) => {
    if (!moduleId) return
    if (!confirm('Tem certeza que deseja excluir este registro?')) return

    try {
      setLoading(true)
      await customModulesApi.deleteModuleData(moduleId, recordId)
      toast({
        title: 'Sucesso',
        description: 'Registro excluído com sucesso',
      })
      await loadModuleData()
    } catch (error: any) {
      toast({
        variant: 'destructive',
        title: 'Erro',
        description: error.response?.data?.detail || error.message,
      })
    } finally {
      setLoading(false)
    }
  }

  const filteredData = moduleData.filter((record) => {
    if (!searchTerm) return true
    const searchLower = searchTerm.toLowerCase()
    return Object.values(record)
      .some((value) => 
        value && value.toString().toLowerCase().includes(searchLower)
      )
  })

  if (loading && !module) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="text-muted-foreground">Carregando...</div>
      </div>
    )
  }

  if (!module) {
    return (
      <div className="flex flex-col items-center justify-center h-64">
        <div className="text-muted-foreground mb-4">Módulo não encontrado</div>
        <Button onClick={() => navigate('/settings?section=custom-modules')}>
          <ArrowLeft className="h-4 w-4 mr-2" />
          Voltar para Configurações
        </Button>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold">{module.name}</h1>
          {module.description && (
            <p className="text-muted-foreground mt-1">{module.description}</p>
          )}
        </div>
        <Button onClick={handleAddRecord} disabled={loading}>
          <Plus className="h-4 w-4 mr-2" />
          Novo Registro
        </Button>
      </div>

      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle>Registros</CardTitle>
              <CardDescription>
                Gerencie os registros deste módulo
              </CardDescription>
            </div>
            <Input
              placeholder="Buscar..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-64"
            />
          </div>
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className="text-center py-8 text-muted-foreground">
              Carregando...
            </div>
          ) : filteredData.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground">
              {searchTerm
                ? 'Nenhum registro encontrado para a busca.'
                : 'Nenhum registro. Clique em "Novo Registro" para começar.'}
            </div>
          ) : (
            <div className="space-y-2">
              {filteredData.map((record) => (
                <div
                  key={record.id}
                  className="flex items-center justify-between p-4 border rounded-lg hover:bg-accent transition-colors"
                >
                  <div className="flex-1">
                    <div className="font-medium">
                      {Object.entries(record)
                        .filter(([key]) => key !== 'id')
                        .slice(0, 3)
                        .map(([key, value]) => (
                          <span key={key} className="mr-4">
                            <span className="text-muted-foreground">{key}:</span>{' '}
                            {value?.toString() || '-'}
                          </span>
                        ))}
                    </div>
                  </div>
                  <div className="flex gap-2">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => handleEditRecord(record)}
                    >
                      <Edit className="h-4 w-4" />
                    </Button>
                    <Button
                      variant="destructive"
                      size="sm"
                      onClick={() => handleDeleteRecord(record.id)}
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Modal de Formulário */}
      {showFormModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <Card className="w-full max-w-2xl max-h-[90vh] overflow-y-auto">
            <CardHeader>
              <div className="flex items-center justify-between">
                <CardTitle>
                  {editingRecord?.id ? 'Editar Registro' : 'Novo Registro'}
                </CardTitle>
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={() => {
                    setShowFormModal(false)
                    setEditingRecord(null)
                  }}
                >
                  ×
                </Button>
              </div>
            </CardHeader>
            <CardContent>
              {moduleFields.length === 0 ? (
                <div className="text-center py-8 text-muted-foreground">
                  <p>Nenhum campo customizado definido para este módulo.</p>
                  <p className="text-sm mt-2">
                    Vá para Configurações → Editor de Campos e adicione campos para este módulo.
                  </p>
                </div>
              ) : (
                <DynamicForm
                  fields={moduleFields}
                  onSubmit={handleSaveRecord}
                  defaultValues={editingRecord || {}}
                  submitLabel={editingRecord?.id ? 'Atualizar' : 'Criar'}
                />
              )}
            </CardContent>
          </Card>
        </div>
      )}
    </div>
  )
}


