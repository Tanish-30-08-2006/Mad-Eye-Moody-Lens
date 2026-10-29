import { cn } from '../../utils/format'

interface MetaRowProps {
  label: string
  value: React.ReactNode
  className?: string
}

export function MetaRow({ label, value, className }: MetaRowProps) {
  return (
    <div className={cn('flex justify-between gap-4 py-2 border-b border-gray-800/60 last:border-0', className)}>
      <span className="text-xs text-gray-500 shrink-0">{label}</span>
      <span className="text-xs text-gray-300 text-right font-mono break-all">{value ?? '—'}</span>
    </div>
  )
}
