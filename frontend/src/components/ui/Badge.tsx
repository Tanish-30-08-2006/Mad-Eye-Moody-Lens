import { cn } from '../../utils/format'

type Variant = 'success' | 'warning' | 'error' | 'neutral' | 'info'

const variantClasses: Record<Variant, string> = {
  success: 'badge-success',
  warning: 'badge-warning',
  error: 'badge-error',
  neutral: 'badge-neutral',
  info: 'badge-info',
}

interface BadgeProps {
  variant?: Variant
  children: React.ReactNode
  className?: string
}

export function Badge({ variant = 'neutral', children, className }: BadgeProps) {
  return (
    <span className={cn('badge', variantClasses[variant], className)}>
      {children}
    </span>
  )
}
