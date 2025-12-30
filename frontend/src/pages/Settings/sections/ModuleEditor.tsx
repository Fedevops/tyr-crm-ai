import { useState, useEffect } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Plus, Trash2, Save, X } from 'lucide-react'
import { customFieldsApi } from '@/lib/api'
import { useToast } from '@/components/ui/use-toast'

type CustomFieldType = 'text' | 'number' | 'email' | 'date' | 'boolean' | 'select' | 'textarea' | 'file' | 'url' | 'relationship'

interface CustomField {
  id?: string
  module_target: string
  field_label: string
  field_type: CustomFieldType
  field_name: string
  options?: string[]
  required: boolean
  default_value?: string
  order: number
  relationship_target?: string
}

const NATIVE_MODULES = [
  { value: 'leads', label: 'Leads' },
  { value: 'orders', label: 'Pedidos' },
  { value: 'products', label: 'Produtos' },
  { value: 'contacts', label: 'Contatos' },
  { value: 'accounts', label: 'Contas' },
  { value: 'opportunities', label: 'Oportunidades' },
  { value: 'proposals', label: 'Propostas' },
]

const FIELD_TYPES: { value: CustomFieldType; label: string }[] = [
  { value: 'text', label: 'Texto' },
  { value: 'number', label: 'Número' },
  { value: 'email', label: 'E-mail' },
  { value: 'date', label: 'Data' },
  { value: 'boolean', label: 'Sim/Não' },
  { value: 'select', label: 'Seleção' },
  { value: 'textarea', label: 'Área de Texto' },
  { value: 'file', label: 'Arquivo' },
  { value: 'url', label: 'URL' },
  { value: 'relationship', label: 'Relacionamento' },
]

function slugify(text: string): string {
  return text
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
}

