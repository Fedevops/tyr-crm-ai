import { useState, useEffect, useCallback } from 'react'
import { useTranslation } from 'react-i18next'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Badge } from '@/components/ui/badge'
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { 
  Plus, 
  Trash2, 
  GripVertical, 
  FileText, 
  Copy,
  CheckCircle2,
  Loader2
} from 'lucide-react'
import { formsApi } from '@/lib/api'
import { useToast } from '@/components/ui/use-toast'
import { cn } from '@/lib/utils'

interface FormField {
  id?: number
  field_type: string
  label: string
  name: string
  placeholder?: string
  required: boolean
  order: number
  options?: string[]
}

interface Form {
  id: number
  tenant_id: number
  name: string
  description?: string
  button_text: string
  button_color: string
  success_message: string
  is_active: boolean
  created_at: string
  updated_at: string
  fields: FormField[]
}

const FIELD_TYPES = [
  { value: 'text', label: 'Texto' },
  { value: 'email', label: 'E-mail' },
  { value: 'phone', label: 'Telefone' },
  { value: 'textarea', label: 'Área de Texto' },
  { value: 'select', label: 'Seleção' },
  { value: 'number', label: 'Número' },
  { value: 'date', label: 'Data' },
  { value: 'checkbox', label: 'Checkbox' },
]

const STANDARD_FIELDS: Array<{ label: string; name: string; type: string }> = [
  { label: 'Nome', name: 'name', type: 'text' },
  { label: 'E-mail', name: 'email', type: 'email' },
  { label: 'Telefone', name: 'phone', type: 'phone' },
  { label: 'Empresa', name: 'company', type: 'text' },
  { label: 'Cargo', name: 'position', type: 'text' },
  { label: 'Telefone Comercial', name: 'phone_commercial', type: 'phone' },
  { label: 'Website', name: 'website', type: 'text' },
  { label: 'Mensagem', name: 'message', type: 'textarea' },
]

