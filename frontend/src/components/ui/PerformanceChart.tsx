import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Area, AreaChart } from 'recharts'

interface DataPoint {
  date?: string
  label?: string
  score?: number
  theta?: number
  [key: string]: unknown
}

interface PerformanceChartProps {
  data: DataPoint[]
  dataKey?: string
  title?: string
  color?: string
  height?: number
  type?: 'line' | 'area'
}

export default function PerformanceChart({
  data,
  dataKey = 'score',
  title,
  color = '#6366f1',
  height = 200,
  type = 'area',
}: PerformanceChartProps) {
  if (!data || data.length === 0) {
    return (
      <div style={{ height }} className="flex items-center justify-center">
        <p className="text-sm text-gray-400">No performance data yet</p>
      </div>
    )
  }

  const xKey = data[0]?.date ? 'date' : 'label'

  if (type === 'area') {
    return (
      <div>
        {title && <p className="text-sm font-semibold text-gray-700 mb-3">{title}</p>}
        <ResponsiveContainer width="100%" height={height}>
          <AreaChart data={data} margin={{ top: 5, right: 5, left: -20, bottom: 0 }}>
            <defs>
              <linearGradient id="grad" x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%" stopColor={color} stopOpacity={0.15} />
                <stop offset="95%" stopColor={color} stopOpacity={0} />
              </linearGradient>
            </defs>
            <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
            <XAxis dataKey={xKey} tick={{ fontSize: 11, fill: '#9ca3af' }} axisLine={true} tickLine={true} tickMargin={15} />
            <YAxis tick={{ fontSize: 11, fill: '#9ca3af' }} axisLine={true} tickLine={true} tickMargin={20} />
            <Tooltip
              contentStyle={{ borderRadius: '12px', border: '1px solid #e5e7eb', fontSize: 12 }}
              labelStyle={{ fontWeight: 600, color: '#374151' }}
            />
            <Area type="monotone" dataKey={dataKey} stroke={color} strokeWidth={2.5} fill="url(#grad)" dot={false} activeDot={{ r: 4, strokeWidth: 2 }} />
          </AreaChart>
        </ResponsiveContainer>
      </div>
    )
  }

  return (
    <div>
      {title && <p className="text-sm font-semibold text-gray-700 mb-3">{title}</p>}
      <ResponsiveContainer width="100%" height={height}>
        <LineChart data={data} margin={{ top: 5, right: 5, left: -20, bottom: 0 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
          <XAxis dataKey={xKey} tick={{ fontSize: 11, fill: '#9ca3af' }} axisLine={true} tickLine={true} tickMargin={15} />
          <YAxis tick={{ fontSize: 11, fill: '#9ca3af' }} axisLine={true} tickLine={true} tickMargin={20} />
          <Tooltip contentStyle={{ borderRadius: '12px', border: '1px solid #e5e7eb', fontSize: 12 }} />
          <Line type="monotone" dataKey={dataKey} stroke={color} strokeWidth={2.5} dot={false} activeDot={{ r: 4 }} />
        </LineChart>
      </ResponsiveContainer>
    </div>
  )
}
