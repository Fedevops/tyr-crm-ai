import { useState, useEffect } from 'react'
import { useTranslation } from 'react-i18next'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import api from '@/lib/api'
import { Plus, Edit, Trash2, Play, Pause, ArrowUp, ArrowDown, Mail, Phone, Link as LinkIcon, Calendar, Search, GripVertical, Sparkles, Loader2 } from 'lucide-react'

interface SequenceStep {
  type: string
  delay_days: number
  title: string
  description: string
}

interface Sequence {
  id: number
  name: string
  description?: string
  is_active: boolean
  steps: string
  default_start_date?: string | null
  created_at: string
  updated_at: string
}

const stepTypes = [
  { value: 'email', label: 'Email', icon: Mail },
  { value: 'call', label: 'Ligação', icon: Phone },
  { value: 'linkedin', label: 'LinkedIn', icon: LinkIcon },
  { value: 'meeting', label: 'Reunião', icon: Calendar },
  { value: 'follow_up', label: 'Follow-up', icon: Search },
  { value: 'research', label: 'Pesquisa', icon: Search },
  { value: 'other', label: 'Outro', icon: GripVertical }
]

export function Sequences() {
  const { t, i18n } = useTranslation()
  const [sequences, setSequences] = useState<Sequence[]>([])
  const [loading, setLoading] = useState(true)
  const [showForm, setShowForm] = useState(false)
  const [editingId, setEditingId] = useState<number | null>(null)
  const [name, setName] = useState('')
  const [description, setDescription] = useState('')
  const [isActive, setIsActive] = useState(true)
  const [defaultStartDate, setDefaultStartDate] = useState('')
  const [defaultStartTime, setDefaultStartTime] = useState('09:00')
  const [steps, setSteps] = useState<SequenceStep[]>([
    { type: 'email', delay_days: 0, title: 'Enviar email inicial', description: 'Template de email de apresentação' }
  ])
  const [generatingNote, setGeneratingNote] = useState<number | null>(null) // Índice da etapa que está gerando nota
  
  // Títulos pré-definidos para tarefas do LinkedIn
  const linkedinTaskTitles = [
    'Enviar solicitação de conexão',
    'Enviar nota de conexão',
    'Enviar mensagem de follow-up',
    'Follow-up após conexão aceita',
    'Follow-up após reunião',
    'Follow-up após e-mail',
    'Follow-up após ligação',
    'Comentar em publicação',
    'Compartilhar conteúdo relevante',
    'Parabenizar por conquista',
    'Enviar mensagem de aniversário',
    'Enviar proposta de valor',
    'Agendar reunião via LinkedIn',
    'Enviar case de sucesso',
    'Outro'
  ]

  useEffect(() => {
    fetchSequences()
  }, [])

  const fetchSequences = async () => {
    try {
      setLoading(true)
      const response = await api.get('/api/sequences')
      setSequences(response.data)
    } catch (error) {
      console.error('Error fetching sequences:', error)
    } finally {
      setLoading(false)
    }
  }

  const addStep = () => {
    setSteps([...steps, { type: 'email', delay_days: 0, title: '', description: '' }])
  }

  const removeStep = (index: number) => {
    setSteps(steps.filter((_, i) => i !== index))
  }

  const updateStep = (index: number, field: keyof SequenceStep, value: string | number) => {
    const newSteps = [...steps]
    newSteps[index] = { ...newSteps[index], [field]: value }
    setSteps(newSteps)
    
    // Se mudou o tipo para LinkedIn e o título não está na lista, resetar título
    if (field === 'type' && value === 'linkedin') {
      const currentTitle = newSteps[index].title
      if (!linkedinTaskTitles.includes(currentTitle)) {
        newSteps[index].title = 'Enviar solicitação de conexão'
        setSteps(newSteps)
      }
    }
  }
  
  const handleGenerateLinkedInMessage = async (stepIndex: number, messageType: 'connection_note' | 'followup') => {
    setGeneratingNote(stepIndex)
    try {
      const currentLanguage = i18n.language || 'pt-BR'
      const step = steps[stepIndex]
      
      // Detectar contexto baseado no título
      let followupContext = 'generic'
      if (messageType === 'followup') {
        if (step.title === 'Follow-up após conexão aceita') {
          followupContext = 'after_connection'
        } else if (step.title === 'Follow-up após reunião') {
          followupContext = 'after_meeting'
        } else if (step.title === 'Follow-up após e-mail') {
          followupContext = 'after_email'
        } else if (step.title === 'Follow-up após ligação') {
          followupContext = 'after_call'
        }
      }
      
      // Usar lead_id=0 e is_template=true para gerar template
      const response = await api.post('/api/tasks/generate-linkedin-message', {
        lead_id: 0,
        message_type: messageType,
        language: currentLanguage,
        is_template: true,
        followup_context: messageType === 'followup' ? followupContext : undefined
      })
      
      if (response.data.success && response.data.message) {
        const newSteps = [...steps]
        newSteps[stepIndex].description = response.data.message
        setSteps(newSteps)
      } else {
        const messageTypeLabel = messageType === 'connection_note' ? 'nota de conexão' : 'mensagem de follow-up'
        alert(`Erro ao gerar template de ${messageTypeLabel}. Tente novamente.`)
      }
    } catch (error: any) {
      console.error('Error generating LinkedIn message template:', error)
      if (error.response?.status === 503) {
        alert('LLM não está disponível. Configure OpenAI ou Ollama no arquivo .env')
      } else {
        // Se falhar, usar um template básico com placeholders
        const template = messageType === 'connection_note' 
          ? `Olá {Nome do lead},

Vi seu perfil no LinkedIn e fiquei interessado em conectar. {Empresa} parece ser uma empresa interessante no setor.

Gostaria de trocar uma ideia sobre como podemos colaborar.

Atenciosamente`
          : `Olá {Nome do lead},

Espero que esteja tudo bem! Gostaria de seguir nossa conversa anterior sobre {Empresa}.

Tenho algumas ideias que podem ser relevantes para vocês. Podemos agendar uma breve conversa?

Atenciosamente`
        const newSteps = [...steps]
        newSteps[stepIndex].description = template
        setSteps(newSteps)
      }
    } finally {
      setGeneratingNote(null)
    }
  }

  const moveStep = (index: number, direction: 'up' | 'down') => {
    if (direction === 'up' && index === 0) return
    if (direction === 'down' && index === steps.length - 1) return
    
    const newSteps = [...steps]
    const targetIndex = direction === 'up' ? index - 1 : index + 1
    ;[newSteps[index], newSteps[targetIndex]] = [newSteps[targetIndex], newSteps[index]]
    setSteps(newSteps)
  }

  const resetForm = () => {
    setName('')
    setDescription('')
    setIsActive(true)
    setDefaultStartDate('')
    setDefaultStartTime('09:00')
    setSteps([{ type: 'email', delay_days: 0, title: 'Enviar email inicial', description: 'Template de email de apresentação' }])
    setGeneratingNote(null)
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    
    // Validate
    if (!name.trim()) {
      alert('Por favor, preencha o nome da cadência')
      return
    }
    
    if (steps.length === 0) {
      alert('Adicione pelo menos uma etapa à cadência')
      return
    }
    
    // Validate steps
    for (let i = 0; i < steps.length; i++) {
      const step = steps[i]
      if (!step.title.trim()) {
        alert(`Por favor, preencha o título da etapa ${i + 1}`)
        return
      }
    }
    
    // Verificar se há token antes de fazer a requisição
    const token = localStorage.getItem('token')
    if (!token) {
      alert('Sua sessão expirou. Por favor, faça login novamente.')
      window.location.href = '/login'
      return
    }

    try {
      // Combinar data e hora para default_start_date
      let defaultStartDateValue: string | null = null
      if (defaultStartDate) {
        const [hours, minutes] = defaultStartTime.split(':')
        const dateTime = new Date(`${defaultStartDate}T${hours}:${minutes}:00`)
        defaultStartDateValue = dateTime.toISOString()
      }
      
      const sequenceData = {
        name: name.trim(),
        description: description.trim() || null,
        is_active: isActive,
        steps: JSON.stringify(steps),
        default_start_date: defaultStartDateValue
      }
      
      console.log('Salvando cadência:', { editingId, sequenceData })
      
      if (editingId) {
        await api.put(`/api/sequences/${editingId}`, sequenceData)
      } else {
        await api.post('/api/sequences', sequenceData)
      }
      
      setShowForm(false)
      setEditingId(null)
      resetForm()
      fetchSequences()
    } catch (error: any) {
      console.error('Error saving sequence:', error)
      const errorMessage = error.response?.data?.detail || error.message || 'Erro ao salvar cadência'
      
      // Se for erro de autenticação, redirecionar para login
      if (error.response?.status === 401) {
        alert('Sua sessão expirou. Por favor, faça login novamente.')
        localStorage.removeItem('token')
        window.location.href = '/login'
        return
      }
      
      alert(errorMessage)
    }
  }

  const handleDelete = async (id: number) => {
    if (!confirm('Tem certeza que deseja excluir esta cadência?')) return
    
    // Verificar se há token antes de fazer a requisição
    const token = localStorage.getItem('token')
    if (!token) {
      alert('Sua sessão expirou. Por favor, faça login novamente.')
      window.location.href = '/login'
      return
    }
    
    try {
      await api.delete(`/api/sequences/${id}`)
      fetchSequences()
    } catch (error: any) {
      console.error('Error deleting sequence:', error)
      
      // Se for erro de autenticação, redirecionar para login
      if (error.response?.status === 401) {
        alert('Sua sessão expirou. Por favor, faça login novamente.')
        localStorage.removeItem('token')
        window.location.href = '/login'
        return
      }
      
      alert(error.response?.data?.detail || 'Erro ao excluir cadência')
    }
  }

  const handleEdit = (sequence: Sequence) => {
    setEditingId(sequence.id)
    setName(sequence.name)
    setDescription(sequence.description || '')
    setIsActive(sequence.is_active)
    
    // Carregar data de início se existir
    if (sequence.default_start_date) {
      const date = new Date(sequence.default_start_date)
      setDefaultStartDate(date.toISOString().split('T')[0])
      const hours = date.getHours().toString().padStart(2, '0')
      const minutes = date.getMinutes().toString().padStart(2, '0')
      setDefaultStartTime(`${hours}:${minutes}`)
    } else {
      setDefaultStartDate('')
      setDefaultStartTime('09:00')
    }
    
    try {
      const parsedSteps = JSON.parse(sequence.steps)
      setSteps(Array.isArray(parsedSteps) ? parsedSteps : [])
    } catch {
      setSteps([])
    }
    
    setShowForm(true)
  }

  const toggleActive = async (sequence: Sequence) => {
    // Verificar se há token antes de fazer a requisição
    const token = localStorage.getItem('token')
    if (!token) {
      alert('Sua sessão expirou. Por favor, faça login novamente.')
      window.location.href = '/login'
      return
    }
    
    try {
      await api.put(`/api/sequences/${sequence.id}`, {
        name: sequence.name,
        description: sequence.description || '',
        is_active: !sequence.is_active,
        steps: sequence.steps
      })
      fetchSequences()
    } catch (error: any) {
      console.error('Error updating sequence:', error)
      
      // Se for erro de autenticação, redirecionar para login
      if (error.response?.status === 401) {
        alert('Sua sessão expirou. Por favor, faça login novamente.')
        localStorage.removeItem('token')
        window.location.href = '/login'
        return
      }
      
      alert(error.response?.data?.detail || 'Erro ao alterar status da cadência')
    }
  }

  if (loading) {
    return <div className="flex-1 space-y-6 p-6">Carregando...</div>
  }

  return (
    <div className="flex-1 space-y-6 p-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold">Cadências</h1>
          <p className="text-muted-foreground">
            Gerencie suas cadências de prospecção
          </p>
        </div>
        <Button 
          onClick={() => setShowForm(!showForm)}
          className="bg-gradient-to-r from-purple-600 to-purple-700 hover:from-purple-700 hover:to-purple-800 text-white shadow-md hover:shadow-lg transition-all duration-200"
        >
          <Plus className="mr-2 h-4 w-4" />
          Nova Cadência
        </Button>
      </div>

      {showForm && (
        <Card className="border-t-4 border-t-purple-500 bg-gradient-to-br from-purple-50/30 to-white dark:from-purple-950/10 dark:to-background">
          <CardHeader className="bg-gradient-to-r from-purple-50/50 to-transparent dark:from-purple-950/20">
            <CardTitle className="text-purple-900 dark:text-purple-100">{editingId ? 'Editar' : 'Nova'} Cadência</CardTitle>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleSubmit} className="space-y-6">
              {/* Informações Básicas */}
              <div className="space-y-4">
                <div>
                  <label className="block text-sm font-medium mb-1">Nome da Cadência *</label>
                  <Input
                    type="text"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    placeholder="Ex: Prospecção B2B - 5 etapas"
                    required
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium mb-1">Descrição</label>
                  <Textarea
                    value={description}
                    onChange={(e) => setDescription(e.target.value)}
                    placeholder="Descreva o objetivo desta cadência..."
                    rows={3}
                  />
                </div>
                <div className="flex items-center gap-2">
                  <input
                    type="checkbox"
                    id="is_active"
                    checked={isActive}
                    onChange={(e) => setIsActive(e.target.checked)}
                    className="h-4 w-4"
                  />
                  <label htmlFor="is_active" className="text-sm font-medium">
                    Cadência ativa
                  </label>
                </div>
                <div className="grid gap-4 md:grid-cols-2">
                  <div>
                    <label className="block text-sm font-medium mb-1">Data de Início da Primeira Tarefa</label>
                    <Input
                      type="date"
                      value={defaultStartDate}
                      onChange={(e) => setDefaultStartDate(e.target.value)}
                      placeholder="Data de início"
                    />
                    <p className="text-xs text-muted-foreground mt-1">
                      Data padrão para a primeira tarefa quando a sequência for associada a um lead
                    </p>
                  </div>
                  <div>
                    <label className="block text-sm font-medium mb-1">Horário de Início</label>
                    <Input
                      type="time"
                      value={defaultStartTime}
                      onChange={(e) => setDefaultStartTime(e.target.value)}
                    />
                  </div>
                </div>
              </div>

              {/* Etapas */}
              <div className="space-y-4">
                <div className="flex items-center justify-between">
                  <label className="block text-sm font-medium">Etapas da Cadência *</label>
                  <Button type="button" onClick={addStep} size="sm">
                    <Plus className="h-4 w-4 mr-1" />
                    Adicionar Etapa
                  </Button>
                </div>
                
                {steps.length === 0 ? (
                  <div className="text-center py-8 border-2 border-dashed rounded-lg">
                    <p className="text-sm text-muted-foreground mb-2">
                      Nenhuma etapa adicionada
                    </p>
                    <Button type="button" onClick={addStep} variant="outline">
                      Adicionar Primeira Etapa
                    </Button>
                  </div>
                ) : (
                  <div className="space-y-3">
                    {steps.map((step, index) => {
                      const totalDelay = steps.slice(0, index + 1).reduce((sum, s) => sum + s.delay_days, 0)
                      
                      return (
                        <Card key={index} className="border-2">
                          <CardHeader className="pb-3">
                            <div className="flex items-center justify-between">
                              <div className="flex items-center gap-2">
                                <GripVertical className="h-5 w-5 text-muted-foreground" />
                                <span className="font-medium">Etapa {index + 1}</span>
                                {totalDelay > 0 && (
                                  <span className="text-xs text-muted-foreground">
                                    (Após {totalDelay} dia{totalDelay !== 1 ? 's' : ''})
                                  </span>
                                )}
                              </div>
                              <div className="flex gap-1">
                                <Button
                                  type="button"
                                  variant="ghost"
                                  size="sm"
                                  onClick={() => moveStep(index, 'up')}
                                  disabled={index === 0}
                                >
                                  <ArrowUp className="h-4 w-4" />
                                </Button>
                                <Button
                                  type="button"
                                  variant="ghost"
                                  size="sm"
                                  onClick={() => moveStep(index, 'down')}
                                  disabled={index === steps.length - 1}
                                >
                                  <ArrowDown className="h-4 w-4" />
                                </Button>
                                <Button
                                  type="button"
                                  variant="ghost"
                                  size="sm"
                                  onClick={() => removeStep(index)}
                                  disabled={steps.length === 1}
                                >
                                  <Trash2 className="h-4 w-4" />
                                </Button>
                              </div>
                            </div>
                          </CardHeader>
                          <CardContent className="space-y-3">
                            <div className="grid gap-4 md:grid-cols-2">
                              <div>
                                <label className="block text-sm font-medium mb-1">Tipo de Ação *</label>
                                <select
                                  value={step.type}
                                  onChange={(e) => updateStep(index, 'type', e.target.value)}
                                  className="w-full px-3 py-2 border rounded-md"
                                  required
                                >
                                  {stepTypes.map((type) => (
                                    <option key={type.value} value={type.value}>
                                      {type.label}
                                    </option>
                                  ))}
                                </select>
                              </div>
                              <div>
                                <label className="block text-sm font-medium mb-1">
                                  Dias após etapa anterior
                                </label>
                                <Input
                                  type="number"
                                  min="0"
                                  value={step.delay_days}
                                  onChange={(e) => updateStep(index, 'delay_days', parseInt(e.target.value) || 0)}
                                  className="w-full"
                                  required
                                />
                              </div>
                            </div>
                            <div>
                              <label className="block text-sm font-medium mb-1">Título da Etapa *</label>
                              {step.type === 'linkedin' ? (
                                <div className="space-y-2">
                                  <select
                                    value={step.title}
                                    onChange={(e) => updateStep(index, 'title', e.target.value)}
                                    className="w-full px-3 py-2 border rounded-md"
                                    required
                                  >
                                    {linkedinTaskTitles.map((title) => (
                                      <option key={title} value={title}>
                                        {title}
                                      </option>
                                    ))}
                                  </select>
                                  {(step.title === 'Enviar nota de conexão' || step.title === 'Enviar solicitação de conexão') && (
                                    <Button
                                      type="button"
                                      variant="outline"
                                      size="sm"
                                      onClick={() => handleGenerateLinkedInMessage(index, 'connection_note')}
                                      disabled={generatingNote === index}
                                      className="w-full flex items-center justify-center gap-2"
                                    >
                                      {generatingNote === index ? (
                                        <>
                                          <Loader2 className="h-4 w-4 animate-spin" />
                                          Gerando template...
                                        </>
                                      ) : (
                                        <>
                                          <Sparkles className="h-4 w-4" />
                                          Gerar Template de Nota com IA
                                        </>
                                      )}
                                    </Button>
                                  )}
                                  {(step.title === 'Enviar mensagem de follow-up' ||
                                    step.title === 'Follow-up após conexão aceita' ||
                                    step.title === 'Follow-up após reunião' ||
                                    step.title === 'Follow-up após e-mail' ||
                                    step.title === 'Follow-up após ligação') && (
                                    <Button
                                      type="button"
                                      variant="outline"
                                      size="sm"
                                      onClick={() => handleGenerateLinkedInMessage(index, 'followup')}
                                      disabled={generatingNote === index}
                                      className="w-full flex items-center justify-center gap-2"
                                    >
                                      {generatingNote === index ? (
                                        <>
                                          <Loader2 className="h-4 w-4 animate-spin" />
                                          Gerando template...
                                        </>
                                      ) : (
                                        <>
                                          <Sparkles className="h-4 w-4" />
                                          Gerar Template de Mensagem com IA
                                        </>
                                      )}
                                    </Button>
                                  )}
                                </div>
                              ) : (
                                <Input
                                  type="text"
                                  value={step.title}
                                  onChange={(e) => updateStep(index, 'title', e.target.value)}
                                  placeholder="Ex: Enviar email de apresentação"
                                  required
                                />
                              )}
                            </div>
                            <div>
                              <label className="block text-sm font-medium mb-1">
                                Descrição/Instruções
                                {step.type === 'linkedin' && (
                                  step.title === 'Enviar nota de conexão' || 
                                  step.title === 'Enviar solicitação de conexão' || 
                                  step.title === 'Enviar mensagem de follow-up' ||
                                  step.title === 'Follow-up após conexão aceita' ||
                                  step.title === 'Follow-up após reunião' ||
                                  step.title === 'Follow-up após e-mail' ||
                                  step.title === 'Follow-up após ligação'
                                ) && (
                                  <span className="text-xs text-muted-foreground ml-2">
                                    (Use placeholders: {'{Nome do lead}'}, {'{Empresa}'}, {'{Cargo}'}, etc.)
                                  </span>
                                )}
                              </label>
                              <Textarea
                                value={step.description}
                                onChange={(e) => updateStep(index, 'description', e.target.value)}
                                placeholder={
                                  step.type === 'linkedin' && (
                                    step.title === 'Enviar nota de conexão' || 
                                    step.title === 'Enviar solicitação de conexão' || 
                                    step.title === 'Enviar mensagem de follow-up' ||
                                    step.title === 'Follow-up após conexão aceita' ||
                                    step.title === 'Follow-up após reunião' ||
                                    step.title === 'Follow-up após e-mail' ||
                                    step.title === 'Follow-up após ligação'
                                  )
                                    ? "Use placeholders como {Nome do lead}, {Empresa}, {Cargo}, etc. Eles serão substituídos automaticamente ao criar as tarefas."
                                    : "Descreva o que deve ser feito nesta etapa..."
                                }
                                rows={step.type === 'linkedin' && (
                                  step.title === 'Enviar nota de conexão' || 
                                  step.title === 'Enviar solicitação de conexão' || 
                                  step.title === 'Enviar mensagem de follow-up' ||
                                  step.title === 'Follow-up após conexão aceita' ||
                                  step.title === 'Follow-up após reunião' ||
                                  step.title === 'Follow-up após e-mail' ||
                                  step.title === 'Follow-up após ligação'
                                ) ? 6 : 2}
                              />
                              {step.type === 'linkedin' && (
                                step.title === 'Enviar nota de conexão' || 
                                step.title === 'Enviar solicitação de conexão' || 
                                step.title === 'Enviar mensagem de follow-up' ||
                                step.title === 'Follow-up após conexão aceita' ||
                                step.title === 'Follow-up após reunião' ||
                                step.title === 'Follow-up após e-mail' ||
                                step.title === 'Follow-up após ligação'
                              ) && (
                                <p className="text-xs text-muted-foreground mt-1">
                                  Placeholders disponíveis: {'{Nome do lead}'}, {'{Empresa}'}, {'{Cargo}'}, {'{Email}'}, {'{Telefone}'}, {'{Website}'}
                                </p>
                              )}
                            </div>
                          </CardContent>
                        </Card>
                      )
                    })}
                  </div>
                )}
              </div>

              {/* Preview */}
              {steps.length > 0 && (
                <div className="bg-gray-50 dark:bg-gray-900 p-4 rounded-lg">
                  <h4 className="text-sm font-medium mb-2">Preview da Cadência:</h4>
                  <div className="space-y-2">
                    {steps.map((step, index) => {
                      const totalDelay = steps.slice(0, index + 1).reduce((sum, s) => sum + s.delay_days, 0)
                      const stepTypeLabel = stepTypes.find(t => t.value === step.type)?.label || step.type
                      return (
                        <div key={index} className="text-sm">
                          <span className="font-medium">Dia {totalDelay}:</span> {step.title} ({stepTypeLabel})
                        </div>
                      )
                    })}
                  </div>
                </div>
              )}

              <div className="flex gap-2 pt-4 border-t">
                <Button 
                  type="submit"
                  className="bg-gradient-to-r from-purple-600 to-purple-700 hover:from-purple-700 hover:to-purple-800 text-white shadow-md hover:shadow-lg transition-all duration-200"
                >
                  Salvar Cadência
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => {
                    setShowForm(false)
                    setEditingId(null)
                    resetForm()
                  }}
                >
                  Cancelar
                </Button>
              </div>
            </form>
          </CardContent>
        </Card>
      )}

      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
        {sequences.map((sequence) => {
          let steps = []
          try {
            steps = JSON.parse(sequence.steps)
          } catch {
            steps = []
          }

          return (
            <Card 
              key={sequence.id}
              className="border-l-4 border-l-purple-400 hover:border-l-purple-600 transition-all duration-200 bg-gradient-to-r from-white to-purple-50/30 dark:from-background dark:to-purple-950/20 hover:shadow-lg"
            >
              <CardHeader>
                <div className="flex items-center justify-between">
                  <CardTitle className="text-lg text-purple-900 dark:text-purple-100">{sequence.name}</CardTitle>
                  <div className="flex gap-2">
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() => toggleActive(sequence)}
                    >
                      {sequence.is_active ? (
                        <Pause className="h-4 w-4" />
                      ) : (
                        <Play className="h-4 w-4" />
                      )}
                    </Button>
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() => handleEdit(sequence)}
                    >
                      <Edit className="h-4 w-4" />
                    </Button>
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() => handleDelete(sequence.id)}
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                </div>
              </CardHeader>
              <CardContent>
                {sequence.description && (
                  <p className="text-sm text-muted-foreground mb-3">
                    {sequence.description}
                  </p>
                )}
                <div className="space-y-2">
                  <p className="text-xs font-medium">Etapas ({steps.length}):</p>
                  {steps.slice(0, 3).map((step: any, idx: number) => (
                    <div key={idx} className="text-xs bg-gray-100 dark:bg-gray-800 p-2 rounded">
                      <span className="font-medium">{step.title || step.type}</span>
                      {step.delay_days > 0 && (
                        <span className="text-muted-foreground ml-2">
                          (+{step.delay_days} dias)
                        </span>
                      )}
                    </div>
                  ))}
                  {steps.length > 3 && (
                    <p className="text-xs text-muted-foreground">
                      +{steps.length - 3} mais...
                    </p>
                  )}
                </div>
                <div className="mt-3 pt-3 border-t">
                  <span className={`text-xs px-2 py-1 rounded ${
                    sequence.is_active
                      ? 'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200'
                      : 'bg-gray-100 text-gray-800 dark:bg-gray-800 dark:text-gray-200'
                  }`}>
                    {sequence.is_active ? 'Ativa' : 'Inativa'}
                  </span>
                </div>
              </CardContent>
            </Card>
          )
        })}
      </div>

      {sequences.length === 0 && !loading && (
        <Card>
          <CardContent className="py-12 text-center">
            <p className="text-muted-foreground">Nenhuma cadência cadastrada</p>
            <Button onClick={() => setShowForm(true)} className="mt-4">
              <Plus className="mr-2 h-4 w-4" />
              Criar Primeira Cadência
            </Button>
          </CardContent>
        </Card>
      )}
    </div>
  )
}

