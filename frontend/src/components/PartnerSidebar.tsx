import { Link, useLocation } from 'react-router-dom'
import { useState } from 'react'
import { LayoutDashboard, Users, DollarSign, MessageSquare, Link2, LogOut, Menu, X } from 'lucide-react'
import { usePartnerAuth } from '@/contexts/PartnerAuthContext'
import { Button } from './ui/button'
import { cn } from '@/lib/utils'

const navigation = [
  { name: 'Dashboard', href: '/partner/dashboard', icon: LayoutDashboard },
  { name: 'Link de Indicação', href: '/partner/referral-link', icon: Link2 },
  { name: 'Meus Clientes', href: '/partner/customers', icon: Users },
  { name: 'Extrato Financeiro', href: '/partner/financial-statement', icon: DollarSign },
  { name: 'Suporte', href: '/partner/support', icon: MessageSquare },
]

interface PartnerSidebarProps {
  isOpen?: boolean
  onClose?: () => void
}

export function PartnerSidebar({ isOpen = true, onClose }: PartnerSidebarProps) {
  const location = useLocation()
  const { logout, user } = usePartnerAuth()

  const handleLinkClick = () => {
    if (onClose && window.innerWidth < 768) {
      onClose()
    }
  }

  return (
    <>
      {/* Overlay para mobile */}
      {onClose && (
        <div
          className={cn(
            "fixed inset-0 bg-black/50 z-40 transition-opacity md:hidden",
            isOpen ? "opacity-100" : "opacity-0 pointer-events-none"
          )}
          onClick={onClose}
        />
      )}
      
      {/* Sidebar */}
      <div className={cn(
        "fixed md:static inset-y-0 left-0 z-50 flex h-screen w-64 flex-col border-r bg-card shadow-sm transition-transform duration-300 ease-in-out",
        isOpen ? "translate-x-0" : "-translate-x-full md:translate-x-0"
      )}>
        <div className="flex h-20 items-center justify-between border-b px-6 bg-gradient-to-r from-blue-50/50 via-indigo-50/50 to-purple-50/50 dark:from-blue-950/20 dark:via-indigo-950/20 dark:to-purple-950/20">
          <Link to="/partner/dashboard" onClick={handleLinkClick} className="flex items-center gap-3 group transition-all duration-200 hover:opacity-80">
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
          </Link>
          {onClose && (
            <Button
              variant="ghost"
              size="icon"
              className="md:hidden"
              onClick={onClose}
            >
              <X className="h-5 w-5" />
            </Button>
          )}
        </div>
        <nav className="flex-1 space-y-1 px-3 py-4 overflow-y-auto">
          {navigation.map((item) => {
            const Icon = item.icon
            const isActive = location.pathname === item.href
            return (
              <Link
                key={item.name}
                to={item.href}
                onClick={handleLinkClick}
                className={cn(
                  'flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-colors',
                  isActive
                    ? 'bg-primary text-primary-foreground'
                    : 'text-muted-foreground hover:bg-accent hover:text-accent-foreground'
                )}
              >
                <Icon className="h-5 w-5" />
                {item.name}
              </Link>
            )
          })}
        </nav>
        <div className="border-t p-3">
          <div className="mb-2 px-3 py-2 text-sm text-muted-foreground">
            <div className="font-medium">{user?.full_name}</div>
            <div className="text-xs">{user?.partner_nome}</div>
          </div>
          <Button
            variant="ghost"
            className="w-full justify-start"
            onClick={() => {
              handleLinkClick()
              logout()
            }}
          >
            <LogOut className="mr-3 h-5 w-5" />
            Sair
          </Button>
        </div>
      </div>
    </>
  )
}

