import { useState, useEffect } from 'react'
import { Radio, Users, MessageCircle, Globe, PanelLeftClose, PanelLeftOpen } from 'lucide-react'
import { useLiveVisitors } from '@/hooks/useLiveVisitors'
import { VisitorMap } from './components/VisitorMap'
import { VisitorList } from './components/VisitorList'
import { LiveChatConsole } from './components/LiveChatConsole'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'

export function LivePulseDashboard() {
  const {
    visitors,
    loading,
    selectedVisitor,
    setSelectedVisitor,
    chatMessages,
    sendMessage,
    convertToLead,
  } = useLiveVisitors()

  const [showChat, setShowChat] = useState(false)
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false)

  const activeVisitors = visitors.filter((v) => v.status === 'navigating' || v.status === 'in_chat')
  const inChatCount = visitors.filter((v) => v.status === 'in_chat').length

  const handleVisitorClick = (visitor: any) => {
    setSelectedVisitor(visitor)
    setShowChat(true)
  }

  const handleCloseChat = () => {
    setShowChat(false)
    setSelectedVisitor(null)
  }

  // Toggle sidebar
  const toggleSidebar = () => {
    const newState = !sidebarCollapsed
    setSidebarCollapsed(newState)
    
    // Aplicar estilo ao sidebar
    const sidebar = document.querySelector('[data-sidebar]') as HTMLElement
    if (sidebar) {
      if (newState) {
        // Esconder sidebar
        sidebar.style.transform = 'translateX(-100%)'
        sidebar.style.position = 'absolute'
        sidebar.style.zIndex = '50'
      } else {
        // Mostrar sidebar
        sidebar.style.transform = 'translateX(0)'
        sidebar.style.position = 'relative'
        sidebar.style.zIndex = 'auto'
      }
    }
  }

  // Restaurar sidebar ao desmontar componente
  useEffect(() => {
    return () => {
      const sidebar = document.querySelector('[data-sidebar]') as HTMLElement
      if (sidebar) {
        sidebar.style.transform = 'translateX(0)'
        sidebar.style.position = 'relative'
        sidebar.style.zIndex = 'auto'
      }
    }
  }, [])

  return (
    <div className="h-full flex flex-col bg-background text-foreground overflow-hidden relative">
      {/* Header */}
      <div className="bg-card border-b border-border px-6 py-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Button
              variant="ghost"
              size="icon"
              onClick={toggleSidebar}
              className="text-muted-foreground hover:text-foreground hover:bg-accent"
            >
              {sidebarCollapsed ? (
                <PanelLeftOpen className="h-5 w-5" />
              ) : (
                <PanelLeftClose className="h-5 w-5" />
              )}
            </Button>
            <div className="p-2 bg-blue-600/20 rounded-lg">
              <Radio className="h-6 w-6 text-blue-400" />
            </div>
            <div>
              <h1 className="text-2xl font-bold text-foreground">TYR Live Pulse</h1>
              <p className="text-sm text-muted-foreground">Rastreamento de visitantes em tempo real</p>
            </div>
          </div>
          <div className="flex gap-4">
            <Card>
              <CardContent className="p-4">
                <div className="flex items-center gap-3">
                  <Users className="h-5 w-5 text-blue-500" />
                  <div>
                    <div className="text-2xl font-bold text-foreground">{activeVisitors.length}</div>
                    <div className="text-xs text-muted-foreground">Visitantes Ativos</div>
                  </div>
                </div>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="p-4">
                <div className="flex items-center gap-3">
                  <MessageCircle className="h-5 w-5 text-green-500" />
                  <div>
                    <div className="text-2xl font-bold text-foreground">{inChatCount}</div>
                    <div className="text-xs text-muted-foreground">Em Chat</div>
                  </div>
                </div>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="p-4">
                <div className="flex items-center gap-3">
                  <Globe className="h-5 w-5 text-purple-500" />
                  <div>
                    <div className="text-2xl font-bold text-foreground">{visitors.length}</div>
                    <div className="text-xs text-muted-foreground">Total Hoje</div>
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>
        </div>
      </div>

      {/* Main Content */}
      <div className="flex-1 flex overflow-hidden">
        {/* Map */}
        <div className="flex-1 relative">
          {loading ? (
            <div className="absolute inset-0 flex items-center justify-center bg-background">
              <div className="text-center">
                <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary mx-auto mb-4"></div>
                <p className="text-muted-foreground">Carregando visitantes...</p>
              </div>
            </div>
          ) : (
            <VisitorMap
              visitors={visitors}
              selectedVisitor={selectedVisitor}
              onVisitorClick={handleVisitorClick}
            />
          )}
        </div>

        {/* Visitor List */}
        <div className="w-80 flex-shrink-0">
          <VisitorList
            visitors={visitors}
            selectedVisitor={selectedVisitor}
            onSelectVisitor={handleVisitorClick}
          />
        </div>

        {/* Chat Console */}
        {showChat && selectedVisitor && (
          <LiveChatConsole
            visitor={selectedVisitor}
            messages={chatMessages}
            onSendMessage={sendMessage}
            onConvertToLead={convertToLead}
            onClose={handleCloseChat}
          />
        )}
      </div>
    </div>
  )
}

