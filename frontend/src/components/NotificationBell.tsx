import { useState, useEffect } from 'react'
import { Bell, Check, X, Trash2 } from 'lucide-react'
import { Button } from './ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuTrigger,
} from './ui/dropdown-menu'
import { Badge } from './ui/badge'
import { cn } from '@/lib/utils'
import { notificationsApi } from '@/lib/api'
import { useNavigate } from 'react-router-dom'
import { formatDistanceToNow } from 'date-fns'
import { ptBR, enUS } from 'date-fns/locale'
import { useTranslation } from 'react-i18next'

interface Notification {
  id: number
  type: string
  title: string
  message: string
  is_read: boolean
  action_url?: string
  created_at: string
}

export function NotificationBell() {
  const { i18n } = useTranslation()
  const navigate = useNavigate()
  const [notifications, setNotifications] = useState<Notification[]>([])
  const [unreadCount, setUnreadCount] = useState(0)
  const [loading, setLoading] = useState(false)
  const [open, setOpen] = useState(false)

  const locale = i18n.language?.startsWith('pt') ? ptBR : enUS

  useEffect(() => {
    fetchNotifications()
    fetchUnreadCount()
    
    // Gerar notificações ao carregar
    generateNotifications()
    
    // Polling a cada 30 segundos
    const interval = setInterval(() => {
      fetchNotifications()
      fetchUnreadCount()
      generateNotifications()
    }, 30000)
    
    return () => clearInterval(interval)
  }, [])

  const fetchNotifications = async () => {
    try {
      setLoading(true)
      const response = await notificationsApi.getNotifications({ limit: 20 })
      setNotifications(response.data)
    } catch (error) {
      console.error('Erro ao buscar notificações:', error)
    } finally {
      setLoading(false)
    }
  }

  const fetchUnreadCount = async () => {
    try {
      const response = await notificationsApi.getUnreadCount()
      setUnreadCount(response.data.count)
    } catch (error) {
      console.error('Erro ao buscar contador de não lidas:', error)
    }
  }

  const generateNotifications = async () => {
    try {
      await notificationsApi.generateNotifications()
      // Atualizar após gerar
      fetchNotifications()
      fetchUnreadCount()
    } catch (error) {
      console.error('Erro ao gerar notificações:', error)
    }
  }

  const handleMarkAsRead = async (notificationId: number) => {
    try {
      await notificationsApi.markAsRead(notificationId)
      setNotifications(prev =>
        prev.map(n =>
          n.id === notificationId ? { ...n, is_read: true } : n
        )
      )
      setUnreadCount(prev => Math.max(0, prev - 1))
    } catch (error) {
      console.error('Erro ao marcar como lida:', error)
    }
  }

  const handleMarkAllAsRead = async () => {
    try {
      await notificationsApi.markAllAsRead()
      setNotifications(prev => prev.map(n => ({ ...n, is_read: true })))
      setUnreadCount(0)
    } catch (error) {
      console.error('Erro ao marcar todas como lidas:', error)
    }
  }

  const handleDelete = async (notificationId: number, e: React.MouseEvent) => {
    e.stopPropagation()
    try {
      await notificationsApi.deleteNotification(notificationId)
      setNotifications(prev => prev.filter(n => n.id !== notificationId))
      const deleted = notifications.find(n => n.id === notificationId)
      if (deleted && !deleted.is_read) {
        setUnreadCount(prev => Math.max(0, prev - 1))
      }
    } catch (error) {
      console.error('Erro ao deletar notificação:', error)
    }
  }

  const handleNotificationClick = (notification: Notification) => {
    if (!notification.is_read) {
      handleMarkAsRead(notification.id)
    }
    if (notification.action_url) {
      navigate(notification.action_url)
      setOpen(false)
    }
  }

  const getNotificationIcon = (type: string) => {
    switch (type) {
      case 'task_due_today':
      case 'task_overdue':
        return '📋'
      case 'appointment_today':
      case 'appointment_upcoming':
        return '📅'
      case 'limit_warning':
      case 'limit_exceeded':
        return '⚠️'
      case 'email_received':
        return '📧'
      default:
        return '🔔'
    }
  }

  const getNotificationColor = (type: string) => {
    if (type.includes('exceeded') || type.includes('overdue')) {
      return 'border-red-200 bg-red-50 dark:bg-red-950/20 dark:border-red-900'
    }
    if (type.includes('warning')) {
      return 'border-yellow-200 bg-yellow-50 dark:bg-yellow-950/20 dark:border-yellow-900'
    }
    return 'border-blue-200 bg-blue-50 dark:bg-blue-950/20 dark:border-blue-900'
  }

  return (
    <DropdownMenu open={open} onOpenChange={setOpen}>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" size="icon" className="relative">
          <Bell className="h-5 w-5" />
          {unreadCount > 0 && (
            <Badge
              variant="destructive"
              className="absolute -top-1 -right-1 h-5 w-5 flex items-center justify-center p-0 text-xs"
            >
              {unreadCount > 99 ? '99+' : unreadCount}
            </Badge>
          )}
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-80 p-0">
        <div className="flex items-center justify-between p-4 border-b">
          <h3 className="font-semibold">Notificações</h3>
          {unreadCount > 0 && (
            <Button
              variant="ghost"
              size="sm"
              onClick={handleMarkAllAsRead}
              className="h-8 text-xs"
            >
              Marcar todas como lidas
            </Button>
          )}
        </div>
        <div className="max-h-96 overflow-y-auto">
          {loading ? (
            <div className="p-4 text-center text-sm text-muted-foreground">
              Carregando...
            </div>
          ) : notifications.length === 0 ? (
            <div className="p-8 text-center text-sm text-muted-foreground">
              Nenhuma notificação
            </div>
          ) : (
            notifications.map((notification) => (
              <div
                key={notification.id}
                className={cn(
                  'p-4 border-b cursor-pointer hover:bg-accent transition-colors',
                  !notification.is_read && 'bg-accent/50',
                  getNotificationColor(notification.type)
                )}
                onClick={() => handleNotificationClick(notification)}
              >
                <div className="flex items-start gap-3">
                  <span className="text-2xl mt-1">
                    {getNotificationIcon(notification.type)}
                  </span>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-start justify-between gap-2">
                      <div className="flex-1">
                        <p className="font-medium text-sm">{notification.title}</p>
                        <p className="text-xs text-muted-foreground mt-1">
                          {notification.message}
                        </p>
                        <p className="text-xs text-muted-foreground mt-2">
                          {formatDistanceToNow(new Date(notification.created_at), {
                            addSuffix: true,
                            locale
                          })}
                        </p>
                      </div>
                      <div className="flex items-center gap-1">
                        {!notification.is_read && (
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-6 w-6"
                            onClick={(e) => {
                              e.stopPropagation()
                              handleMarkAsRead(notification.id)
                            }}
                          >
                            <Check className="h-3 w-3" />
                          </Button>
                        )}
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-6 w-6"
                          onClick={(e) => handleDelete(notification.id, e)}
                        >
                          <Trash2 className="h-3 w-3" />
                        </Button>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            ))
          )}
        </div>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}

