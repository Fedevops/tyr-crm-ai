import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import {
  User,
  Palette,
  Users,
  CreditCard,
  Shield,
  Key,
  Menu,
  X,
  Radio,
  FileCode,
  BarChart3,
  Plug,
  FileEdit,
  Layers,
  Database,
} from 'lucide-react'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Profile } from './sections/Profile'
import { Branding } from './sections/Branding'
import { Team } from './sections/Team'
import { Billing } from './sections/Billing'
import { Security } from './sections/Security'
import { ApiKeys } from './sections/ApiKeys'
import { LivePulse } from './sections/LivePulse'
import { ProposalTemplates } from './sections/ProposalTemplates'
import { UsageSection } from './sections/UsageSection'
import { Integrations } from './sections/Integrations'
import { FormBuilder } from './sections/FormBuilder'
import { ModuleEditor } from './sections/ModuleEditor'
import { CustomModuleManager } from './sections/CustomModuleManager'
import { cn } from '@/lib/utils'

type SettingsSection = 'profile' | 'branding' | 'team' | 'billing' | 'security' | 'apikeys' | 'livepulse' | 'proposal-templates' | 'usage' | 'integrations' | 'form-builder' | 'module-editor' | 'custom-modules'

interface NavItem {
  id: SettingsSection
  label: string
  icon: React.ElementType
}

export function SettingsHub() {
  const { t } = useTranslation()
  const [activeSection, setActiveSection] = useState<SettingsSection>('profile')
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false)

  const navItems: NavItem[] = [
    { id: 'profile', label: 'Perfil', icon: User },
    { id: 'branding', label: 'Branding', icon: Palette },
    { id: 'team', label: 'Equipe', icon: Users },
    { id: 'billing', label: 'Faturamento', icon: CreditCard },
    { id: 'usage', label: 'Uso e Limites', icon: BarChart3 },
    { id: 'security', label: 'Segurança', icon: Shield },
    { id: 'apikeys', label: 'API Keys', icon: Key },
    { id: 'livepulse', label: 'Live Pulse', icon: Radio },
    { id: 'proposal-templates', label: 'Templates de Proposta', icon: FileCode },
    { id: 'integrations', label: 'Integrações', icon: Plug },
    { id: 'form-builder', label: 'Form Builder', icon: FileEdit },
    { id: 'module-editor', label: 'Editor de Campos', icon: Layers },
    { id: 'custom-modules', label: 'Módulos Customizados', icon: Database },
  ]

  const renderSection = () => {
    switch (activeSection) {
      case 'profile':
        return <Profile />
      case 'branding':
        return <Branding />
      case 'team':
        return <Team />
      case 'billing':
        return <Billing />
      case 'security':
        return <Security />
      case 'apikeys':
        return <ApiKeys />
      case 'livepulse':
        return <LivePulse />
      case 'proposal-templates':
        return <ProposalTemplates />
      case 'usage':
        return <UsageSection />
      case 'integrations':
        return <Integrations />
      case 'form-builder':
        return <FormBuilder />
      case 'module-editor':
        return <ModuleEditor />
      case 'custom-modules':
        return <CustomModuleManager />
      default:
        return <Profile />
    }
  }

  return (
    <div className="flex-1 flex flex-col lg:flex-row h-full">
      {/* Mobile Menu Button */}
      <div className="lg:hidden border-b p-4 flex items-center justify-between">
        <h1 className="text-2xl font-bold">Configurações</h1>
        <Button
          variant="ghost"
          size="icon"
          onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
        >
          {mobileMenuOpen ? <X className="h-6 w-6" /> : <Menu className="h-6 w-6" />}
        </Button>
      </div>

      {/* Sidebar Navigation */}
      <aside
        className={cn(
          'w-full lg:w-64 border-r bg-card flex-shrink-0',
          'lg:block',
          mobileMenuOpen ? 'block' : 'hidden'
        )}
      >
        <div className="p-4 lg:p-6">
          <h2 className="text-lg font-semibold mb-4 hidden lg:block">
            Configurações
          </h2>
          <nav className="space-y-1">
            {navItems.map((item) => {
              const Icon = item.icon
              return (
                <button
                  key={item.id}
                  onClick={() => {
                    setActiveSection(item.id)
                    setMobileMenuOpen(false)
                  }}
                  className={cn(
                    'w-full flex items-center gap-3 px-4 py-3 rounded-lg text-left transition-colors',
                    'hover:bg-accent hover:text-accent-foreground',
                    activeSection === item.id
                      ? 'bg-primary text-primary-foreground'
                      : 'text-muted-foreground'
                  )}
                >
                  <Icon className="h-5 w-5" />
                  <span className="font-medium">{item.label}</span>
                </button>
              )
            })}
          </nav>
        </div>
      </aside>

      {/* Main Content */}
      <main className="flex-1 overflow-y-auto">
        <div className="p-4 lg:p-6">
          <Card>
            <CardContent className="p-6">
              {renderSection()}
            </CardContent>
          </Card>
        </div>
      </main>
    </div>
  )
}


