import { useState } from 'react'
import { useKPI } from '@/contexts/KPIContext'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Plus, X } from 'lucide-react'
import { cn } from '@/lib/utils'

export function ActivitySimulator() {
  const { trackActivity } = useKPI()
  const [isOpen, setIsOpen] = useState(false)
  const [loading, setLoading] = useState<string | null>(null)

  const handleSimulate = async (metricType: 'leads_created' | 'tasks_completed' | 'revenue_generated' | 'calls_made', value: number) => {
    setLoading(metricType)
    try {
      await trackActivity(metricType, value)
    } catch (error) {
      console.error('Error simulating activity:', error)
    } finally {
      setLoading(null)
    }
  }

  if (!isOpen) {
    return (
      <Button
        variant="outline"
        size="sm"
        onClick={() => setIsOpen(true)}
        className="fixed bottom-4 right-4 z-50 shadow-lg"
      >
        <Plus className="h-4 w-4 mr-2" />
        Simular Atividade
      </Button>
    )
  }

  return (
    <Card className="fixed bottom-4 right-4 z-50 w-80 shadow-xl">
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <div>
            <CardTitle className="text-sm">Simulador de Atividade</CardTitle>
            <CardDescription className="text-xs">
              Apenas para desenvolvimento
            </CardDescription>
          </div>
          <Button
            variant="ghost"
            size="icon"
            className="h-6 w-6"
            onClick={() => setIsOpen(false)}
          >
            <X className="h-4 w-4" />
          </Button>
        </div>
      </CardHeader>
      <CardContent className="space-y-2">
        <Button
          variant="outline"
          className="w-full justify-start"
          onClick={() => handleSimulate('leads_created', 1)}
          disabled={loading === 'leads_created'}
        >
          <Plus className="h-4 w-4 mr-2" />
          {loading === 'leads_created' ? 'Simulando...' : '+1 Lead'}
        </Button>
        <Button
          variant="outline"
          className="w-full justify-start"
          onClick={() => handleSimulate('tasks_completed', 1)}
          disabled={loading === 'tasks_completed'}
        >
          <Plus className="h-4 w-4 mr-2" />
          {loading === 'tasks_completed' ? 'Simulando...' : '+1 Tarefa'}
        </Button>
        <Button
          variant="outline"
          className="w-full justify-start"
          onClick={() => handleSimulate('revenue_generated', 1000)}
          disabled={loading === 'revenue_generated'}
        >
          <Plus className="h-4 w-4 mr-2" />
          {loading === 'revenue_generated' ? 'Simulando...' : '+R$ 1.000 Receita'}
        </Button>
        <Button
          variant="outline"
          className="w-full justify-start"
          onClick={() => handleSimulate('calls_made', 1)}
          disabled={loading === 'calls_made'}
        >
          <Plus className="h-4 w-4 mr-2" />
          {loading === 'calls_made' ? 'Simulando...' : '+1 Chamada'}
        </Button>
      </CardContent>
    </Card>
  )
}





