import { useState, useEffect } from 'react'
import { useTranslation } from 'react-i18next'
import { proposalTemplatesApi } from '@/lib/api'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { Label } from '@/components/ui/label'
import { Switch } from '@/components/ui/switch'
import { 
  Save, 
  Eye, 
  Code, 
  Plus, 
  Trash2, 
  Edit, 
  FileText,
  X,
  Copy,
  CheckCircle2
} from 'lucide-react'
import { Badge } from '@/components/ui/badge'

interface ProposalTemplate {
  id: number
  name: string
  description?: string
  html_content: string
  available_fields?: string
  is_active: boolean
  owner_id: number
  created_by_id: number
  created_at: string
  updated_at: string
}

export function ProposalTemplateBuilder() {
  const { t } = useTranslation()
  const [templates, setTemplates] = useState<ProposalTemplate[]>([])
  const [loading, setLoading] = useState(false)
  const [showForm, setShowForm] = useState(false)
  const [editingId, setEditingId] = useState<number | null>(null)
  const [viewMode, setViewMode] = useState<'editor' | 'preview'>('editor')
  const [availableFields, setAvailableFields] = useState<string[]>([])
  
  const [formData, setFormData] = useState({
    name: '',
    description: '',
    html_content: '',
    is_active: true,
  })

  useEffect(() => {
    fetchTemplates()
  }, [])

  const fetchTemplates = async () => {
    setLoading(true)
    try {
      const response = await proposalTemplatesApi.getTemplates()
      setTemplates(response.data || [])
    } catch (error: any) {
      console.error('Error fetching templates:', error)
      alert(error.response?.data?.detail || 'Erro ao carregar templates')
    } finally {
      setLoading(false)
    }
  }

  const extractFields = (html: string): string[] => {
    const regex = /\{\{(\w+)\}\}/g
    const fields: string[] = []
    let match
    while ((match = regex.exec(html)) !== null) {
      if (!fields.includes(match[1])) {
        fields.push(match[1])
      }
    }
    return fields
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    try {
      const fields = extractFields(formData.html_content)
      const templateData = {
        ...formData,
        available_fields: JSON.stringify(fields),
      }

      if (editingId) {
        await proposalTemplatesApi.updateTemplate(editingId, templateData)
      } else {
        await proposalTemplatesApi.createTemplate(templateData)
      }
      
      resetForm()
      fetchTemplates()
      alert(editingId ? 'Template atualizado com sucesso!' : 'Template criado com sucesso!')
    } catch (error: any) {
      console.error('Error saving template:', error)
      alert(error.response?.data?.detail || 'Erro ao salvar template')
    }
  }

  const handleEdit = (template: ProposalTemplate) => {
    setFormData({
      name: template.name,
      description: template.description || '',
      html_content: template.html_content,
      is_active: template.is_active,
    })
    setEditingId(template.id)
    setShowForm(true)
    setViewMode('editor')
    
    // Extrair campos do template
    const fields = extractFields(template.html_content)
    setAvailableFields(fields)
  }

  const handleDelete = async (id: number) => {
    if (!confirm('Tem certeza que deseja excluir este template?')) return
    
    try {
      await proposalTemplatesApi.deleteTemplate(id)
      fetchTemplates()
      alert('Template excluído com sucesso!')
    } catch (error: any) {
      console.error('Error deleting template:', error)
      alert(error.response?.data?.detail || 'Erro ao excluir template')
    }
  }

  const resetForm = () => {
    setFormData({
      name: '',
      description: '',
      html_content: '',
      is_active: true,
    })
    setEditingId(null)
    setShowForm(false)
    setViewMode('editor')
    setAvailableFields([])
  }

  const insertField = (fieldName: string) => {
    const field = `{{${fieldName}}}`
    const textarea = document.getElementById('html-content') as HTMLTextAreaElement
    if (textarea) {
      const start = textarea.selectionStart
      const end = textarea.selectionEnd
      const text = textarea.value
      const newText = text.substring(0, start) + field + text.substring(end)
      setFormData({ ...formData, html_content: newText })
      
      // Atualizar campos disponíveis
      const fields = extractFields(newText)
      setAvailableFields(fields)
      
      // Restaurar foco e posição do cursor
      setTimeout(() => {
        textarea.focus()
        textarea.setSelectionRange(start + field.length, start + field.length)
      }, 0)
    }
  }

  const handleHtmlChange = (value: string) => {
    setFormData({ ...formData, html_content: value })
    const fields = extractFields(value)
    setAvailableFields(fields)
  }

  const renderPreview = () => {
    // Substituir placeholders com dados de exemplo
    const exampleData: Record<string, string> = {
      company_name: 'Empresa Exemplo Ltda',
      contact_name: 'João Silva',
      contact_email: 'joao@exemplo.com',
      contact_phone: '(11) 99999-9999',
      contact_position: 'Diretor Comercial',
      proposal_title: 'Proposta Comercial',
      proposal_amount: 'R$ 50.000,00',
      proposal_currency: 'BRL',
      opportunity_name: 'Oportunidade de Vendas',
      opportunity_amount: 'R$ 50.000,00',
      valid_until: '31/12/2024',
      company_website: 'www.exemplo.com',
      company_phone: '(11) 3333-3333',
      company_email: 'contato@exemplo.com',
    }

    let preview = formData.html_content
    availableFields.forEach(field => {
      const value = exampleData[field] || `[${field}]`
      preview = preview.replace(new RegExp(`\\{\\{${field}\\}\\}`, 'g'), value)
    })

    // Remover botões "Topo" e "Exportar PDF" do HTML
    // Remove elementos que contenham texto "Topo" ou "Exportar" em botões
    preview = preview.replace(/<button[^>]*>.*?(?:Topo|Exportar|Imprimir|PDF).*?<\/button>/gi, '')
    preview = preview.replace(/<a[^>]*>.*?(?:Topo|Exportar|Imprimir|PDF).*?<\/a>/gi, '')
    preview = preview.replace(/<div[^>]*class="[^"]*"(?:.*?Topo|.*?Exportar|.*?PDF)[^"]*"[^>]*>.*?<\/div>/gi, '')
    
    // Remover qualquer div que contenha esses botões
    const tempDiv = document.createElement('div')
    tempDiv.innerHTML = preview
    const buttons = tempDiv.querySelectorAll('button, a')
    buttons.forEach(btn => {
      const text = btn.textContent || ''
      if (text.includes('Topo') || text.includes('Exportar') || text.includes('Imprimir') || text.includes('PDF')) {
        btn.remove()
      }
    })
    preview = tempDiv.innerHTML

    return preview
  }

  const defaultTemplate = `<!DOCTYPE html>
<html>
<head>
    <meta charset="UTF-8">
    <style>
        body {
            font-family: Arial, sans-serif;
            max-width: 800px;
            margin: 0 auto;
            padding: 40px;
            line-height: 1.6;
            color: #333;
        }
        .header {
            text-align: center;
            border-bottom: 3px solid #0066CC;
            padding-bottom: 20px;
            margin-bottom: 30px;
        }
        .header h1 {
            color: #0066CC;
            margin: 0;
        }
        .section {
            margin: 30px 0;
        }
        .section h2 {
            color: #2c3e50;
            border-bottom: 2px solid #e0e0e0;
            padding-bottom: 10px;
        }
        .info-row {
            display: flex;
            justify-content: space-between;
            padding: 10px 0;
            border-bottom: 1px solid #f0f0f0;
        }
        .info-label {
            font-weight: bold;
            color: #666;
        }
        .amount {
            font-size: 24px;
            font-weight: bold;
            color: #0066CC;
            text-align: center;
            margin: 30px 0;
        }
        .footer {
            margin-top: 50px;
            padding-top: 20px;
            border-top: 2px solid #e0e0e0;
            text-align: center;
            color: #666;
            font-size: 12px;
        }
    </style>
</head>
<body>
    <div class="header">
        <h1>{{proposal_title}}</h1>
        <p>Proposta Comercial</p>
    </div>

    <div class="section">
        <h2>Informações da Empresa</h2>
        <div class="info-row">
            <span class="info-label">Empresa:</span>
            <span>{{company_name}}</span>
        </div>
        <div class="info-row">
            <span class="info-label">Website:</span>
            <span>{{company_website}}</span>
        </div>
        <div class="info-row">
            <span class="info-label">Telefone:</span>
            <span>{{company_phone}}</span>
        </div>
        <div class="info-row">
            <span class="info-label">Email:</span>
            <span>{{company_email}}</span>
        </div>
    </div>

    <div class="section">
        <h2>Contato</h2>
        <div class="info-row">
            <span class="info-label">Nome:</span>
            <span>{{contact_name}}</span>
        </div>
        <div class="info-row">
            <span class="info-label">Cargo:</span>
            <span>{{contact_position}}</span>
        </div>
        <div class="info-row">
            <span class="info-label">Email:</span>
            <span>{{contact_email}}</span>
        </div>
        <div class="info-row">
            <span class="info-label">Telefone:</span>
            <span>{{contact_phone}}</span>
        </div>
    </div>

    <div class="section">
        <h2>Valor da Proposta</h2>
        <div class="amount">{{proposal_amount}} {{proposal_currency}}</div>
    </div>

    <div class="section">
        <h2>Oportunidade</h2>
        <div class="info-row">
            <span class="info-label">Nome:</span>
            <span>{{opportunity_name}}</span>
        </div>
        <div class="info-row">
            <span class="info-label">Valor:</span>
            <span>{{opportunity_amount}}</span>
        </div>
    </div>

    <div class="section">
        <h2>Validade</h2>
        <p>Esta proposta é válida até <strong>{{valid_until}}</strong></p>
    </div>

    <div class="footer">
        <p>Obrigado pela oportunidade!</p>
        <p>Esta é uma proposta gerada automaticamente pelo sistema TYR CRM.</p>
    </div>
</body>
</html>`

  const loadDefaultTemplate = () => {
    setFormData({ ...formData, html_content: defaultTemplate })
    const fields = extractFields(defaultTemplate)
    setAvailableFields(fields)
  }

  const commonFields = [
    'company_name', 'company_website', 'company_phone', 'company_email',
    'contact_name', 'contact_email', 'contact_phone', 'contact_position',
    'proposal_title', 'proposal_amount', 'proposal_currency',
    'opportunity_name', 'opportunity_amount', 'valid_until'
  ]

  return (
    <div className="container mx-auto p-6 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold">Builder de Templates de Proposta</h1>
          <p className="text-muted-foreground mt-2">
            Crie templates personalizados para suas propostas comerciais
          </p>
        </div>
        <Button onClick={() => { resetForm(); setShowForm(true) }}>
          <Plus className="h-4 w-4 mr-2" />
          Novo Template
        </Button>
      </div>

      {showForm && (
        <Card>
          <CardHeader>
            <div className="flex items-center justify-between">
              <div>
                <CardTitle>{editingId ? 'Editar Template' : 'Novo Template'}</CardTitle>
                <CardDescription>
                  Crie um template HTML com campos dinâmicos usando {'{{campo}}'}
                </CardDescription>
              </div>
              <Button variant="ghost" size="icon" onClick={resetForm}>
                <X className="h-4 w-4" />
              </Button>
            </div>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleSubmit} className="space-y-6">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <Label htmlFor="name">Nome do Template *</Label>
                  <Input
                    id="name"
                    value={formData.name}
                    onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                    required
                    placeholder="Ex: Proposta Padrão"
                  />
                </div>
                <div className="flex items-center space-x-2 pt-8">
                  <Switch
                    id="is_active"
                    checked={formData.is_active}
                    onCheckedChange={(checked) => setFormData({ ...formData, is_active: checked })}
                  />
                  <Label htmlFor="is_active">Template Ativo</Label>
                </div>
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
                  <Label>HTML do Template</Label>
                  <div className="flex gap-2">
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={loadDefaultTemplate}
                    >
                      <FileText className="h-4 w-4 mr-2" />
                      Template Padrão
                    </Button>
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={() => setViewMode(viewMode === 'editor' ? 'preview' : 'editor')}
                    >
                      {viewMode === 'editor' ? (
                        <>
                          <Eye className="h-4 w-4 mr-2" />
                          Preview
                        </>
                      ) : (
                        <>
                          <Code className="h-4 w-4 mr-2" />
                          Editor
                        </>
                      )}
                    </Button>
                  </div>
                </div>

                {viewMode === 'editor' ? (
                  <div className="space-y-4">
                    <div className="border rounded-lg p-4 bg-muted/30">
                      <Label className="text-sm font-semibold mb-2 block">Campos Disponíveis</Label>
                      <div className="flex flex-wrap gap-2 mb-4">
                        {commonFields.map(field => (
                          <Badge
                            key={field}
                            variant="secondary"
                            className="cursor-pointer hover:bg-primary hover:text-primary-foreground"
                            onClick={() => insertField(field)}
                          >
                            {field}
                          </Badge>
                        ))}
                      </div>
                      <div className="text-xs text-muted-foreground">
                        <p className="mb-2">Campos encontrados no template:</p>
                        <div className="flex flex-wrap gap-2">
                          {availableFields.length > 0 ? (
                            availableFields.map(field => (
                              <Badge key={field} variant="outline">{field}</Badge>
                            ))
                          ) : (
                            <span className="text-muted-foreground">Nenhum campo encontrado</span>
                          )}
                        </div>
                      </div>
                    </div>
                    <Textarea
                      id="html-content"
                      value={formData.html_content}
                      onChange={(e) => handleHtmlChange(e.target.value)}
                      placeholder="Digite o HTML do template. Use {{campo}} para campos dinâmicos."
                      rows={20}
                      className="font-mono text-sm"
                    />
                  </div>
                ) : (
                  <div className="border rounded-lg bg-background h-full overflow-auto">
                    <div 
                      className="w-full h-full p-6"
                      style={{ 
                        maxWidth: '100%',
                        margin: 0,
                        padding: '1.5rem'
                      }}
                      dangerouslySetInnerHTML={{ __html: renderPreview() }}
                    />
                  </div>
                )}
              </div>

              <div className="flex justify-end gap-2">
                <Button type="button" variant="outline" onClick={resetForm}>
                  Cancelar
                </Button>
                <Button type="submit">
                  <Save className="h-4 w-4 mr-2" />
                  {editingId ? 'Atualizar' : 'Criar'} Template
                </Button>
              </div>
            </form>
          </CardContent>
        </Card>
      )}

      <div className="grid gap-4">
        {loading ? (
          <div className="text-center py-8">Carregando templates...</div>
        ) : templates.length === 0 ? (
          <Card>
            <CardContent className="py-12 text-center">
              <FileText className="h-12 w-12 mx-auto mb-4 text-muted-foreground" />
              <p className="text-muted-foreground">Nenhum template criado ainda</p>
              <Button onClick={() => { resetForm(); setShowForm(true) }} className="mt-4">
                <Plus className="h-4 w-4 mr-2" />
                Criar Primeiro Template
              </Button>
            </CardContent>
          </Card>
        ) : (
          templates.map(template => {
            const fields = extractFields(template.html_content)
            return (
              <Card key={template.id}>
                <CardHeader>
                  <div className="flex items-start justify-between">
                    <div className="flex-1">
                      <div className="flex items-center gap-2">
                        <CardTitle>{template.name}</CardTitle>
                        {template.is_active ? (
                          <Badge variant="default">
                            <CheckCircle2 className="h-3 w-3 mr-1" />
                            Ativo
                          </Badge>
                        ) : (
                          <Badge variant="secondary">Inativo</Badge>
                        )}
                      </div>
                      {template.description && (
                        <CardDescription className="mt-2">{template.description}</CardDescription>
                      )}
                      <div className="mt-2 flex flex-wrap gap-1">
                        {fields.slice(0, 5).map(field => (
                          <Badge key={field} variant="outline" className="text-xs">
                            {field}
                          </Badge>
                        ))}
                        {fields.length > 5 && (
                          <Badge variant="outline" className="text-xs">
                            +{fields.length - 5} mais
                          </Badge>
                        )}
                      </div>
                    </div>
                    <div className="flex gap-2">
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => handleEdit(template)}
                      >
                        <Edit className="h-4 w-4 mr-2" />
                        Editar
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
                </CardHeader>
              </Card>
            )
          })
        )}
      </div>
    </div>
  )
}

