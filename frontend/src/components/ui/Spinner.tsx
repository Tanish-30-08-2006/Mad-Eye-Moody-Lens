import { cn } from '../../utils/format'

interface SpinnerProps { className?: string; size?: 'sm' | 'md' | 'lg' }

export function Spinner({ className, size = 'md' }: SpinnerProps) {
  const sizes = { sm: 'w-4 h-4 border-2', md: 'w-5 h-5 border-2', lg: 'w-8 h-8 border-[3px]' }
  return (
    <div
      className={cn(
        sizes[size],
        'border-gray-600 border-t-brand-500 rounded-full animate-spin',
        className,
      )}
      role="status"
      aria-label="Loading"
    />
  )
}