export function ModuleEditor() {
  const { toast } = useToast()
  const [selectedModule, setSelectedModule] = useState<string>('')
  const [fields, setFields] = useState<CustomField[]>([])
  const [loading, setLoading] = useState(false)
  const [editingField, setEditingField] = useState<CustomField | null>(null)

  useEffect(() => {
    if (selectedModule) {
      loadFields()
    } else {
      setFields([])
    }
  }, [selectedModule])

  const loadFields = async () => {
    if (!selectedModule) return
    try {
      setLoading(true)
      const response = await customFieldsApi.getFields(selectedModule)
      setFields(response.data || [])
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

  const handleAddField = () => {
    const newField: CustomField = {
      module_target: selectedModule,
      field_label: '',
      field_type: 'text',
      field_name: '',
      required: false,
      order: fields.length,
      options: [],
    }
    setEditingField(newField)
  }

  const handleEditField = (field: CustomField) => {
    setEditingField({ ...field })
  }

  const handleSaveField = async () => {
    if (!editingField) return

    if (!editingField.field_label.trim()) {
      toast({
        variant: 'destructive',
        title: 'Erro',
        description: 'O rótulo do campo é obrigatório',
      })
      return
    }

    if (!editingField.field_name.trim()) {
      editingField.field_name = slugify(editingField.field_label)
    }

    try {
      setLoading(true)
      if (editingField.id) {
        await customFieldsApi.updateField(editingField.id, editingField)
        toast({
          title: 'Sucesso',
          description: 'Campo atualizado com sucesso',
        })
      } else {
        await customFieldsApi.createField(editingField)
        toast({
          title: 'Sucesso',
          description: 'Campo criado com sucesso',
        })
      }
      setEditingField(null)
      await loadFields()
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

  const handleDeleteField = async (fieldId: string) => {
    if (!confirm('Tem certeza que deseja excluir este campo?')) return

    try {
      setLoading(true)
      await customFieldsApi.deleteField(fieldId)
      toast({
        title: 'Sucesso',
        description: 'Campo excluído com sucesso',
      })
      await loadFields()
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

  const handleFieldLabelChange = (value: string) => {
    if (!editingField) return
    setEditingField({
      ...editingField,
      field_label: value,
      field_name: editingField.id ? editingField.field_name : slugify(value),
    })
  }

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-bold mb-2">Editor de Campos Customizados</h2>
        <p className="text-muted-foreground">
          Adicione campos customizados aos módulos nativos do sistema
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Selecionar Módulo</CardTitle>
          <CardDescription>
            Escolha o módulo ao qual deseja adicionar campos customizados
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Select value={selectedModule} onValueChange={setSelectedModule}>
            <SelectTrigger>
              <SelectValue placeholder="Selecione um módulo" />
            </SelectTrigger>
            <SelectContent>
              {NATIVE_MODULES.map((module) => (
                <SelectItem key={module.value} value={module.value}>
                  {module.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </CardContent>
      </Card>

      {selectedModule && (
        <>
          <Card>
            <CardHeader>
              <div className="flex items-center justify-between">
                <div>
                  <CardTitle>Campos Customizados</CardTitle>
                  <CardDescription>
                    Gerencie os campos customizados do módulo selecionado
                  </CardDescription>
                </div>
                <Button onClick={handleAddField} disabled={loading}>
                  <Plus className="h-4 w-4 mr-2" />
                  Adicionar Campo
                </Button>
              </div>
            </CardHeader>
            <CardContent>
              {loading && fields.length === 0 ? (
                <div className="text-center py-8 text-muted-foreground">
                  Carregando campos...
                </div>
              ) : fields.length === 0 ? (
                <div className="text-center py-8 text-muted-foreground">
                  Nenhum campo customizado. Clique em "Adicionar Campo" para começar.
                </div>
              ) : (
                <div className="space-y-2">
                  {fields.map((field) => (
                    <div
                      key={field.id}
                      className="flex items-center justify-between p-4 border rounded-lg"
                    >
                      <div className="flex-1">
                        <div className="font-medium">{field.field_label}</div>
                        <div className="text-sm text-muted-foreground">
                          Tipo: {FIELD_TYPES.find((t) => t.value === field.field_type)?.label} | 
                          Nome: {field.field_name} | 
                          {field.required && <span className="text-red-500">Obrigatório</span>}
                        </div>
                      </div>
                      <div className="flex gap-2">
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => handleEditField(field)}
                        >
                          Editar
                        </Button>
                        <Button
                          variant="destructive"
                          size="sm"
                          onClick={() => field.id && handleDeleteField(field.id)}
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

          {editingField && (
            <Card>
              <CardHeader>
                <div className="flex items-center justify-between">
                  <CardTitle>
                    {editingField.id ? 'Editar Campo' : 'Novo Campo'}
                  </CardTitle>
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={() => setEditingField(null)}
                  >
                    <X className="h-4 w-4" />
                  </Button>
                </div>
              </CardHeader>
              <CardContent className="space-y-4">
                <div>
                  <Label htmlFor="field_label">Rótulo do Campo *</Label>
                  <Input
                    id="field_label"
                    value={editingField.field_label}
                    onChange={(e) => handleFieldLabelChange(e.target.value)}
                    placeholder="Ex: Data de Nascimento"
                  />
                </div>

                <div>
                  <Label htmlFor="field_name">Nome do Campo (Slug)</Label>
                  <Input
                    id="field_name"
                    value={editingField.field_name}
                    onChange={(e) =>
                      setEditingField({ ...editingField, field_name: slugify(e.target.value) })
                    }
                    placeholder="Ex: data_nascimento"
                    disabled={!!editingField.id}
                  />
                  <p className="text-xs text-muted-foreground mt-1">
                    Nome usado programaticamente (gerado automaticamente a partir do rótulo)
                  </p>
                </div>

                <div>
                  <Label htmlFor="field_type">Tipo de Campo *</Label>
                  <Select
                    value={editingField.field_type}
                    onValueChange={(value: CustomFieldType) =>
                      setEditingField({ ...editingField, field_type: value })
                    }
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {FIELD_TYPES.map((type) => (
                        <SelectItem key={type.value} value={type.value}>
                          {type.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                {editingField.field_type === 'select' && (
                  <div>
                    <Label htmlFor="options">Opções (uma por linha)</Label>
                    <textarea
                      id="options"
                      className="w-full min-h-[100px] p-2 border rounded-md"
                      value={editingField.options?.join('\n') || ''}
                      onChange={(e) =>
                        setEditingField({
                          ...editingField,
                          options: e.target.value.split('\n').filter((o) => o.trim()),
                        })
                      }
                      placeholder="Opção 1&#10;Opção 2&#10;Opção 3"
                    />
                  </div>
                )}

                {editingField.field_type === 'relationship' && (
                  <div>
                    <Label htmlFor="relationship_target">Módulo Relacionado</Label>
                    <Select
                      value={editingField.relationship_target || ''}
                      onValueChange={(value) =>
                        setEditingField({ ...editingField, relationship_target: value })
                      }
                    >
                      <SelectTrigger>
                        <SelectValue placeholder="Selecione um módulo" />
                      </SelectTrigger>
                      <SelectContent>
                        {NATIVE_MODULES.map((module) => (
                          <SelectItem key={module.value} value={module.value}>
                            {module.label}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                )}

                <div>
                  <Label htmlFor="default_value">Valor Padrão</Label>
                  <Input
                    id="default_value"
                    value={editingField.default_value || ''}
                    onChange={(e) =>
                      setEditingField({ ...editingField, default_value: e.target.value })
                    }
                    placeholder="Valor padrão (opcional)"
                  />
                </div>

                <div className="flex items-center space-x-2">
                  <input
                    type="checkbox"
                    id="required"
                    checked={editingField.required}
                    onChange={(e) =>
                      setEditingField({ ...editingField, required: e.target.checked })
                    }
                    className="h-4 w-4"
                  />
                  <Label htmlFor="required">Campo obrigatório</Label>
                </div>

                <div className="flex justify-end gap-2">
                  <Button variant="outline" onClick={() => setEditingField(null)}>
                    Cancelar
                  </Button>
                  <Button onClick={handleSaveField} disabled={loading}>
                    <Save className="h-4 w-4 mr-2" />
                    Salvar
                  </Button>
                </div>
              </CardContent>
            </Card>
          )}
        </>
      )}
    </div>
  )
}

