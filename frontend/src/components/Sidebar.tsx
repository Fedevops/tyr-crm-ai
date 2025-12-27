import { Link, useLocation } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { LayoutDashboard, BookOpen, Users, Settings, LogOut, ListChecks, Workflow, Search, Building2, UserCircle, TrendingUp, FileText, Filter, History, Target, Radio, BarChart3, Package } from 'lucide-react'
import { useAuth } from '@/contexts/AuthContext'
import { Button } from './ui/button'
import { cn } from '@/lib/utils'

const navigation = [
  { name: 'dashboard', href: '/dashboard', icon: LayoutDashboard },
  { name: 'prospecting', href: '/prospecting', icon: Search },
  { name: 'leads', href: '/leads', icon: Users },
  { name: 'accounts', href: '/accounts', icon: Building2 },
  { name: 'contacts', href: '/contacts', icon: UserCircle },
  { name: 'opportunities', href: '/opportunities', icon: TrendingUp },
  { name: 'proposals', href: '/proposals', icon: FileText },
  { name: 'catalog', href: '/catalog', icon: Package },
  { name: 'sales-funnels', href: '/sales-funnels', icon: Filter },
  { name: 'tasks', href: '/tasks', icon: ListChecks },
  { name: 'sequences', href: '/sequences', icon: Workflow },
  { name: 'playbooks', href: '/playbooks', icon: BookOpen },
  { name: 'kpi', href: '/kpi', icon: Target },
  { name: 'live-pulse', href: '/live-pulse', icon: Radio },
  { name: 'visit-reports', href: '/visit-reports', icon: BarChart3 },
  { name: 'audit-log', href: '/audit-log', icon: History },
  { name: 'settings', href: '/settings', icon: Settings },
]

export function Sidebar() {
  const { t } = useTranslation()
  const location = useLocation()
  const { logout } = useAuth()

  return (
    <div className="flex h-screen w-64 flex-col border-r bg-card shadow-sm">
      <div className="flex h-20 items-center justify-center border-b px-6 bg-gradient-to-r from-blue-50/50 via-indigo-50/50 to-purple-50/50 dark:from-blue-950/20 dark:via-indigo-950/20 dark:to-purple-950/20">
        <Link to="/dashboard" className="flex items-center gap-3 group transition-all duration-200 hover:opacity-80">
          <div className="relative flex-shrink-0">
            <img 
              src="/assets/LOGO AZUL.png" 
              alt="TYR CRM AI" 
              className="h-24 w-auto dark:hidden transition-all duration-300 group-hover:scale-110 drop-shadow-sm"
            />
            <img 
              src="/assets/LOGO BRANCO.svg" 
              alt="TYR CRM AI" 
              className="h-24 w-auto hidden dark:block transition-all duration-300 group-hover:scale-110 drop-shadow-sm"
            />
          </div>
          <div className="flex flex-col">
            {/* <span className="text-lg font-bold bg-gradient-to-r from-blue-600 via-indigo-600 to-purple-600 dark:from-blue-400 dark:via-indigo-400 dark:to-purple-400 bg-clip-text text-transparent leading-tight">
              TYR CRM
            </span>
            <span className="text-xs font-medium text-muted-foreground -mt-1">
              AI
            </span> */}
          </div>
        </Link>
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





