import { useState, useEffect, useCallback, useRef } from 'react'
import { livePulseApi } from '@/lib/api'

export interface Visitor {
  id: number
  tenant_id: number
  visitor_id: string
  ip?: string
  latitude?: number
  longitude?: number
  city?: string
  country?: string
  current_page?: string
  duration: number
  status: 'navigating' | 'in_chat' | 'idle'
  name?: string
  email?: string
  created_at: string
  updated_at: string
  last_activity_at: string
}

export interface ChatMessage {
  id: number
  tenant_id: number
  visitor_id: string
  sender_type: 'visitor' | 'operator'
  user_id?: number
  message: string
  created_at: string
  user_name?: string
  user_email?: string
}

export function useLiveVisitors() {
  const [visitors, setVisitors] = useState<Visitor[]>([])
  const [loading, setLoading] = useState(true)
  const [selectedVisitor, setSelectedVisitor] = useState<Visitor | null>(null)
  const [chatMessages, setChatMessages] = useState<ChatMessage[]>([])
  const durationIntervalRef = useRef<NodeJS.Timeout | null>(null)
  const pollingIntervalRef = useRef<NodeJS.Timeout | null>(null)

  // Buscar visitantes iniciais
  const fetchVisitors = useCallback(async () => {
    try {
      setLoading(true)
      const response = await livePulseApi.getVisitors()
      
      // Preservar duration local ao mesclar com dados do servidor
      setVisitors((prev) => {
        const newVisitors = response.data
        return newVisitors.map((newVisitor) => {
          // Encontrar visitante correspondente no estado anterior
          const prevVisitor = prev.find((v) => v.visitor_id === newVisitor.visitor_id)
          
          // Se o visitante já existia e o duration local é maior, preservar o local
          // Caso contrário, calcular baseado no tempo desde created_at
          if (prevVisitor && prevVisitor.duration > newVisitor.duration) {
            return {
              ...newVisitor,
              duration: prevVisitor.duration
            }
          }
          
          // Calcular duration baseado no tempo desde created_at
          const createdAt = new Date(newVisitor.created_at)
          const now = new Date()
          const calculatedDuration = Math.floor((now.getTime() - createdAt.getTime()) / 1000)
          
          return {
            ...newVisitor,
            duration: Math.max(newVisitor.duration, calculatedDuration)
          }
        })
      })
    } catch (error) {
      console.error('Error fetching visitors:', error)
    } finally {
      setLoading(false)
    }
  }, [])

  // Atualizar duração dos visitantes a cada segundo (calculando baseado em created_at)
  useEffect(() => {
    durationIntervalRef.current = setInterval(() => {
      setVisitors((prev) =>
        prev.map((v) => {
          // Calcular duration baseado no tempo desde created_at
          const createdAt = new Date(v.created_at)
          const now = new Date()
          const calculatedDuration = Math.floor((now.getTime() - createdAt.getTime()) / 1000)
          
          return {
            ...v,
            duration: calculatedDuration,
          }
        })
      )
    }, 1000)

    return () => {
      if (durationIntervalRef.current) {
        clearInterval(durationIntervalRef.current)
      }
    }
  }, [])

  // Polling para atualizações (temporário até WebSocket estar totalmente funcional)
  useEffect(() => {
    pollingIntervalRef.current = setInterval(() => {
      fetchVisitors()
      // Atualizar mensagens se houver visitante selecionado
      if (selectedVisitor) {
        livePulseApi
          .getChatHistory(selectedVisitor.visitor_id)
          .then((response) => {
            setChatMessages(response.data)
          })
          .catch((error) => {
            console.error('Error fetching chat history:', error)
          })
      }
    }, 3000) // Atualizar a cada 3 segundos

    return () => {
      if (pollingIntervalRef.current) {
        clearInterval(pollingIntervalRef.current)
      }
    }
  }, [fetchVisitors, selectedVisitor])

  // Buscar histórico de chat quando selecionar visitante
  useEffect(() => {
    if (selectedVisitor) {
      livePulseApi
        .getChatHistory(selectedVisitor.visitor_id)
        .then((response) => {
          setChatMessages(response.data)
        })
        .catch((error) => {
          console.error('Error fetching chat history:', error)
        })
    } else {
      setChatMessages([])
    }
  }, [selectedVisitor])

  // Enviar mensagem
  const sendMessage = useCallback(
    async (message: string) => {
      if (!selectedVisitor) return

      try {
        await livePulseApi.sendChatMessage(selectedVisitor.visitor_id, message)
        
        // Recarregar histórico após enviar
        const response = await livePulseApi.getChatHistory(selectedVisitor.visitor_id)
        setChatMessages(response.data)
      } catch (error) {
        console.error('Error sending message:', error)
      }
    },
    [selectedVisitor]
  )

  // Converter em lead
  const convertToLead = useCallback(
    async (leadData: { name: string; email: string; phone?: string; company?: string; notes?: string }) => {
      if (!selectedVisitor) return

      try {
        const response = await livePulseApi.convertToLead(selectedVisitor.visitor_id, leadData)
        return response.data
      } catch (error) {
        console.error('Error converting to lead:', error)
        throw error
      }
    },
    [selectedVisitor]
  )

  // Atualizar visitante
  const updateVisitor = useCallback(async (visitorId: string, data: Partial<Visitor>) => {
    try {
      const response = await livePulseApi.updateVisitor(visitorId, data)
      setVisitors((prev) =>
        prev.map((v) => (v.visitor_id === visitorId ? response.data : v))
      )
      return response.data
    } catch (error) {
      console.error('Error updating visitor:', error)
      throw error
    }
  }, [])

  // Carregar visitantes iniciais
  useEffect(() => {
    fetchVisitors()
  }, [fetchVisitors])

  return {
    visitors,
    loading,
    selectedVisitor,
    setSelectedVisitor,
    chatMessages,
    sendMessage,
    convertToLead,
    updateVisitor,
    refreshVisitors: fetchVisitors,
  }
}
