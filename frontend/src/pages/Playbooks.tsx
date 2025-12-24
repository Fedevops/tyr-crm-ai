import { useState, useEffect } from 'react'
import { useTranslation } from 'react-i18next'
import { useAuth } from '@/contexts/AuthContext'
import api from '@/lib/api'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { Plus, Trash2, Edit } from 'lucide-react'

interface Playbook {
  id: number
  name: string
  description: string | null
  content: string
  is_active: boolean
  created_at: string
  updated_at: string
}

export function Playbooks() {
  const { t } = useTranslation()
  const { loading: authLoading, isAuthenticated } = useAuth()
  const [playbooks, setPlaybooks] = useState<Playbook[]>([])
  const [loading, setLoading] = useState(true)
  const [showForm, setShowForm] = useState(false)
  const [editingId, setEditingId] = useState<number | null>(null)
  const [formData, setFormData] = useState({
    name: '',
    description: '',
    content: '',
  })

  useEffect(() => {
    // Só buscar playbooks quando a autenticação estiver completa e o usuário estiver autenticado
    if (!authLoading && isAuthenticated) {
      fetchPlaybooks()
    } else if (!authLoading && !isAuthenticated) {
      setLoading(false)
    }
  }, [authLoading, isAuthenticated])

  const fetchPlaybooks = async () => {
    try {
      setLoading(true)
      const token = localStorage.getItem('token')
      console.log('Fetching playbooks. Token no localStorage:', token ? token.substring(0, 20) + '...' : 'NÃO ENCONTRADO')
      
      const response = await api.get('/api/playbooks')
      setPlaybooks(response.data)
    } catch (error: any) {
      console.error('Error fetching playbooks:', error)
      console.error('Error response:', error.response)
      console.error('Error status:', error.response?.status)
      console.error('Error detail:', error.response?.data?.detail)
      
      // Se for 401, verificar se o token existe
      if (error.response?.status === 401) {
        const token = localStorage.getItem('token')
        console.error('Erro 401. Token no localStorage:', token ? 'EXISTE' : 'NÃO EXISTE')
        if (token) {
          console.error('Token existe mas foi rejeitado. Pode estar expirado ou inválido.')
        }
      }
    } finally {
      setLoading(false)
    }
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    
    // Verificar se há token no localStorage (fonte de verdade)
    const storedToken = localStorage.getItem('token')
    if (!storedToken) {
      alert('Sua sessão expirou. Por favor, faça login novamente.')
      window.location.href = '/login'
      return
    }

    console.log('Tentando salvar playbook com token:', storedToken.substring(0, 20) + '...')

    try {
      if (editingId) {
        await api.put(`/api/playbooks/${editingId}`, formData)
      } else {
        await api.post('/api/playbooks', formData)
      }
      setShowForm(false)
      setEditingId(null)
      setFormData({ name: '', description: '', content: '' })
      fetchPlaybooks()
    } catch (error: any) {
      console.error('Error saving playbook:', error)
      console.error('Error response:', error.response)
      console.error('Error status:', error.response?.status)
      console.error('Error detail:', error.response?.data?.detail)
      
      if (error.response?.status === 401) {
        const errorDetail = error.response?.data?.detail || 'Sua sessão expirou'
        console.error('Erro 401 - Token pode estar inválido ou expirado')
        alert(`${errorDetail}. Por favor, faça login novamente.`)
        // Não limpar o token aqui - deixar o interceptor fazer isso
        window.location.href = '/login'
      } else {
        const errorMessage = error.response?.data?.detail || error.message || 'Erro ao salvar playbook. Tente novamente.'
        alert(errorMessage)
      }
    }
  }

  const handleEdit = (playbook: Playbook) => {
    setFormData({
      name: playbook.name,
      description: playbook.description || '',
      content: playbook.content,
    })
    setEditingId(playbook.id)
    setShowForm(true)
  }

  const handleDelete = async (id: number) => {
    if (!confirm('Tem certeza que deseja excluir este playbook?')) return
    
    // Verificar se há token no localStorage
    const storedToken = localStorage.getItem('token')
    if (!storedToken) {
      alert('Sua sessão expirou. Por favor, faça login novamente.')
      window.location.href = '/login'
      return
    }

    try {
      await api.delete(`/api/playbooks/${id}`)
      fetchPlaybooks()
    } catch (error: any) {
      console.error('Error deleting playbook:', error)
      if (error.response?.status === 401) {
        alert('Sua sessão expirou. Por favor, faça login novamente.')
        window.location.href = '/login'
      } else {
        alert('Erro ao excluir playbook. Tente novamente.')
      }
    }
  }

  if (authLoading || loading) {
    return <div className="p-6">{t('common.loading')}</div>
  }

  return (
    <div className="flex-1 space-y-6 p-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold">{t('playbooks.title')}</h1>
          <p className="text-muted-foreground">Gerencie seus playbooks de vendas</p>
        </div>
        <Button 
          onClick={() => setShowForm(!showForm)}
          className="bg-gradient-to-r from-teal-600 to-teal-700 hover:from-teal-700 hover:to-teal-800 text-white shadow-md hover:shadow-lg transition-all duration-200"
        >
          <Plus className="mr-2 h-4 w-4" />
          {t('playbooks.createNew')}
        </Button>
      </div>

      {showForm && (
        <Card className="border-t-4 border-t-teal-500 bg-gradient-to-br from-teal-50/30 to-white dark:from-teal-950/10 dark:to-background">
          <CardHeader className="bg-gradient-to-r from-teal-50/50 to-transparent dark:from-teal-950/20">
            <CardTitle className="text-teal-900 dark:text-teal-100">
              {editingId ? t('common.edit') : t('playbooks.createNew')}
            </CardTitle>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleSubmit} className="space-y-4">
              <div className="space-y-2">
                <label className="text-sm font-medium">{t('playbooks.name')}</label>
                <Input
                  value={formData.name}
                  onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                  required
                />
              </div>
              <div className="space-y-2">
                <label className="text-sm font-medium">{t('playbooks.description')}</label>
                <Input
                  value={formData.description}
                  onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                />
              </div>
              <div className="space-y-2">
                <label className="text-sm font-medium">{t('playbooks.content')}</label>
                <Textarea
                  value={formData.content}
                  onChange={(e) => setFormData({ ...formData, content: e.target.value })}
                  rows={10}
                  required
                />
              </div>
              <div className="flex gap-2">
                <Button type="submit">{t('common.save')}</Button>
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => {
                    setShowForm(false)
                    setEditingId(null)
                    setFormData({ name: '', description: '', content: '' })
                  }}
                >
                  {t('common.cancel')}
                </Button>
              </div>
            </form>
          </CardContent>
        </Card>
      )}

      {playbooks.length === 0 ? (
        <Card>
          <CardContent className="py-12 text-center">
            <p className="text-muted-foreground">{t('playbooks.noPlaybooks')}</p>
            <p className="mt-2 text-sm text-muted-foreground">
              {t('playbooks.createFirst')}
            </p>
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-4 md:grid-cols-2">
          {playbooks.map((playbook) => (
            <Card 
              key={playbook.id}
              className="border-l-4 border-l-teal-400 hover:border-l-teal-600 transition-all duration-200 bg-gradient-to-r from-white to-teal-50/30 dark:from-background dark:to-teal-950/20 hover:shadow-lg"
            >
              <CardHeader>
                <div className="flex items-start justify-between">
                  <div>
                    <CardTitle className="text-teal-900 dark:text-teal-100">{playbook.name}</CardTitle>
                    <CardDescription className="text-teal-700/80 dark:text-teal-300/80">{playbook.description}</CardDescription>
                  </div>
                  <div className="flex gap-2">
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={() => handleEdit(playbook)}
                    >
                      <Edit className="h-4 w-4" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={() => handleDelete(playbook.id)}
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                </div>
              </CardHeader>
              <CardContent>
                <p className="text-sm text-muted-foreground line-clamp-3">
                  {playbook.content}
                </p>
                <div className="mt-4">
                  <span
                    className={`inline-block rounded-full px-2 py-1 text-xs ${
                      playbook.is_active
                        ? 'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200'
                        : 'bg-gray-100 text-gray-800 dark:bg-gray-800 dark:text-gray-200'
                    }`}
                  >
                    {playbook.is_active ? t('playbooks.active') : t('playbooks.inactive')}
                  </span>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  )
}


