import Card from '../ui/Card'
import { cn } from '../../lib/utils'
import type { LucideIcon } from 'lucide-react'

interface ScoreCardProps {
  title: string
  value: string | number
  subtitle?: string
  icon: LucideIcon
  trend?: 'up' | 'down' | 'neutral'
  className?: string
}

export default function ScoreCard({ title, value, subtitle, icon: Icon, trend, className }: ScoreCardProps) {
  return (
    <Card className={cn('p-5', className)}>
      <div className="flex items-start justify-between">
        <div>
          <p className="text-sm text-gray-500 font-medium">{title}</p>
          <p className="text-2xl font-bold text-gray-900 mt-1">{value}</p>
          {subtitle && (
            <p className={cn('text-xs mt-1', trend === 'up' ? 'text-green-600' : trend === 'down' ? 'text-red-600' : 'text-gray-400')}>
              {subtitle}
            </p>
          )}
        </div>
        <div className="p-2.5 bg-primary-50 rounded-xl">
          <Icon className="w-5 h-5 text-primary-600" />
        </div>
      </div>
    </Card>
  )
}
