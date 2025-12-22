import { Link, useLocation } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { LayoutDashboard, BookOpen, Users, Settings, LogOut, ListChecks, Workflow } from 'lucide-react'
import { useAuth } from '@/contexts/AuthContext'
import { Button } from './ui/button'
import { cn } from '@/lib/utils'

const navigation = [
  { name: 'dashboard', href: '/dashboard', icon: LayoutDashboard },
  { name: 'leads', href: '/leads', icon: Users },
  { name: 'tasks', href: '/tasks', icon: ListChecks },
  { name: 'sequences', href: '/sequences', icon: Workflow },
  { name: 'playbooks', href: '/playbooks', icon: BookOpen },
  { name: 'settings', href: '/settings', icon: Settings },
]

export function Sidebar() {
  const { t } = useTranslation()
  const location = useLocation()
  const { logout } = useAuth()

  return (
    <div className="flex h-screen w-64 flex-col border-r bg-card">
      <div className="flex h-16 items-center border-b px-6">
        <h1 className="text-xl font-bold">TYR CRM AI</h1>
      </div>
      <nav className="flex-1 space-y-1 px-3 py-4">
        {navigation.map((item) => {
          const Icon = item.icon
          const isActive = location.pathname === item.href
          return (
            <Link
              key={item.name}
              to={item.href}
              className={cn(
                'flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-colors',
                isActive
                  ? 'bg-primary text-primary-foreground'
                  : 'text-muted-foreground hover:bg-accent hover:text-accent-foreground'
              )}
            >
              <Icon className="h-5 w-5" />
              {t(`navigation.${item.name}`)}
            </Link>
          )
        })}
      </nav>
      <div className="border-t p-3">
        <Button
          variant="ghost"
          className="w-full justify-start"
          onClick={logout}
        >
          <LogOut className="mr-3 h-5 w-5" />
          {t('common.logout')}
        </Button>
      </div>
    </div>
  )
}





