import { Button } from './ui/button'
import { Menu } from 'lucide-react'

interface PartnerHeaderProps {
  onMenuClick?: () => void
}

export function PartnerHeader({ onMenuClick }: PartnerHeaderProps) {
  return (
    <header className="sticky top-0 z-30 flex h-16 items-center gap-4 border-b bg-background px-4 md:px-6">
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
      <div className="flex-1">
        <h1 className="text-lg font-semibold">Portal do Parceiro</h1>
      </div>
    </header>
  )
}

