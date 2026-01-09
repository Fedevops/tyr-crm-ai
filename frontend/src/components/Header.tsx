import { useTranslation } from 'react-i18next'
import { Moon, Sun, Globe, Menu } from 'lucide-react'
import { useTheme } from '@/contexts/ThemeContext'
import { useAuth } from '@/contexts/AuthContext'
import { Button } from './ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from './ui/dropdown-menu'
import { NotificationBell } from './NotificationBell'

interface HeaderProps {
  onMenuClick?: () => void
}

export function Header({ onMenuClick }: HeaderProps) {
  const { t, i18n } = useTranslation()
  const { theme, toggleTheme } = useTheme()
  const { user } = useAuth()

  const changeLanguage = (lng: string) => {
    i18n.changeLanguage(lng)
  }

  // Formatar mensagem de boas-vindas com dia da semana e data
  const getWelcomeMessage = () => {
    const today = new Date()
    const language = i18n.language || 'pt-BR'
    const userName = user?.full_name || 'Usuário'
    
    // Obter dia da semana
    const weekday = today.toLocaleDateString(language.startsWith('pt') ? 'pt-BR' : 'en-US', {
      weekday: 'long'
    })
    
    // Obter data formatada
    const date = today.toLocaleDateString(language.startsWith('pt') ? 'pt-BR' : 'en-US', {
      day: 'numeric',
      month: 'long',
      year: 'numeric'
    })
    
    if (language.startsWith('pt')) {
      // Português: "Bem-vindo, João Silva, segunda-feira, 31 de dezembro de 2024"
      return `Bem-vindo, ${userName}, ${weekday}, ${date}`
    } else {
      // Inglês: "Welcome, John Doe, Monday, December 31, 2024"
      return `Welcome, ${userName}, ${weekday}, ${date}`
    }
  }

  return (
    <header className="flex h-16 items-center justify-between border-b bg-card px-4 md:px-6">
      <div className="flex items-center gap-2 md:gap-4">
        {/* Botão menu hambúrguer para mobile */}
        {onMenuClick && (
          <Button
            variant="ghost"
            size="icon"
            className="md:hidden"
            onClick={onMenuClick}
          >
            <Menu className="h-5 w-5" />
          </Button>
        )}
        <h2 className="text-sm md:text-lg font-semibold truncate max-w-[200px] md:max-w-none">
          <span className="hidden md:inline">{getWelcomeMessage()}</span>
          <span className="md:hidden">
            {user?.full_name || 'Usuário'}
          </span>
        </h2>
      </div>
      <div className="flex items-center gap-1 md:gap-2">
        <NotificationBell />
        <Button variant="ghost" size="icon" onClick={toggleTheme}>
          {theme === 'light' ? (
            <Moon className="h-5 w-5" />
          ) : (
            <Sun className="h-5 w-5" />
          )}
        </Button>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" size="icon">
              <Globe className="h-5 w-5" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuItem onClick={() => changeLanguage('pt-BR')}>
              Português (BR)
            </DropdownMenuItem>
            <DropdownMenuItem onClick={() => changeLanguage('en')}>
              English
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </header>
  )
}









