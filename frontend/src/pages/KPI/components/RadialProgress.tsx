import { cn } from '@/lib/utils'

interface RadialProgressProps {
  value: number // 0-100
  size?: number
  strokeWidth?: number
  className?: string
  showLabel?: boolean
  label?: string
}

export function RadialProgress({
  value,
  size = 120,
  strokeWidth = 8,
  className,
  showLabel = true,
  label,
}: RadialProgressProps) {
  const radius = (size - strokeWidth) / 2
  const circumference = 2 * Math.PI * radius
  const offset = circumference - (value / 100) * circumference

  // Cores semânticas baseadas no progresso
  const getColor = () => {
    if (value >= 100) return 'text-green-600 stroke-green-600'
    if (value >= 80) return 'text-green-500 stroke-green-500'
    if (value >= 50) return 'text-yellow-500 stroke-yellow-500'
    return 'text-red-500 stroke-red-500'
  }

  const color = getColor()

  return (
    <div className={cn('relative inline-flex items-center justify-center', className)}>
      <svg
        width={size}
        height={size}
        className="transform -rotate-90"
      >
        {/* Background circle */}
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          stroke="currentColor"
          strokeWidth={strokeWidth}
          fill="none"
          className="text-gray-200 dark:text-gray-800"
        />
        {/* Progress circle */}
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          stroke="currentColor"
          strokeWidth={strokeWidth}
          fill="none"
          strokeDasharray={circumference}
          strokeDashoffset={offset}
          strokeLinecap="round"
          className={cn('transition-all duration-500', color)}
        />
      </svg>
      {showLabel && (
        <div className="absolute inset-0 flex flex-col items-center justify-center">
          <span className={cn('text-2xl font-bold', color)}>
            {Math.round(value)}%
          </span>
          {label && (
            <span className="text-xs text-muted-foreground mt-1">{label}</span>
          )}
        </div>
      )}
    </div>
  )
}


