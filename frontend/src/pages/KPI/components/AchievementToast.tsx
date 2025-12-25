import { useEffect } from 'react'
import { useToast } from '@/components/ui/use-toast'
import { Trophy, Sparkles } from 'lucide-react'

interface AchievementToastProps {
  goalTitle: string
  onClose: () => void
}

export function AchievementToast({ goalTitle, onClose }: AchievementToastProps) {
  const { toast } = useToast()

  useEffect(() => {
    // Disparar confete visual (simulado com animação)
    const confetti = document.createElement('div')
    confetti.style.cssText = `
      position: fixed;
      top: 0;
      left: 0;
      width: 100%;
      height: 100%;
      pointer-events: none;
      z-index: 9999;
    `
    document.body.appendChild(confetti)

    // Criar partículas de confete
    for (let i = 0; i < 50; i++) {
      const particle = document.createElement('div')
      const colors = ['#f59e0b', '#ef4444', '#10b981', '#3b82f6', '#8b5cf6']
      const color = colors[Math.floor(Math.random() * colors.length)]
      particle.style.cssText = `
        position: absolute;
        width: 10px;
        height: 10px;
        background: ${color};
        left: ${Math.random() * 100}%;
        top: ${Math.random() * 100}%;
        border-radius: 50%;
        animation: confetti-fall ${1 + Math.random()}s linear forwards;
      `
      confetti.appendChild(particle)
    }

    // Adicionar animação CSS
    const style = document.createElement('style')
    style.textContent = `
      @keyframes confetti-fall {
        to {
          transform: translateY(100vh) rotate(360deg);
          opacity: 0;
        }
      }
    `
    document.head.appendChild(style)

    // Mostrar toast
    toast({
      variant: 'success',
      title: (
        <div className="flex items-center gap-2">
          <Trophy className="h-5 w-5 text-yellow-500" />
          <span>Meta Concluída! 🎉</span>
        </div>
      ),
      description: (
        <div className="space-y-1">
          <p className="font-semibold">{goalTitle}</p>
          <p className="text-sm">Parabéns! Você atingiu sua meta!</p>
        </div>
      ),
    })

    // Limpar confete após animação
    setTimeout(() => {
      confetti.remove()
      style.remove()
      onClose()
    }, 3000)

    return () => {
      confetti.remove()
      style.remove()
    }
  }, [goalTitle, toast, onClose])

  return null
}

