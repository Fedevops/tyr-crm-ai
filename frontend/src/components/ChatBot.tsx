import { useState, useEffect, useRef } from 'react'
import { MessageCircle, X, Send, Bot, User } from 'lucide-react'
import { Button } from './ui/button'
import { Input } from './ui/input'
import { cn } from '@/lib/utils'
import { chatApi } from '@/lib/api'
import { useTranslation } from 'react-i18next'

interface ChatMessage {
  id: number
  message: string
  response: string
  created_at: string
}

export function ChatBot() {
  const { i18n } = useTranslation()
  const [isOpen, setIsOpen] = useState(false)
  const [messages, setMessages] = useState<ChatMessage[]>([])
  const [inputMessage, setInputMessage] = useState('')
  const [loading, setLoading] = useState(false)
  const messagesEndRef = useRef<HTMLDivElement>(null)
  const messagesContainerRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (isOpen) {
      loadHistory()
    }
  }, [isOpen])

  useEffect(() => {
    scrollToBottom()
  }, [messages])

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }

  const loadHistory = async () => {
    try {
      const response = await chatApi.getHistory(20)
      setMessages(response.data || [])
    } catch (error) {
      console.error('Erro ao carregar histórico:', error)
    }
  }

  const handleSendMessage = async () => {
    if (!inputMessage.trim() || loading) return

    const userMessage = inputMessage.trim()
    setInputMessage('')
    setLoading(true)

    // Adicionar mensagem do usuário temporariamente
    const tempUserMessage: ChatMessage = {
      id: Date.now(),
      message: userMessage,
      response: '',
      created_at: new Date().toISOString()
    }
    setMessages(prev => [...prev, tempUserMessage])

    try {
      const response = await chatApi.sendMessage(userMessage)
      const newMessage = response.data
      
      // Substituir mensagem temporária pela real
      setMessages(prev => 
        prev.map(msg => 
          msg.id === tempUserMessage.id ? newMessage : msg
        )
      )
    } catch (error) {
      console.error('Erro ao enviar mensagem:', error)
      // Remover mensagem temporária em caso de erro
      setMessages(prev => prev.filter(msg => msg.id !== tempUserMessage.id))
      
      const errorMessage: ChatMessage = {
        id: Date.now(),
        message: userMessage,
        response: i18n.language?.startsWith('pt') 
          ? 'Desculpe, ocorreu um erro ao processar sua mensagem. Tente novamente.'
          : 'Sorry, an error occurred processing your message. Please try again.',
        created_at: new Date().toISOString()
      }
      setMessages(prev => [...prev, errorMessage])
    } finally {
      setLoading(false)
    }
  }

  const handleKeyPress = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      handleSendMessage()
    }
  }

  const formatTime = (dateString: string) => {
    const date = new Date(dateString)
    return date.toLocaleTimeString(i18n.language?.startsWith('pt') ? 'pt-BR' : 'en-US', {
      hour: '2-digit',
      minute: '2-digit'
    })
  }

  return (
    <>
      {/* Botão flutuante */}
      {!isOpen && (
        <button
          onClick={() => setIsOpen(true)}
          className="fixed bottom-6 right-6 h-14 w-14 rounded-full bg-primary text-primary-foreground shadow-lg hover:bg-primary/90 transition-all hover:scale-110 z-50 flex items-center justify-center"
          aria-label="Abrir chat"
        >
          <MessageCircle className="h-6 w-6" />
        </button>
      )}

      {/* Chat Window */}
      {isOpen && (
        <div className="fixed bottom-6 right-6 w-96 h-[600px] bg-card border rounded-lg shadow-2xl flex flex-col z-50">
          {/* Header */}
          <div className="flex items-center justify-between p-4 border-b bg-primary text-primary-foreground rounded-t-lg">
            <div className="flex items-center gap-2">
              <Bot className="h-5 w-5" />
              <h3 className="font-semibold">
                {i18n.language?.startsWith('pt') ? 'Assistente Virtual' : 'Virtual Assistant'}
              </h3>
            </div>
            <Button
              variant="ghost"
              size="icon"
              className="h-8 w-8 text-primary-foreground hover:bg-primary-foreground/20"
              onClick={() => setIsOpen(false)}
            >
              <X className="h-4 w-4" />
            </Button>
          </div>

          {/* Messages */}
          <div
            ref={messagesContainerRef}
            className="flex-1 overflow-y-auto p-4 space-y-4"
          >
            {messages.length === 0 ? (
              <div className="flex items-center justify-center h-full text-center text-muted-foreground">
                <div>
                  <Bot className="h-12 w-12 mx-auto mb-4 opacity-50" />
                  <p className="text-sm">
                    {i18n.language?.startsWith('pt')
                      ? 'Olá! Como posso ajudar você hoje?'
                      : 'Hello! How can I help you today?'}
                  </p>
                </div>
              </div>
            ) : (
              messages.map((msg) => (
                <div key={msg.id} className="space-y-2">
                  {/* User Message */}
                  <div className="flex justify-end">
                    <div className="max-w-[80%] bg-primary text-primary-foreground rounded-lg p-3">
                      <p className="text-sm">{msg.message}</p>
                      <p className="text-xs opacity-70 mt-1">
                        {formatTime(msg.created_at)}
                      </p>
                    </div>
                  </div>

                  {/* Bot Response */}
                  <div className="flex justify-start">
                    <div className="max-w-[80%] bg-muted rounded-lg p-3">
                      <div className="flex items-start gap-2">
                        <Bot className="h-4 w-4 mt-0.5 text-primary" />
                        <div className="flex-1">
                          <p className="text-sm whitespace-pre-wrap">{msg.response}</p>
                          <p className="text-xs text-muted-foreground mt-1">
                            {formatTime(msg.created_at)}
                          </p>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              ))
            )}
            {loading && (
              <div className="flex justify-start">
                <div className="bg-muted rounded-lg p-3">
                  <div className="flex items-center gap-2">
                    <Bot className="h-4 w-4 text-primary animate-pulse" />
                    <span className="text-sm text-muted-foreground">
                      {i18n.language?.startsWith('pt') ? 'Digitando...' : 'Typing...'}
                    </span>
                  </div>
                </div>
              </div>
            )}
            <div ref={messagesEndRef} />
          </div>

          {/* Input */}
          <div className="p-4 border-t">
            <div className="flex gap-2">
              <Input
                value={inputMessage}
                onChange={(e) => setInputMessage(e.target.value)}
                onKeyPress={handleKeyPress}
                placeholder={
                  i18n.language?.startsWith('pt')
                    ? 'Digite sua pergunta...'
                    : 'Type your question...'
                }
                disabled={loading}
                className="flex-1"
              />
              <Button
                onClick={handleSendMessage}
                disabled={!inputMessage.trim() || loading}
                size="icon"
              >
                <Send className="h-4 w-4" />
              </Button>
            </div>
          </div>
        </div>
      )}
    </>
  )
}

