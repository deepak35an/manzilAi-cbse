import Card from '../ui/Card'

interface ConfidenceGaugeProps {
  value: number
  label?: string
}

export default function ConfidenceGauge({ value, label = 'Confidence' }: ConfidenceGaugeProps) {
  const pct = Math.min(100, Math.max(0, value * 100))
  const color = pct >= 70 ? '#16a34a' : pct >= 40 ? '#eab308' : '#dc2626'

  return (
    <Card className="p-5 text-center">
      <div className="relative w-24 h-24 mx-auto mb-3">
        <svg viewBox="0 0 36 36" className="w-full h-full">
          <path d="M18 2.0845 a 15.9155 15.9155 0 0 1 0 31.831 a 15.9155 15.9155 0 0 1 0 -31.831" fill="none" stroke="#e5e7eb" strokeWidth="3" />
          <path d="M18 2.0845 a 15.9155 15.9155 0 0 1 0 31.831 a 15.9155 15.9155 0 0 1 0 -31.831"
            fill="none" stroke={color} strokeWidth="3" strokeDasharray={`${pct}, 100`} strokeLinecap="round" />
        </svg>
        <div className="absolute inset-0 flex items-center justify-center">
          <span className="text-lg font-bold" style={{ color }}>{pct.toFixed(0)}%</span>
        </div>
      </div>
      <p className="text-sm text-gray-500">{label}</p>
    </Card>
  )
}
