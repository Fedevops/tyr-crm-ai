import { Visitor } from '@/hooks/useLiveVisitors'
import { Clock, MapPin, Globe, MessageCircle } from 'lucide-react'
import { cn } from '@/lib/utils'

interface VisitorListProps {
  visitors: Visitor[]
  selectedVisitor: Visitor | null
  onSelectVisitor: (visitor: Visitor) => void
}

export function VisitorList({ visitors, selectedVisitor, onSelectVisitor }: VisitorListProps) {
  const formatDuration = (seconds: number) => {
    const mins = Math.floor(seconds / 60)
    const secs = seconds % 60
    if (mins > 0) {
      return `${mins}m ${secs}s`
    }
    return `${secs}s`
  }

  const getStatusBadge = (status: string) => {
    const baseClasses = 'inline-flex items-center px-2 py-1 rounded-full text-xs font-medium'
    switch (status) {
      case 'in_chat':
        return cn(baseClasses, 'bg-green-500/20 text-green-400 border border-green-500/30')
      case 'navigating':
        return cn(baseClasses, 'bg-blue-500/20 text-blue-400 border border-blue-500/30')
      default:
        return cn(baseClasses, 'bg-gray-500/20 text-gray-400 border border-gray-500/30')
    }
  }

  const getStatusLabel = (status: string) => {
    switch (status) {
      case 'in_chat':
        return 'Em Chat'
      case 'navigating':
        return 'Navegando'
      default:
        return 'Inativo'
    }
  }

  return (
    <div className="h-full flex flex-col bg-card/95 backdrop-blur-sm border-l border-border">
      <div className="p-4 border-b border-border">
        <h2 className="text-lg font-semibold text-foreground">Visitantes Ativos</h2>
        <p className="text-sm text-muted-foreground mt-1">{visitors.length} online</p>
      </div>
      <div className="flex-1 overflow-y-auto">
        {visitors.length === 0 ? (
          <div className="p-8 text-center text-muted-foreground">
            <Globe className="h-12 w-12 mx-auto mb-4 opacity-50" />
            <p>Nenhum visitante ativo</p>
          </div>
        ) : (
          <div className="divide-y divide-border">
            {visitors.map((visitor) => (
              <button
                key={visitor.visitor_id}
                onClick={() => onSelectVisitor(visitor)}
                className={cn(
                  'w-full p-4 text-left hover:bg-accent transition-colors',
                  selectedVisitor?.visitor_id === visitor.visitor_id && 'bg-accent border-l-2 border-primary'
                )}
              >
                <div className="flex items-start justify-between mb-2">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1">
                      <MapPin className="h-4 w-4 text-muted-foreground flex-shrink-0" />
                      <span className="text-sm font-medium text-foreground truncate">
                        {visitor.city || 'Unknown'}
                        {visitor.country && `, ${visitor.country}`}
                      </span>
                    </div>
                    {visitor.country && (
                      <p className="text-xs text-muted-foreground truncate">{visitor.country}</p>
                    )}
                  </div>
                  <span className={getStatusBadge(visitor.status)}>
                    {getStatusLabel(visitor.status)}
                  </span>
                </div>
                <div className="space-y-1 mt-2">
                  <div className="flex items-center gap-2 text-xs text-muted-foreground">
                    <Clock className="h-3 w-3" />
                    <span>{formatDuration(visitor.duration)}</span>
                  </div>
                  {visitor.current_page && (
                    <div className="flex items-center gap-2 text-xs text-muted-foreground truncate">
                      <Globe className="h-3 w-3" />
                      <span className="truncate">{visitor.current_page}</span>
                    </div>
                  )}
                  {visitor.status === 'in_chat' && (
                    <div className="flex items-center gap-2 text-xs text-green-600 dark:text-green-400">
                      <MessageCircle className="h-3 w-3" />
                      <span>Em conversa</span>
                    </div>
                  )}
                </div>
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}

