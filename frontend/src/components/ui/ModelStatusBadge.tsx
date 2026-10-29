import { cn } from '../../utils/format'
import type { ModelStatus } from '../../types/api'
import { modelStatusLabel, modelStatusVariant } from '../../utils/format'
import { Badge } from '../ui/Badge'
import { CheckCircle, AlertTriangle, XCircle, Settings, WifiOff } from 'lucide-react'

const statusIcon: Record<ModelStatus, React.ElementType> = {
  ready: CheckCircle,
  error: XCircle,
  missing_weights: AlertTriangle,
  missing_dependencies: AlertTriangle,
  not_configured: WifiOff,
}

interface ModelStatusBadgeProps {
  status: ModelStatus
  showIcon?: boolean
  className?: string
}

export function ModelStatusBadge({ status, showIcon = true, className }: ModelStatusBadgeProps) {
  const variant = modelStatusVariant(status)
  const Icon = statusIcon[status] ?? Settings
  return (
    <Badge variant={variant} className={className}>
      {showIcon && <Icon className="w-3 h-3" />}
      {modelStatusLabel(status)}
    </Badge>
  )
}
