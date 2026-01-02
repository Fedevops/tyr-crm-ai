import { useTheme } from '@/contexts/ThemeContext'

export function TyrLoadingSpinner() {
  const { theme } = useTheme()
  const isDark = theme === 'dark'

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-background/80 backdrop-blur-sm">
      <div className="flex flex-col items-center justify-center">
        <div className="relative">
          {/* Logo com animação de pulso */}
          <img 
            src={isDark ? "/assets/LOGO BRANCO.svg" : "/assets/LOGO AZUL.png"}
            alt="TYR CRM AI"
            className="h-32 w-auto animate-pulse opacity-75"
            style={{
              animation: 'pulse 2s cubic-bezier(0.4, 0, 0.6, 1) infinite',
            }}
          />
          {/* Efeito de brilho ao redor */}
          <div 
            className="absolute inset-0 rounded-full blur-2xl opacity-30"
            style={{
              background: isDark 
                ? 'radial-gradient(circle, rgba(255,255,255,0.5) 0%, transparent 70%)'
                : 'radial-gradient(circle, rgba(59,130,246,0.5) 0%, transparent 70%)',
              animation: 'pulse 2s cubic-bezier(0.4, 0, 0.6, 1) infinite',
            }}
          />
        </div>
        {/* Texto opcional */}
        <p className="mt-4 text-sm text-muted-foreground animate-pulse">
          Carregando...
        </p>
      </div>
    </div>
  )
}




