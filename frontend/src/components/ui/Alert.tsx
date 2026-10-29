import { AlertTriangle, Info, CheckCircle, XCircle } from 'lucide-react'
import { cn } from '../../utils/format'

type AlertVariant = 'info' | 'warning' | 'error' | 'success'

const config: Record<AlertVariant, { icon: React.ElementType; classes: string }> = {
  info: { icon: Info, classes: 'bg-blue-950/40 border-blue-800/50 text-blue-300' },
  warning: { icon: AlertTriangle, classes: 'bg-amber-950/40 border-amber-800/50 text-amber-300' },
  error: { icon: XCircle, classes: 'bg-red-950/40 border-red-800/50 text-red-300' },
  success: { icon: CheckCircle, classes: 'bg-emerald-950/40 border-emerald-800/50 text-emerald-300' },
}

interface AlertProps {
  variant?: AlertVariant
  title?: string
  children: React.ReactNode
  className?: string
}

export function Alert({ variant = 'info', title, children, className }: AlertProps) {
  const { icon: Icon, classes } = config[variant]
  return (
    <div className={cn('flex gap-3 border rounded-lg p-4', classes, className)}>
      <Icon className="shrink-0 mt-0.5 w-4 h-4" />
      <div className="min-w-0">
        {title && <p className="font-semibold text-sm mb-1">{title}</p>}
        <div className="text-sm opacity-90">{children}</div>
      </div>
    </div>
  )
}
