import { useState, useRef, useEffect } from 'react'
import { Send, User, UserCircle, Loader2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { ChatMessage, Visitor } from '@/hooks/useLiveVisitors'
import { useAuth } from '@/contexts/AuthContext'
import { cn } from '@/lib/utils'

interface LiveChatConsoleProps {
  visitor: Visitor | null
  messages: ChatMessage[]
  onSendMessage: (message: string) => void
  onConvertToLead: (data: { name: string; email: string; phone?: string; company?: string; notes?: string }) => Promise<void>
  onClose: () => void
}

export function LiveChatConsole({
  visitor,
  messages,
  onSendMessage,
  onConvertToLead,
  onClose,
}: LiveChatConsoleProps) {
  const [message, setMessage] = useState('')
  const [isConverting, setIsConverting] = useState(false)
  const [showConvertForm, setShowConvertForm] = useState(false)
  const [leadData, setLeadData] = useState({
    name: visitor?.name || '',
    email: visitor?.email || '',
    phone: '',
    company: '',
    notes: '',
  })
  const messagesEndRef = useRef<HTMLDivElement>(null)
  const { user } = useAuth()

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages])

  useEffect(() => {
    if (visitor) {
      setLeadData({
        name: visitor.name || '',
        email: visitor.email || '',
        phone: '',
        company: '',
        notes: '',
      })
    }
  }, [visitor])

  const handleSend = () => {
    if (message.trim()) {
      onSendMessage(message)
      setMessage('')
    }
  }

  const handleConvert = async () => {
    if (!leadData.name || !leadData.email) {
      alert('Nome e email são obrigatórios')
      return
    }

    setIsConverting(true)
    try {
      await onConvertToLead(leadData)
      alert('Lead criado com sucesso!')
      setShowConvertForm(false)
    } catch (error) {
      console.error('Error converting to lead:', error)
      alert('Erro ao converter em lead')
    } finally {
      setIsConverting(false)
    }
  }

  if (!visitor) {
    return (
      <div className="w-96 bg-card/95 backdrop-blur-sm border-l border-border flex items-center justify-center">
        <div className="text-center text-muted-foreground p-8">
          <UserCircle className="h-12 w-12 mx-auto mb-4 opacity-50" />
          <p>Selecione um visitante para iniciar o chat</p>
        </div>
      </div>
    )
  }

  return (
    <div className="w-96 bg-card/95 backdrop-blur-sm border-l border-border flex flex-col h-full">
      <CardHeader className="border-b border-border bg-muted/50">
        <div className="flex items-center justify-between">
          <div>
            <CardTitle className="text-foreground text-base">
              {visitor.name || visitor.city || 'Visitante'}
            </CardTitle>
            <p className="text-xs text-muted-foreground mt-1">
              {visitor.city && visitor.country ? `${visitor.city}, ${visitor.country}` : visitor.ip || 'Unknown'}
            </p>
          </div>
          <Button
            variant="ghost"
            size="sm"
            onClick={onClose}
            className="text-muted-foreground hover:text-foreground"
          >
            ×
          </Button>
        </div>
      </CardHeader>

      <CardContent className="flex-1 flex flex-col p-0 overflow-hidden">
        {/* Messages */}
        <div className="flex-1 overflow-y-auto p-4 space-y-4 bg-muted/30">
          {messages.length === 0 ? (
            <div className="text-center text-muted-foreground py-8">
              <p className="text-sm">Nenhuma mensagem ainda</p>
              <p className="text-xs mt-2">Inicie a conversa enviando uma mensagem</p>
            </div>
          ) : (
            messages.map((msg) => (
              <div
                key={msg.id}
                className={cn(
                  'flex gap-2',
                  msg.sender_type === 'operator' ? 'justify-end' : 'justify-start'
                )}
              >
                <div
                  className={cn(
                    'max-w-[80%] rounded-lg px-3 py-2 text-sm',
                    msg.sender_type === 'operator'
                      ? 'bg-primary text-primary-foreground'
                      : 'bg-muted text-foreground'
                  )}
                >
                  <div className="font-medium text-xs mb-1 opacity-75">
                    {msg.sender_type === 'operator'
                      ? msg.user_name || 'Operador'
                      : 'Visitante'}
                  </div>
                  <div>{msg.message}</div>
                  <div className="text-xs opacity-50 mt-1">
                    {new Date(msg.created_at).toLocaleTimeString('pt-BR', {
                      hour: '2-digit',
                      minute: '2-digit',
                    })}
                  </div>
                </div>
              </div>
            ))
          )}
          <div ref={messagesEndRef} />
        </div>

        {/* Input */}
        <div className="border-t border-border p-4 bg-muted/50">
          <div className="flex gap-2">
            <Input
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              onKeyPress={(e) => {
                if (e.key === 'Enter' && !e.shiftKey) {
                  e.preventDefault()
                  handleSend()
                }
              }}
              placeholder="Digite sua mensagem..."
            />
            <Button onClick={handleSend} size="icon">
              <Send className="h-4 w-4" />
            </Button>
          </div>
          <Button
            onClick={() => setShowConvertForm(!showConvertForm)}
            variant="outline"
            className="w-full mt-2"
            size="sm"
          >
            {showConvertForm ? 'Cancelar' : 'Converter em Lead'}
          </Button>
        </div>

        {/* Convert Form */}
        {showConvertForm && (
          <div className="border-t border-border p-4 bg-muted/50 space-y-3">
            <h3 className="text-sm font-medium text-foreground">Converter em Lead</h3>
            <Input
              placeholder="Nome *"
              value={leadData.name}
              onChange={(e) => setLeadData({ ...leadData, name: e.target.value })}
            />
            <Input
              type="email"
              placeholder="Email *"
              value={leadData.email}
              onChange={(e) => setLeadData({ ...leadData, email: e.target.value })}
            />
            <Input
              placeholder="Telefone"
              value={leadData.phone}
              onChange={(e) => setLeadData({ ...leadData, phone: e.target.value })}
            />
            <Input
              placeholder="Empresa"
              value={leadData.company}
              onChange={(e) => setLeadData({ ...leadData, company: e.target.value })}
            />
            <Button
              onClick={handleConvert}
              disabled={isConverting || !leadData.name || !leadData.email}
              className="w-full"
            >
              {isConverting ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  Convertendo...
                </>
              ) : (
                'Converter'
              )}
            </Button>
          </div>
        )}
      </CardContent>
    </div>
  )
}

