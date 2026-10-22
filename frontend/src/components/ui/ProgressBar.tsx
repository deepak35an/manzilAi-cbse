import { cn } from '@/lib/utils'

interface ProgressBarProps {
  value: number  // 0–100
  label?: string
  sublabel?: string
  color?: 'primary' | 'success' | 'warning' | 'danger'
  size?: 'sm' | 'md'
}

const colorBar = {
  primary: 'bg-primary-500',
  success: 'bg-success-500',
  warning: 'bg-warning-500',
  danger:  'bg-danger-500',
}

export default function ProgressBar({ value, label, sublabel, color = 'primary', size = 'md' }: ProgressBarProps) {
  const clampedVal = Math.min(100, Math.max(0, value))
  return (
    <div>
      {(label || sublabel) && (
        <div className="flex items-center justify-between mb-1.5">
          {label && <span className="text-sm font-medium text-gray-700">{label}</span>}
          {sublabel && <span className="text-xs text-gray-400">{sublabel}</span>}
        </div>
      )}
      <div className={cn('w-full bg-gray-100 rounded-full overflow-hidden', size === 'sm' ? 'h-1.5' : 'h-2.5')}>
        <div
          className={cn('h-full rounded-full transition-all duration-500', colorBar[color])}
          style={{ width: `${clampedVal}%` }}
        />
      </div>
    </div>
  )
}
