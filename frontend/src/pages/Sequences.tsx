import { useState, useEffect } from 'react'
import { useTranslation } from 'react-i18next'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import api from '@/lib/api'
import { Plus, Edit, Trash2, Play, Pause, ArrowUp, ArrowDown, Mail, Phone, Link as LinkIcon, Calendar, Search, GripVertical } from 'lucide-react'

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
  const { t } = useTranslation()
  const [sequences, setSequences] = useState<Sequence[]>([])
  const [loading, setLoading] = useState(true)
  const [showForm, setShowForm] = useState(false)
  const [editingId, setEditingId] = useState<number | null>(null)
  const [name, setName] = useState('')
  const [description, setDescription] = useState('')
  const [isActive, setIsActive] = useState(true)
  const [steps, setSteps] = useState<SequenceStep[]>([
    { type: 'email', delay_days: 0, title: 'Enviar email inicial', description: 'Template de email de apresentação' }
  ])

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
    setSteps([{ type: 'email', delay_days: 0, title: 'Enviar email inicial', description: 'Template de email de apresentação' }])
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
      const sequenceData = {
        name: name.trim(),
        description: description.trim() || null,
        is_active: isActive,
        steps: JSON.stringify(steps)
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
        <Button onClick={() => setShowForm(!showForm)}>
          <Plus className="mr-2 h-4 w-4" />
          Nova Cadência
        </Button>
      </div>

      {showForm && (
        <Card>
          <CardHeader>
            <CardTitle>{editingId ? 'Editar' : 'Nova'} Cadência</CardTitle>
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
                              <Input
                                type="text"
                                value={step.title}
                                onChange={(e) => updateStep(index, 'title', e.target.value)}
                                placeholder="Ex: Enviar email de apresentação"
                                required
                              />
                            </div>
                            <div>
                              <label className="block text-sm font-medium mb-1">Descrição/Instruções</label>
                              <Textarea
                                value={step.description}
                                onChange={(e) => updateStep(index, 'description', e.target.value)}
                                placeholder="Descreva o que deve ser feito nesta etapa..."
                                rows={2}
                              />
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
                <Button type="submit">Salvar Cadência</Button>
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
            <Card key={sequence.id}>
              <CardHeader>
                <div className="flex items-center justify-between">
                  <CardTitle className="text-lg">{sequence.name}</CardTitle>
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