export function FormBuilder() {
  const { t } = useTranslation()
  const { toast } = useToast()
  const [forms, setForms] = useState<Form[]>([])
  const [loading, setLoading] = useState(true)
  const [showFormModal, setShowFormModal] = useState(false)
  const [editingForm, setEditingForm] = useState<Form | null>(null)
  const [formData, setFormData] = useState({
    name: '',
    description: '',
    button_text: 'Enviar',
    button_color: '#3b82f6',
    success_message: 'Obrigado! Entraremos em contato em breve.',
    is_active: true,
    fields: [] as FormField[]
  })
  const [showScriptModal, setShowScriptModal] = useState(false)
  const [selectedFormForScript, setSelectedFormForScript] = useState<Form | null>(null)

  const fetchForms = useCallback(async () => {
    setLoading(true)
    try {
      const response = await formsApi.getForms()
      setForms(response.data)
    } catch (error) {
      console.error('Erro ao buscar formulários:', error)
      toast({
        variant: 'destructive',
        title: 'Erro',
        description: 'Não foi possível carregar os formulários.',
      })
    } finally {
      setLoading(false)
    }
  }, [toast])

  useEffect(() => {
    fetchForms()
  }, [fetchForms])

  const handleAddField = () => {
    const newField: FormField = {
      field_type: 'text',
      label: '',
      name: '',
      placeholder: '',
      required: false,
      order: formData.fields.length,
      options: []
    }
    setFormData({
      ...formData,
      fields: [...formData.fields, newField]
    })
  }

  const handleRemoveField = (index: number) => {
    setFormData({
      ...formData,
      fields: formData.fields.filter((_, i) => i !== index).map((f, i) => ({ ...f, order: i }))
    })
  }

  const handleFieldChange = (index: number, field: Partial<FormField>) => {
    const newFields = [...formData.fields]
    newFields[index] = { ...newFields[index], ...field }
    setFormData({ ...formData, fields: newFields })
  }

  const handleAddStandardField = (standardField: typeof STANDARD_FIELDS[0]) => {
    const newField: FormField = {
      field_type: standardField.type,
      label: standardField.label,
      name: standardField.name,
      placeholder: '',
      required: false,
      order: formData.fields.length,
      options: []
    }
    setFormData({
      ...formData,
      fields: [...formData.fields, newField]
    })
  }

  const handleSave = async () => {
    // Validar campos
    if (!formData.name.trim()) {
      toast({
        variant: 'destructive',
        title: 'Erro',
        description: 'Nome do formulário é obrigatório',
      })
      return
    }

    for (let i = 0; i < formData.fields.length; i++) {
      const field = formData.fields[i]
      if (!field.label.trim() || !field.name.trim()) {
        toast({
          variant: 'destructive',
          title: 'Erro',
          description: `Campo ${i + 1}: Label e Nome são obrigatórios`,
        })
        return
      }
    }

    try {
      if (editingForm) {
        await formsApi.updateForm(editingForm.id, formData)
        toast({
          title: 'Sucesso',
          description: 'Formulário atualizado com sucesso!',
        })
      } else {
        await formsApi.createForm(formData)
        toast({
          title: 'Sucesso',
          description: 'Formulário criado com sucesso!',
        })
      }
      setShowFormModal(false)
      setEditingForm(null)
      setFormData({
        name: '',
        description: '',
        button_text: 'Enviar',
        button_color: '#3b82f6',
        success_message: 'Obrigado! Entraremos em contato em breve.',
        is_active: true,
        fields: []
      })
      fetchForms()
    } catch (error: any) {
      console.error('Erro ao salvar formulário:', error)
      toast({
        variant: 'destructive',
        title: 'Erro',
        description: error.response?.data?.detail || 'Não foi possível salvar o formulário.',
      })
    }
  }

  const handleEdit = (form: Form) => {
    setEditingForm(form)
    setFormData({
      name: form.name,
      description: form.description || '',
      button_text: form.button_text,
      button_color: form.button_color,
      success_message: form.success_message,
      is_active: form.is_active,
      fields: form.fields.map(f => ({ ...f }))
    })
    setShowFormModal(true)
  }

  const handleDelete = async (formId: number) => {
    if (!confirm('Tem certeza que deseja excluir este formulário?')) return

    try {
      await formsApi.deleteForm(formId)
      toast({
        title: 'Sucesso',
        description: 'Formulário excluído com sucesso!',
      })
      fetchForms()
    } catch (error: any) {
      console.error('Erro ao excluir formulário:', error)
      toast({
        variant: 'destructive',
        title: 'Erro',
        description: error.response?.data?.detail || 'Não foi possível excluir o formulário.',
      })
    }
  }

  const handleShowScript = (form: Form) => {
    setSelectedFormForScript(form)
    setShowScriptModal(true)
  }

  const getScriptCode = (form: Form) => {
    const apiUrl = import.meta.env.VITE_API_URL || 'http://localhost:8000'
    return `<script src="${apiUrl}/api/widgets/tyr-form.js?form_id=${form.id}" data-api-url="${apiUrl}"></script>`
  }

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text)
    toast({
      title: 'Copiado!',
      description: 'Script copiado para a área de transferência',
    })
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center p-8">
        <Loader2 className="h-6 w-6 animate-spin text-primary mr-2" />
        <div className="text-muted-foreground">Carregando formulários...</div>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold">Gerador de Formulários</h2>
          <p className="text-muted-foreground mt-1">
            Crie formulários personalizados para capturar leads no seu site
          </p>
        </div>
        <Button onClick={() => {
          setEditingForm(null)
          setFormData({
            name: '',
            description: '',
            button_text: 'Enviar',
            button_color: '#3b82f6',
            success_message: 'Obrigado! Entraremos em contato em breve.',
            is_active: true,
            fields: []
          })
          setShowFormModal(true)
        }}>
          <Plus className="h-4 w-4 mr-2" />
          Novo Formulário
        </Button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {forms.map((form) => (
          <Card key={form.id}>
            <CardHeader>
              <div className="flex items-start justify-between">
                <div>
                  <CardTitle className="text-base">{form.name}</CardTitle>
                  <CardDescription className="text-xs mt-1">
                    {form.fields.length} campo(s)
                  </CardDescription>
                </div>
                {form.is_active ? (
                  <Badge variant="default">
                    <CheckCircle2 className="h-3 w-3 mr-1" />
                    Ativo
                  </Badge>
                ) : (
                  <Badge variant="secondary">Inativo</Badge>
                )}
              </div>
            </CardHeader>
            <CardContent>
              <div className="flex gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => handleEdit(form)}
                  className="flex-1"
                >
                  Editar
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => handleShowScript(form)}
                >
                  <Copy className="h-4 w-4" />
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => handleDelete(form.id)}
                >
                  <Trash2 className="h-4 w-4" />
                </Button>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Modal de Criação/Edição */}
      <Dialog open={showFormModal} onOpenChange={setShowFormModal}>
        <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>
              {editingForm ? 'Editar Formulário' : 'Novo Formulário'}
            </DialogTitle>
            <DialogDescription>
              Configure seu formulário de captura de leads
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-6">
            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label>Nome do Formulário *</Label>
                <Input
                  value={formData.name}
                  onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                  placeholder="Ex: Formulário de Contato"
                />
              </div>
              <div>
                <Label>Texto do Botão</Label>
                <Input
                  value={formData.button_text}
                  onChange={(e) => setFormData({ ...formData, button_text: e.target.value })}
                />
              </div>
            </div>
            <div>
              <Label>Descrição</Label>
              <Input
                value={formData.description}
                onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                placeholder="Descrição opcional do formulário"
              />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label>Cor do Botão</Label>
                <div className="flex gap-2">
                  <Input
                    type="color"
                    value={formData.button_color}
                    onChange={(e) => setFormData({ ...formData, button_color: e.target.value })}
                    className="w-20"
                  />
                  <Input
                    value={formData.button_color}
                    onChange={(e) => setFormData({ ...formData, button_color: e.target.value })}
                    placeholder="#3b82f6"
                  />
                </div>
              </div>
              <div>
                <Label>Mensagem de Sucesso</Label>
                <Input
                  value={formData.success_message}
                  onChange={(e) => setFormData({ ...formData, success_message: e.target.value })}
                />
              </div>
            </div>

            <div>
              <div className="flex items-center justify-between mb-2">
                <Label>Campos do Formulário</Label>
                <div className="flex gap-2">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={handleAddField}
                  >
                    <Plus className="h-4 w-4 mr-1" />
                    Campo Personalizado
                  </Button>
                </div>
              </div>
              <div className="mb-2">
                <Label className="text-xs text-muted-foreground mb-1 block">Campos Padrão:</Label>
                <div className="flex flex-wrap gap-2">
                  {STANDARD_FIELDS.map((field) => (
                    <Button
                      key={field.name}
                      variant="outline"
                      size="sm"
                      onClick={() => handleAddStandardField(field)}
                    >
                      <Plus className="h-3 w-3 mr-1" />
                      {field.label}
                    </Button>
                  ))}
                </div>
              </div>
              <div className="space-y-3 border rounded-lg p-4 max-h-96 overflow-y-auto">
                {formData.fields.map((field, index) => (
                  <div key={index} className="border rounded p-3 space-y-2">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <GripVertical className="h-4 w-4 text-muted-foreground" />
                        <span className="text-sm font-medium">Campo {index + 1}</span>
                      </div>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => handleRemoveField(index)}
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                    <div className="grid grid-cols-2 gap-2">
                      <div>
                        <Label className="text-xs">Tipo</Label>
                        <Select
                          value={field.field_type}
                          onValueChange={(value) => handleFieldChange(index, { field_type: value })}
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
                      <div>
                        <Label className="text-xs">Label *</Label>
                        <Input
                          value={field.label}
                          onChange={(e) => handleFieldChange(index, { label: e.target.value })}
                          placeholder="Ex: Nome Completo"
                        />
                      </div>
                    </div>
                    <div className="grid grid-cols-2 gap-2">
                      <div>
                        <Label className="text-xs">Nome (HTML) *</Label>
                        <Input
                          value={field.name}
                          onChange={(e) => handleFieldChange(index, { name: e.target.value })}
                          placeholder="Ex: name"
                        />
                      </div>
                      <div>
                        <Label className="text-xs">Placeholder</Label>
                        <Input
                          value={field.placeholder || ''}
                          onChange={(e) => handleFieldChange(index, { placeholder: e.target.value })}
                          placeholder="Texto de exemplo"
                        />
                      </div>
                    </div>
                    {field.field_type === 'select' && (
                      <div>
                        <Label className="text-xs">Opções (uma por linha)</Label>
                        <textarea
                          className="w-full p-2 border rounded text-sm"
                          rows={3}
                          value={field.options?.join('\n') || ''}
                          onChange={(e) => {
                            const options = e.target.value.split('\n').filter(o => o.trim())
                            handleFieldChange(index, { options })
                          }}
                          placeholder="Opção 1&#10;Opção 2&#10;Opção 3"
                        />
                      </div>
                    )}
                    <div className="flex items-center gap-2">
                      <input
                        type="checkbox"
                        id={`required-${index}`}
                        checked={field.required}
                        onChange={(e) => handleFieldChange(index, { required: e.target.checked })}
                      />
                      <Label htmlFor={`required-${index}`} className="text-xs cursor-pointer">
                        Campo obrigatório
                      </Label>
                    </div>
                  </div>
                ))}
                {formData.fields.length === 0 && (
                  <div className="text-center py-8 text-muted-foreground text-sm">
                    Nenhum campo adicionado. Clique em "Campo Personalizado" ou use um campo padrão acima.
                  </div>
                )}
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowFormModal(false)}>
              Cancelar
            </Button>
            <Button onClick={handleSave}>
              {editingForm ? 'Atualizar' : 'Criar'} Formulário
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Modal de Script */}
      <Dialog open={showScriptModal} onOpenChange={setShowScriptModal}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>Script de Integração</DialogTitle>
            <DialogDescription>
              Cole este código no seu site para exibir o formulário
            </DialogDescription>
          </DialogHeader>
          {selectedFormForScript && (
            <div className="space-y-4">
              <div>
                <Label>Script HTML</Label>
                <div className="flex gap-2">
                  <textarea
                    className="flex-1 p-3 border rounded font-mono text-sm"
                    rows={3}
                    readOnly
                    value={getScriptCode(selectedFormForScript)}
                  />
                  <Button
                    variant="outline"
                    onClick={() => copyToClipboard(getScriptCode(selectedFormForScript))}
                  >
                    <Copy className="h-4 w-4" />
                  </Button>
                </div>
              </div>
              <div className="bg-muted p-4 rounded text-sm">
                <p className="font-medium mb-2">Como usar:</p>
                <ol className="list-decimal list-inside space-y-1 text-muted-foreground">
                  <li>Copie o script acima</li>
                  <li>Cole no final do seu HTML, antes do fechamento da tag &lt;/body&gt;</li>
                  <li>O formulário será exibido automaticamente na página</li>
                </ol>
              </div>
            </div>
          )}
          <DialogFooter>
            <Button onClick={() => setShowScriptModal(false)}>Fechar</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}

