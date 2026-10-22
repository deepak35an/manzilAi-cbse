import { useState, useCallback } from 'react'
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend } from 'recharts'
import Card from '../ui/Card'
import type { ScoreDistBucket } from '../../services/orgApi'

const LINE_CONFIG = [
  { key: '3_months', label: '3 Months', color: '#f97316', dash: undefined },
  { key: '6_months', label: '6 Months', color: '#8b5cf6', dash: undefined },
  { key: '9_months', label: '9 Months', color: '#10b981', dash: undefined },
  { key: '12_months', label: '12 Months', color: '#06b6d4', dash: undefined },
] as const

interface Props {
  data: ScoreDistBucket[]
}

export default function ScoreDistributionChart({ data }: Props) {
  const [activeKey, setActiveKey] = useState<string | null>(null)

  const handleMouseEnter = useCallback((key: string) => {
    setActiveKey(key)
  }, [])

  const handleMouseLeave = useCallback(() => {
    setActiveKey(null)
  }, [])

  return (
    <Card className="p-5">
      <h3 className="text-sm font-semibold text-gray-700 mb-1">Average Score Distribution</h3>
      <p className="text-xs text-gray-400 mb-4">Student count by marks range, broken down by batch duration</p>
      <div className="h-72">
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={data}>
            <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" vertical={false} />
            <XAxis
              dataKey="marks"
              interval={0}
              tick={{ fontSize: 11, fill: '#64748b' }}
              axisLine={{ stroke: '#e2e8f0' }}
              tickLine={false}
              label={{ value: 'Marks', position: 'insideBottom', offset: -5, style: { fontSize: 12, fill: '#94a3b8' } }}
            />
            <YAxis
              tick={{ fontSize: 11, fill: '#64748b' }}
              axisLine={false}
              tickLine={false}
              allowDecimals={false}
              label={{ value: 'Students', angle: -90, position: 'insideLeft', style: { fontSize: 12, fill: '#94a3b8' } }}
            />
            <Tooltip
              contentStyle={{
                borderRadius: '12px',
                fontSize: '13px',
                border: '1px solid #e2e8f0',
                boxShadow: '0 4px 12px rgba(0,0,0,0.08)',
              }}
            />
            <Legend
              wrapperStyle={{ fontSize: '12px', paddingTop: '8px' }}
              onMouseEnter={(e) => handleMouseEnter(e.dataKey as string)}
              onMouseLeave={handleMouseLeave}
            />
            {/* Actual visual lines */}
            {LINE_CONFIG.map(({ key, label, color, dash }) => (
              <Line
                key={key}
                type="monotone"
                dataKey={key}
                name={label}
                stroke={color}
                strokeWidth={activeKey === key ? 3.5 : activeKey ? 1 : 2.5}
                strokeDasharray={dash}
                dot={{ r: 3 }}
                activeDot={{ r: 6, strokeWidth: 2, fill: '#fff' }}
                opacity={activeKey && activeKey !== key ? 0.2 : 1}
                style={{ transition: 'opacity 0.3s ease, stroke-width 0.3s ease' }}
              />
            ))}
          </LineChart>
        </ResponsiveContainer>
      </div>
    </Card>
  )
}
