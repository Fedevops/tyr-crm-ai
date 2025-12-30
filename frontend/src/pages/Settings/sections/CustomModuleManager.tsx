import { useState, useEffect } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Plus, Trash2, Save, X, Table, Eye, Edit, Search, Filter, FileText } from 'lucide-react'
import { customModulesApi } from '@/lib/api'
import { useToast } from '@/components/ui/use-toast'
import { DynamicForm } from '@/components/DynamicForm'
import { customFieldsApi } from '@/lib/api'

interface CustomField {
  field_label: string
  field_name: string
  field_type: string
  options?: string[]
  required: boolean
  default_value?: string
  order: number
  relationship_target?: string
}

interface CustomModule {
  id?: string
  name: string
  slug: string
  description?: string
  icon?: string
  is_active: boolean
  fields?: CustomField[]
}

interface ModuleDataRecord {
  id: string
  [key: string]: any
}

export function CustomModuleManager() {
  const { toast } = useToast()
  const [modules, setModules] = useState<CustomModule[]>([])
  const [loading, setLoading] = useState(false)
  const [editingModule, setEditingModule] = useState<CustomModule | null>(null)
  const [moduleFields, setModuleFields] = useState<CustomField[]>([])
  const [selectedModule, setSelectedModule] = useState<CustomModule | null>(null)
  const [moduleData, setModuleData] = useState<ModuleDataRecord[]>([])
  const [showDataModal, setShowDataModal] = useState(false)
  const [editingRecord, setEditingRecord] = useState<ModuleDataRecord | null>(null)
  const [viewingRecord, setViewingRecord] = useState<ModuleDataRecord | null>(null)
  const [isViewMode, setIsViewMode] = useState(false)
  const [searchTerm, setSearchTerm] = useState('')

  // Helper para converter erros em string
  const getErrorMessage = (error: any): string => {
    if (typeof error === 'string') return error
    if (error?.response?.data?.detail) {
      const detail = error.response.data.detail
      if (typeof detail === 'string') return detail
      if (Array.isArray(detail)) {
        return detail.map((err: any) => {
          if (typeof err === 'string') return err
          if (err?.msg) return err.msg
          return JSON.stringify(err)
        }).join(', ')
      }
      if (typeof detail === 'object') {
        return JSON.stringify(detail)
      }
    }
    return error?.message || 'Erro desconhecido'
  }

  useEffect(() => {
    loadModules()
  }, [])

  useEffect(() => {
    if (selectedModule) {
      console.log('[CustomModuleManager] Módulo selecionado mudou:', selectedModule)
      loadModuleData()
      loadModuleFields()
    } else {
      setModuleFields([])
      setModuleData([])
    }
  }, [selectedModule])

  const loadModules = async () => {
    try {
      setLoading(true)
      const response = await customModulesApi.getModules()
      setModules(response.data || [])
    } catch (error: any) {
      toast({
        variant: 'destructive',
        title: 'Erro',
        description: getErrorMessage(error),
      })
    } finally {
      setLoading(false)
    }
  }

  const loadModuleData = async () => {
    if (!selectedModule?.id) return
    try {
      const response = await customModulesApi.getModuleData(selectedModule.id)
      setModuleData(response.data || [])
    } catch (error: any) {
      toast({
        variant: 'destructive',
        title: 'Erro',
        description: getErrorMessage(error),
      })
    }
  }

  const loadModuleFields = async () => {
    if (!selectedModule?.slug) {
      console.log('[CustomModuleManager] loadModuleFields: selectedModule ou slug não existe', selectedModule)
      return
    }
    try {
      console.log('[CustomModuleManager] Carregando campos para módulo:', selectedModule.slug)
      const response = await customFieldsApi.getFields(selectedModule.slug)
      console.log('[CustomModuleManager] Resposta da API:', response.data)
      setModuleFields(response.data || [])
      console.log('[CustomModuleManager] Campos definidos:', response.data?.length || 0)
    } catch (error: any) {
      console.error('[CustomModuleManager] Erro ao carregar campos:', error)
      console.error('[CustomModuleManager] Detalhes do erro:', error.response?.data)
      setModuleFields([])
    }
  }

  const handleAddModule = () => {
    const newModule: CustomModule = {
      name: '',
      slug: '',
      description: '',
      is_active: true,
    }
    setEditingModule(newModule)
    setModuleFields([])
  }

  const handleEditModule = (module: CustomModule) => {
    setEditingModule({ ...module })
  }

  const handleSaveModule = async () => {
    if (!editingModule) return

    if (!editingModule.name.trim()) {
      toast({
        variant: 'destructive',
        title: 'Erro',
        description: 'O nome do módulo é obrigatório',
      })
      return
    }

    if (!editingModule.slug.trim()) {
      editingModule.slug = editingModule.name
        .toLowerCase()
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .replace(/[^a-z0-9]+/g, '_')
        .replace(/^_+|_+$/g, '')
    }

    try {
      setLoading(true)
      if (editingModule.id) {
        await customModulesApi.updateModule(editingModule.id, editingModule)
        toast({
          title: 'Sucesso',
          description: 'Módulo atualizado com sucesso',
        })
      } else {
        // Criar novo módulo com campos
        const slug = editingModule.slug || editingModule.name
          .toLowerCase()
          .normalize('NFD')
          .replace(/[\u0300-\u036f]/g, '')
          .replace(/[^a-z0-9]+/g, '_')
          .replace(/^_+|_+$/g, '')
        
        const moduleData = {
          ...editingModule,
          slug: slug,
          fields: moduleFields.length > 0 ? moduleFields.map(f => ({
            module_target: slug, // Incluir module_target com o slug do módulo
            field_label: f.field_label,
            field_name: f.field_name || f.field_label.toLowerCase().replace(/[^a-z0-9]+/g, '_'),
            field_type: f.field_type,
            options: f.options,
            required: f.required,
            default_value: f.default_value,
            order: f.order,
            relationship_target: f.relationship_target,
          })) : undefined,
        }
        const createdModuleResponse = await customModulesApi.createModule(moduleData)
        toast({
          title: 'Sucesso',
          description: 'Módulo criado com sucesso',
        })
        // Recarregar módulos e selecionar o recém-criado
        await loadModules()
        // Aguardar um pouco e então selecionar o módulo recém-criado
        setTimeout(async () => {
          const response = await customModulesApi.getModules()
          const updatedModules = response.data || []
          const newModule = updatedModules.find((m: CustomModule) => m.slug === slug)
          if (newModule) {
            console.log('[CustomModuleManager] Selecionando módulo recém-criado:', newModule)
            setSelectedModule(newModule)
          }
        }, 500)
      }
      setEditingModule(null)
      setModuleFields([])
    } catch (error: any) {
      toast({
        variant: 'destructive',
        title: 'Erro',
        description: getErrorMessage(error),
      })
    } finally {
      setLoading(false)
    }
  }

  const handleDeleteModule = async (moduleId: string) => {
    if (!confirm('Tem certeza que deseja excluir este módulo? Todos os dados serão perdidos.')) return

    try {
      setLoading(true)
      await customModulesApi.deleteModule(moduleId)
      toast({
        title: 'Sucesso',
        description: 'Módulo excluído com sucesso',
      })
      if (selectedModule?.id === moduleId) {
        setSelectedModule(null)
      }
      await loadModules()
    } catch (error: any) {
      toast({
        variant: 'destructive',
        title: 'Erro',
        description: getErrorMessage(error),
      })
    } finally {
      setLoading(false)
    }
  }

  const handleAddRecord = () => {
    setEditingRecord({} as ModuleDataRecord)
    setShowDataModal(true)
  }

  const handleViewRecord = (record: ModuleDataRecord) => {
    setViewingRecord(record)
    setIsViewMode(true)
    setShowDataModal(true)
  }

  const handleEditRecord = (record: ModuleDataRecord) => {
    setEditingRecord({ ...record })
    setIsViewMode(false)
    setShowDataModal(true)
  }

  const handleSaveRecord = async (data: Record<string, any>) => {
    if (!selectedModule?.id) return

    try {
      setLoading(true)
      if (editingRecord?.id) {
        await customModulesApi.updateModuleData(selectedModule.id, editingRecord.id, data)
        toast({
          title: 'Sucesso',
          description: 'Registro atualizado com sucesso',
        })
      } else {
        await customModulesApi.createModuleData(selectedModule.id, data)
        toast({
          title: 'Sucesso',
          description: 'Registro criado com sucesso',
        })
      }
      setShowDataModal(false)
      setEditingRecord(null)
      setViewingRecord(null)
      setIsViewMode(false)
      await loadModuleData()
    } catch (error: any) {
      toast({
        variant: 'destructive',
        title: 'Erro',
        description: getErrorMessage(error),
      })
    } finally {
      setLoading(false)
    }
  }

  const handleDeleteRecord = async (recordId: string) => {
    if (!selectedModule?.id) return
    if (!confirm('Tem certeza que deseja excluir este registro?')) return

    try {
      setLoading(true)
      await customModulesApi.deleteModuleData(selectedModule.id, recordId)
      toast({
        title: 'Sucesso',
        description: 'Registro excluído com sucesso',
      })
      await loadModuleData()
    } catch (error: any) {
      toast({
        variant: 'destructive',
        title: 'Erro',
        description: getErrorMessage(error),
      })
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-bold mb-2">Gerenciador de Módulos Customizados</h2>
        <p className="text-muted-foreground">
          Crie e gerencie módulos customizados do zero
        </p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Lista de Módulos */}
        <Card>
          <CardHeader>
            <div className="flex items-center justify-between">
              <div>
                <CardTitle>Módulos Customizados</CardTitle>
                <CardDescription>
                  Gerencie seus módulos customizados
                </CardDescription>
              </div>
              <Button onClick={handleAddModule} disabled={loading}>
                <Plus className="h-4 w-4 mr-2" />
                Novo Módulo
              </Button>
            </div>
          </CardHeader>
          <CardContent>
            {loading && modules.length === 0 ? (
              <div className="text-center py-8 text-muted-foreground">
                Carregando módulos...
              </div>
            ) : modules.length === 0 ? (
              <div className="text-center py-8 text-muted-foreground">
                Nenhum módulo customizado. Clique em "Novo Módulo" para começar.
              </div>
            ) : (
              <div className="space-y-2">
                {modules.map((module) => (
                  <div
                    key={module.id}
                    className={`flex items-center justify-between p-4 border rounded-lg cursor-pointer transition-colors ${
                      selectedModule?.id === module.id
                        ? 'bg-primary/10 border-primary'
                        : 'hover:bg-accent'
                    }`}
                    onClick={() => setSelectedModule(module)}
                  >
                    <div className="flex-1">
                      <div className="font-medium flex items-center gap-2">
                        <Table className="h-4 w-4" />
                        {module.name}
                      </div>
                      <div className="text-sm text-muted-foreground">
                        {module.description || 'Sem descrição'} | Slug: {module.slug}
                      </div>
                    </div>
                    <div className="flex gap-2" onClick={(e) => e.stopPropagation()}>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => handleEditModule(module)}
                      >
                        <Edit className="h-4 w-4" />
                      </Button>
                      <Button
                        variant="destructive"
                        size="sm"
                        onClick={() => module.id && handleDeleteModule(module.id)}
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

        {/* Dados do Módulo Selecionado */}
        {selectedModule && (
          <Card>
            <CardHeader>
              <div className="flex items-center justify-between">
                <div>
                  <CardTitle>{selectedModule.name}</CardTitle>
                  <CardDescription>
                    Gerencie os dados deste módulo
                  </CardDescription>
                </div>
                <Button onClick={handleAddRecord} disabled={loading}>
                  <Plus className="h-4 w-4 mr-2" />
                  Novo Registro
                </Button>
              </div>
            </CardHeader>
            <CardContent>
              {/* Filtros */}
              <div className="mb-4 space-y-4">
                <div className="relative">
                  <Search className="absolute left-2 top-2.5 h-4 w-4 text-muted-foreground" />
                  <Input
                    placeholder="Buscar registros..."
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                    className="pl-8"
                  />
                </div>
              </div>

              {moduleData.length === 0 ? (
                <div className="text-center py-8 text-muted-foreground">
                  Nenhum registro. Clique em "Novo Registro" para começar.
                </div>
              ) : (
                <div className="grid gap-4">
                  {moduleData
                    .filter((record) => {
                      if (!searchTerm) return true
                      const searchLower = searchTerm.toLowerCase()
                      return moduleFields.some((field) => {
                        const value = record[field.field_name]
                        return value && String(value).toLowerCase().includes(searchLower)
                      })
                    })
                    .map((record) => (
                      <Card
                        key={record.id}
                        className="cursor-pointer hover:shadow-lg transition-all duration-200 border-l-4 border-l-indigo-300 hover:border-l-indigo-500 bg-gradient-to-r from-white to-indigo-50/50 dark:from-background dark:to-indigo-950/50"
                        onClick={() => handleViewRecord(record)}
                      >
                        <CardHeader>
                          <div className="flex items-start justify-between">
                            <div className="flex-1 space-y-2">
                              {moduleFields.length > 0 ? (
                                <>
                                  {moduleFields.slice(0, 3).map((field) => (
                                    <div key={field.id || field.field_name} className="flex items-center gap-2">
                                      <span className="text-sm font-medium text-muted-foreground min-w-[120px]">
                                        {field.field_label}:
                                      </span>
                                      <span className="text-sm">
                                        {record[field.field_name] || '-'}
                                      </span>
                                    </div>
                                  ))}
                                  {moduleFields.length > 3 && (
                                    <div className="text-xs text-muted-foreground">
                                      +{moduleFields.length - 3} campo(s) adicional(is)
                                    </div>
                                  )}
                                </>
                              ) : (
                                <div className="text-sm">
                                  {Object.entries(record)
                                    .filter(([k]) => !['id', 'tenant_id', 'owner_id', 'created_by_id', 'created_at', 'updated_at'].includes(k))
                                    .slice(0, 3)
                                    .map(([k, v]) => (
                                      <div key={k} className="flex items-center gap-2">
                                        <span className="text-sm font-medium text-muted-foreground min-w-[120px]">
                                          {k}:
                                        </span>
                                        <span className="text-sm">{String(v)}</span>
                                      </div>
                                    ))}
                                </div>
                              )}
                            </div>
                            <div className="flex gap-2" onClick={(e) => e.stopPropagation()}>
                              <Button
                                variant="outline"
                                size="sm"
                                onClick={() => handleViewRecord(record)}
                                title="Visualizar"
                              >
                                <Eye className="h-4 w-4" />
                              </Button>
                              <Button
                                variant="outline"
                                size="sm"
                                onClick={() => handleEditRecord(record)}
                                title="Editar"
                              >
                                <Edit className="h-4 w-4" />
                              </Button>
                              <Button
                                variant="destructive"
                                size="sm"
                                onClick={() => handleDeleteRecord(record.id)}
                                title="Excluir"
                              >
                                <Trash2 className="h-4 w-4" />
                              </Button>
                            </div>
                          </div>
                        </CardHeader>
                      </Card>
                    ))}
                </div>
              )}
            </CardContent>
          </Card>
        )}
      </div>

      {/* Modal de Edição de Módulo */}
      {editingModule && (
        <Card>
          <CardHeader>
            <div className="flex items-center justify-between">
              <CardTitle>
                {editingModule.id ? 'Editar Módulo' : 'Novo Módulo'}
              </CardTitle>
              <Button
                variant="ghost"
                size="icon"
                onClick={() => setEditingModule(null)}
              >
                <X className="h-4 w-4" />
              </Button>
            </div>
          </CardHeader>
          <CardContent className="space-y-4">
            <div>
              <Label htmlFor="module_name">Nome do Módulo *</Label>
              <Input
                id="module_name"
                value={editingModule.name}
                onChange={(e) =>
                  setEditingModule({ ...editingModule, name: e.target.value })
                }
                placeholder="Ex: Contratos"
              />
            </div>

            <div>
              <Label htmlFor="module_slug">Slug (Identificador) *</Label>
              <Input
                id="module_slug"
                value={editingModule.slug}
                onChange={(e) =>
                  setEditingModule({
                    ...editingModule,
                    slug: e.target.value
                      .toLowerCase()
                      .normalize('NFD')
                      .replace(/[\u0300-\u036f]/g, '')
                      .replace(/[^a-z0-9]+/g, '_')
                      .replace(/^_+|_+$/g, ''),
                  })
                }
                placeholder="Ex: contratos"
                disabled={!!editingModule.id}
              />
              <p className="text-xs text-muted-foreground mt-1">
                Identificador único usado programaticamente
              </p>
            </div>

            <div>
              <Label htmlFor="module_description">Descrição</Label>
              <Input
                id="module_description"
                value={editingModule.description || ''}
                onChange={(e) =>
                  setEditingModule({ ...editingModule, description: e.target.value })
                }
                placeholder="Descrição do módulo (opcional)"
              />
            </div>

            <div className="flex items-center space-x-2">
              <input
                type="checkbox"
                id="module_active"
                checked={editingModule.is_active}
                onChange={(e) =>
                  setEditingModule({ ...editingModule, is_active: e.target.checked })
                }
                className="h-4 w-4"
              />
              <Label htmlFor="module_active">Módulo ativo</Label>
            </div>

            {/* Campos do Módulo - apenas ao criar novo módulo */}
            {!editingModule.id && (
              <div className="space-y-4 border-t pt-4">
                <div className="flex items-center justify-between">
                  <Label className="text-base font-semibold">Campos do Módulo</Label>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() => {
                      const newField: CustomField = {
                        module_target: editingModule.slug || '',
                        field_label: '',
                        field_type: 'text',
                        field_name: '',
                        required: false,
                        order: moduleFields.length,
                        options: [],
                      }
                      setModuleFields([...moduleFields, newField])
                    }}
                  >
                    <Plus className="h-4 w-4 mr-2" />
                    Adicionar Campo
                  </Button>
                </div>

                {moduleFields.length === 0 ? (
                  <p className="text-sm text-muted-foreground">
                    Adicione campos para este módulo. Eles serão criados automaticamente junto com o módulo.
                  </p>
                ) : (
                  <div className="space-y-3">
                    {moduleFields.map((field, index) => (
                      <Card key={index} className="p-4">
                        <div className="space-y-3">
                          <div className="flex items-center justify-between">
                            <Label className="text-sm font-medium">Campo {index + 1}</Label>
                            <Button
                              type="button"
                              variant="ghost"
                              size="sm"
                              onClick={() => {
                                setModuleFields(moduleFields.filter((_, i) => i !== index))
                              }}
                            >
                              <Trash2 className="h-4 w-4" />
                            </Button>
                          </div>

                          <div className="grid grid-cols-2 gap-3">
                            <div>
                              <Label htmlFor={`field_label_${index}`}>Rótulo *</Label>
                              <Input
                                id={`field_label_${index}`}
                                value={field.field_label}
                                onChange={(e) => {
                                  const newFields = [...moduleFields]
                                  newFields[index].field_label = e.target.value
                                  if (!newFields[index].field_name) {
                                    newFields[index].field_name = e.target.value
                                      .toLowerCase()
                                      .normalize('NFD')
                                      .replace(/[\u0300-\u036f]/g, '')
                                      .replace(/[^a-z0-9]+/g, '_')
                                      .replace(/^_+|_+$/g, '')
                                  }
                                  setModuleFields(newFields)
                                }}
                                placeholder="Ex: Nome do Cliente"
                              />
                            </div>

                            <div>
                              <Label htmlFor={`field_type_${index}`}>Tipo *</Label>
                              <Select
                                value={field.field_type}
                                onValueChange={(value: any) => {
                                  const newFields = [...moduleFields]
                                  newFields[index].field_type = value
                                  setModuleFields(newFields)
                                }}
                              >
                                <SelectTrigger>
                                  <SelectValue />
                                </SelectTrigger>
                                <SelectContent>
                                  <SelectItem value="text">Texto</SelectItem>
                                  <SelectItem value="number">Número</SelectItem>
                                  <SelectItem value="email">E-mail</SelectItem>
                                  <SelectItem value="date">Data</SelectItem>
                                  <SelectItem value="boolean">Sim/Não</SelectItem>
                                  <SelectItem value="select">Seleção</SelectItem>
                                  <SelectItem value="textarea">Área de Texto</SelectItem>
                                  <SelectItem value="file">Arquivo</SelectItem>
                                  <SelectItem value="url">URL</SelectItem>
                                </SelectContent>
                              </Select>
                            </div>
                          </div>

                          {field.field_type === 'select' && (
                            <div>
                              <Label htmlFor={`field_options_${index}`}>Opções (uma por linha)</Label>
                              <textarea
                                id={`field_options_${index}`}
                                className="w-full min-h-[80px] p-2 border rounded-md"
                                value={field.options?.join('\n') || ''}
                                onChange={(e) => {
                                  const newFields = [...moduleFields]
                                  newFields[index].options = e.target.value
                                    .split('\n')
                                    .filter((o) => o.trim())
                                  setModuleFields(newFields)
                                }}
                                placeholder="Opção 1&#10;Opção 2"
                              />
                            </div>
                          )}

                          <div className="flex items-center space-x-2">
                            <input
                              type="checkbox"
                              id={`field_required_${index}`}
                              checked={field.required}
                              onChange={(e) => {
                                const newFields = [...moduleFields]
                                newFields[index].required = e.target.checked
                                setModuleFields(newFields)
                              }}
                              className="h-4 w-4"
                            />
                            <Label htmlFor={`field_required_${index}`}>Campo obrigatório</Label>
                          </div>
                        </div>
                      </Card>
                    ))}
                  </div>
                )}
              </div>
            )}

            <div className="flex justify-end gap-2">
              <Button variant="outline" onClick={() => {
                setEditingModule(null)
                setModuleFields([])
              }}>
                Cancelar
              </Button>
              <Button onClick={handleSaveModule} disabled={loading}>
                <Save className="h-4 w-4 mr-2" />
                Salvar
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Modal de Dados */}
      {showDataModal && selectedModule && (
        <Card className="fixed inset-4 z-50 overflow-auto bg-background shadow-xl">
          <CardHeader>
            <div className="flex items-center justify-between">
              <CardTitle>
                {isViewMode ? 'Visualizar Registro' : editingRecord?.id ? 'Editar Registro' : 'Novo Registro'}
              </CardTitle>
              <Button
                variant="ghost"
                size="icon"
                onClick={() => {
                  setShowDataModal(false)
                  setEditingRecord(null)
                  setViewingRecord(null)
                  setIsViewMode(false)
                }}
              >
                <X className="h-4 w-4" />
              </Button>
            </div>
          </CardHeader>
          <CardContent>
            {moduleFields.length === 0 ? (
              <div className="text-center py-8 text-muted-foreground">
                <p>Nenhum campo customizado definido para este módulo.</p>
                <p className="text-sm mt-2">
                  Vá para "Editor de Campos" e adicione campos para o módulo "{selectedModule.slug}".
                </p>
              </div>
            ) : isViewMode && viewingRecord ? (
              <div className="space-y-4">
                <div className="grid gap-4">
                  {moduleFields.map((field) => {
                    const fieldValue = viewingRecord[field.field_name]
                    return (
                      <div key={field.id || field.field_name} className="space-y-2">
                        <Label className="text-sm font-semibold">{field.field_label}</Label>
                        <div className="p-3 bg-muted rounded-md min-h-[40px]">
                          <p className="text-sm">
                            {fieldValue !== null && fieldValue !== undefined && fieldValue !== ''
                              ? String(fieldValue)
                              : '-'}
                          </p>
                        </div>
                      </div>
                    )
                  })}
                  {/* Campos do sistema */}
                  <div className="border-t pt-4 mt-4 space-y-2">
                    <Label className="text-sm font-semibold">ID</Label>
                    <div className="p-3 bg-muted rounded-md">
                      <p className="text-sm">{viewingRecord.id}</p>
                    </div>
                    {viewingRecord.created_at && (
                      <>
                        <Label className="text-sm font-semibold">Criado em</Label>
                        <div className="p-3 bg-muted rounded-md">
                          <p className="text-sm">{new Date(viewingRecord.created_at).toLocaleString('pt-BR')}</p>
                        </div>
                      </>
                    )}
                    {viewingRecord.updated_at && (
                      <>
                        <Label className="text-sm font-semibold">Atualizado em</Label>
                        <div className="p-3 bg-muted rounded-md">
                          <p className="text-sm">{new Date(viewingRecord.updated_at).toLocaleString('pt-BR')}</p>
                        </div>
                      </>
                    )}
                  </div>
                </div>
                <div className="flex justify-end gap-2 pt-4 border-t">
                  <Button variant="outline" onClick={() => {
                    setIsViewMode(false)
                    setEditingRecord(viewingRecord)
                    setViewingRecord(null)
                  }}>
                    <Edit className="h-4 w-4 mr-2" />
                    Editar
                  </Button>
                  <Button variant="outline" onClick={() => {
                    setShowDataModal(false)
                    setViewingRecord(null)
                    setIsViewMode(false)
                  }}>
                    Fechar
                  </Button>
                </div>
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
      )}
    </div>
  )
}

