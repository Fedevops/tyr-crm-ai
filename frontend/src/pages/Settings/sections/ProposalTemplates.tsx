import { useState, useEffect } from 'react'
import { proposalTemplatesApi } from '@/lib/api'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { useToast } from '@/components/ui/use-toast'
import { Plus, Edit, Trash2, Eye, Code, FileText } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Label } from '@/components/ui/label'

interface ProposalTemplate {
  id: number
  name: string
  description: string | null
  html_content: string
  placeholders: string[] | null
  created_at: string
  updated_at: string
}

export function ProposalTemplates() {
  const { toast } = useToast()
  const [templates, setTemplates] = useState<ProposalTemplate[]>([])
  const [loading, setLoading] = useState(true)
  const [editingId, setEditingId] = useState<number | null>(null)
  const [showPreview, setShowPreview] = useState(false)
  const [formData, setFormData] = useState({
    name: '',
    description: '',
    html_content: '',
  })

  useEffect(() => {
    fetchTemplates()
  }, [])

  const fetchTemplates = async () => {
    try {
      setLoading(true)
      const response = await proposalTemplatesApi.getTemplates()
      // Axios retorna os dados em response.data
      const templatesData = Array.isArray(response.data) ? response.data : []
      setTemplates(templatesData)
    } catch (error) {
      console.error('Erro ao buscar templates:', error)
      toast({
        title: 'Erro',
        description: 'Não foi possível carregar os templates.',
        variant: 'destructive',
      })
      // Garantir que templates seja sempre um array mesmo em caso de erro
      setTemplates([])
    } finally {
      setLoading(false)
    }
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    try {
      if (editingId) {
        await proposalTemplatesApi.updateTemplate(editingId, formData)
        toast({
          title: 'Sucesso',
          description: 'Template atualizado com sucesso!',
        })
      } else {
        await proposalTemplatesApi.createTemplate(formData)
        toast({
          title: 'Sucesso',
          description: 'Template criado com sucesso!',
        })
      }
      setFormData({ name: '', description: '', html_content: '' })
      setEditingId(null)
      fetchTemplates()
    } catch (error) {
      console.error('Erro ao salvar template:', error)
      toast({
        title: 'Erro',
        description: 'Não foi possível salvar o template.',
        variant: 'destructive',
      })
    }
  }

  const handleEdit = (template: ProposalTemplate) => {
    setFormData({
      name: template.name,
      description: template.description || '',
      html_content: template.html_content,
    })
    setEditingId(template.id)
  }

  const handleDelete = async (id: number) => {
    if (!confirm('Tem certeza que deseja excluir este template?')) return

    try {
      await proposalTemplatesApi.deleteTemplate(id)
      toast({
        title: 'Sucesso',
        description: 'Template excluído com sucesso!',
      })
      fetchTemplates()
    } catch (error) {
      console.error('Erro ao excluir template:', error)
      toast({
        title: 'Erro',
        description: 'Não foi possível excluir o template.',
        variant: 'destructive',
      })
    }
  }

  const handleCancel = () => {
    setFormData({ name: '', description: '', html_content: '' })
    setEditingId(null)
  }

  const insertField = (field: string) => {
    const textarea = document.getElementById('html_content') as HTMLTextAreaElement
    if (textarea) {
      const start = textarea.selectionStart
      const end = textarea.selectionEnd
      const text = textarea.value
      const before = text.substring(0, start)
      const after = text.substring(end, text.length)
      const newText = before + `{{${field}}}` + after
      setFormData({ ...formData, html_content: newText })
      
      // Restaurar foco e posição do cursor
      setTimeout(() => {
        textarea.focus()
        textarea.setSelectionRange(start + field.length + 4, start + field.length + 4)
      }, 0)
    }
  }

  const extractFields = (html: string): string[] => {
    const regex = /\{\{(\w+)\}\}/g
    const matches = html.matchAll(regex)
    const fields = new Set<string>()
    for (const match of matches) {
      fields.add(match[1])
    }
    return Array.from(fields)
  }

  const availableFields = [
    'opportunity_name',
    'opportunity_amount',
    'opportunity_currency',
    'company_name',
    'company_website',
    'company_phone',
    'company_email',
    'contact_name',
    'contact_email',
    'contact_phone',
    'contact_position',
    'proposal_title',
    'proposal_amount',
    'proposal_currency',
    'valid_until',
  ]

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-bold">Templates de Proposta</h2>
        <p className="text-muted-foreground mt-1">
          Crie e gerencie templates HTML para suas propostas comerciais
        </p>
      </div>

      {/* Formulário de criação/edição */}
      <Card>
        <CardHeader>
          <CardTitle>{editingId ? 'Editar Template' : 'Criar Novo Template'}</CardTitle>
          <CardDescription>
            {editingId
              ? 'Edite o template abaixo'
              : 'Crie um novo template HTML para suas propostas'}
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <Label htmlFor="name">Nome do Template</Label>
              <Input
                id="name"
                value={formData.name}
                onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                placeholder="Ex: Proposta Padrão"
                required
              />
            </div>

            <div>
              <Label htmlFor="description">Descrição</Label>
              <Textarea
                id="description"
                value={formData.description}
                onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                placeholder="Descreva o template..."
                rows={2}
              />
            </div>

            <div>
              <div className="flex items-center justify-between mb-2">
                <Label htmlFor="html_content">Conteúdo HTML</Label>
                <div className="flex gap-2 flex-wrap">
                  {availableFields.map((field) => (
                    <Button
                      key={field}
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={() => insertField(field)}
                      className="text-xs"
                    >
                      <Code className="h-3 w-3 mr-1" />
                      {field}
                    </Button>
                  ))}
                </div>
              </div>
              <Textarea
                id="html_content"
                value={formData.html_content}
                onChange={(e) => setFormData({ ...formData, html_content: e.target.value })}
                placeholder="Digite o HTML do template. Use {{campo}} para campos dinâmicos."
                rows={12}
                className="font-mono text-sm"
                required
              />
              <p className="text-xs text-muted-foreground mt-1">
                Campos disponíveis: {availableFields.join(', ')}
              </p>
            </div>

            <div className="flex gap-2">
              <Button type="submit">
                {editingId ? 'Atualizar' : 'Criar'} Template
              </Button>
              {editingId && (
                <Button type="button" variant="outline" onClick={handleCancel}>
                  Cancelar
                </Button>
              )}
            </div>
          </form>
        </CardContent>
      </Card>

      {/* Lista de templates */}
      <Card>
        <CardHeader>
          <CardTitle>Templates Criados</CardTitle>
          <CardDescription>
            {templates.length} template(s) disponível(is)
          </CardDescription>
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className="text-center py-8 text-muted-foreground">
              Carregando templates...
            </div>
          ) : templates.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground">
              Nenhum template criado ainda. Crie seu primeiro template acima.
            </div>
          ) : (
            <div className="space-y-4">
              {templates.map((template) => {
                const fields = extractFields(template.html_content)
                return (
                  <div
                    key={template.id}
                    className="border rounded-lg p-4 hover:bg-accent/50 transition-colors"
                  >
                    <div className="flex items-start justify-between">
                      <div className="flex-1">
                        <div className="flex items-center gap-2 mb-2">
                          <FileText className="h-5 w-5 text-primary" />
                          <h3 className="font-semibold">{template.name}</h3>
                          {editingId === template.id && (
                            <Badge variant="secondary">Editando</Badge>
                          )}
                        </div>
                        {template.description && (
                          <p className="text-sm text-muted-foreground mb-2">
                            {template.description}
                          </p>
                        )}
                        <div className="flex flex-wrap gap-2 mt-2">
                          {fields.map((field) => (
                            <Badge key={field} variant="outline" className="text-xs">
                              {'{{' + field + '}}'}
                            </Badge>
                          ))}
                        </div>
                        <p className="text-xs text-muted-foreground mt-2">
                          Criado em:{' '}
                          {new Date(template.created_at).toLocaleDateString('pt-BR')}
                        </p>
                      </div>
                      <div className="flex gap-2">
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => handleEdit(template)}
                        >
                          <Edit className="h-4 w-4" />
                        </Button>
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => handleDelete(template.id)}
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </div>
                    </div>
                  </div>
                )
              })}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  )
}

