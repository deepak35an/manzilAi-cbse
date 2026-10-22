import type { LucideIcon } from 'lucide-react'
import { cn } from '@/lib/utils'

interface MetricCardProps {
  title: string
  value: string | number
  subtitle?: string
  icon?: LucideIcon
  color?: 'primary' | 'success' | 'warning' | 'danger' | 'default'
  loading?: boolean
}

const colorMap = {
  primary: { bg: 'bg-primary-50', icon: 'text-primary-600', value: 'text-primary-700' },
  success: { bg: 'bg-success-50', icon: 'text-success-600', value: 'text-success-700' },
  warning: { bg: 'bg-warning-50', icon: 'text-warning-600', value: 'text-warning-600' },
  danger:  { bg: 'bg-danger-50',  icon: 'text-danger-600',  value: 'text-danger-600'  },
  default: { bg: 'bg-gray-50',    icon: 'text-gray-500',    value: 'text-gray-900'    },
}

export default function MetricCard({ title, value, subtitle, icon: Icon, color = 'default', loading }: MetricCardProps) {
  const colors = colorMap[color]
  return (
    <div className="card p-5">
      {loading ? (
        <div className="space-y-2">
          <div className="skeleton h-4 w-20" />
          <div className="skeleton h-7 w-16" />
        </div>
      ) : (
        <div className="flex items-start justify-between">
          <div>
            <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-1">{title}</p>
            <p className={cn('text-2xl font-bold', colors.value)}>{value}</p>
            {subtitle && <p className="text-xs text-gray-400 mt-1">{subtitle}</p>}
          </div>
          {Icon && (
            <div className={cn('w-9 h-9 rounded-xl flex items-center justify-center', colors.bg)}>
              <Icon className={cn('w-5 h-5', colors.icon)} />
            </div>
          )}
        </div>
      )}
    </div>
  )
}
