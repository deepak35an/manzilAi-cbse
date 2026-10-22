import { ScatterChart, Scatter, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Cell, ZAxis } from 'recharts'
import Card from '../ui/Card'

interface ThetaChartProps {
  data: { date: string; theta: number; exam: string }[]
  title?: string
}

const COLORS = ['#2563eb', '#7c3aed', '#db2777', '#ea580c', '#16a34a']

export default function ThetaChart({ data, title = 'Level-wise Performance Comparison' }: ThetaChartProps) {
  // 1. Normalize and Sort Data
  const normalizedData = data.map(d => ({ 
    ...d, 
    exam: d.exam?.trim() || 'General Assessment' 
  }))
  
  // 2. Identify Unique Exams for Columns
  const uniqueExams = Array.from(new Set(normalizedData.map(d => d.exam))).sort()
  
  // 3. Map Data to Index-based X Coordinates
  const attemptCounts: Record<string, number> = {}
  const chartData = normalizedData
    .sort((a, b) => a.date.localeCompare(b.date)) // Sort chronologically for attempt numbering
    .map(item => {
      attemptCounts[item.exam] = (attemptCounts[item.exam] || 0) + 1
      return { 
        ...item, 
        x: uniqueExams.indexOf(item.exam), 
        attempt: attemptCounts[item.exam] 
      }
    })

  return (
    <Card className="p-5">
      <div className="flex items-center justify-between mb-8">
        <div className="space-y-1">
          <h3 className="text-sm font-bold text-gray-800">{title}</h3>
          <p className="text-[10px] text-gray-400">Vertical pillars represent identical tests. Higher dots = improved ability.</p>
        </div>
        <div className="flex flex-col items-end gap-1">
           <div className="flex items-center gap-1.5"><div className="w-2.5 h-2.5 rounded-full bg-[#2563eb]"></div><span className="text-[10px] text-gray-500">First Try</span></div>
           <div className="flex items-center gap-1.5"><div className="w-2.5 h-2.5 rounded-full bg-[#7c3aed]"></div><span className="text-[10px] text-gray-500">Repeats</span></div>
        </div>
      </div>
      <div className="h-72">
        <ResponsiveContainer width="100%" height="100%">
          <ScatterChart margin={{ top: 10, right: 30, bottom: 60, left: 0 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="#f9fafb" vertical={true} horizontal={true} />
            <XAxis 
              type="number"
              dataKey="x" 
              name="Exam"
              ticks={uniqueExams.map((_, i) => i)}
              tickFormatter={(idx) => {
                const label = uniqueExams[idx] || ''
                return label.length > 15 ? label.substring(0, 12) + '...' : label
              }}
              domain={[-0.5, uniqueExams.length - 0.5]}
              tick={{ fontSize: 10, fontWeight: 500, fill: '#6b7280' }} 
              stroke="#e5e7eb"
              interval={0}
            />
            <YAxis 
              type="number" 
              dataKey="theta" 
              name="Theta" 
              domain={['auto', 'auto']}
              tick={{ fontSize: 11, fill: '#6b7280' }} 
              stroke="#e5e7eb"
              label={{ value: 'Ability index', angle: -90, position: 'insideLeft', offset: 15, fontSize: 10, fill: '#9ca3af' }}
            />
            <ZAxis type="number" range={[120, 120]} />
            <Tooltip 
              cursor={{ stroke: '#f3f4f6', strokeWidth: 40 }} // Visual column highlight
              content={({ active, payload }) => {
                if (active && payload && payload.length) {
                  const d = payload[0].payload
                  return (
                    <div className="bg-white p-3 border border-indigo-100 rounded-xl shadow-xl text-xs">
                      <p className="font-bold text-indigo-900 mb-2 border-b border-indigo-50 pb-1">{d.exam}</p>
                      <div className="space-y-1.5">
                        <div className="flex justify-between gap-4">
                          <span className="text-gray-400">Date:</span>
                          <span className="font-medium text-gray-700">{d.date}</span>
                        </div>
                        <div className="flex justify-between gap-4">
                          <span className="text-gray-400">Sequence:</span>
                          <span className="font-bold text-indigo-600">Attempt #{d.attempt}</span>
                        </div>
                        <div className="flex justify-between items-center pt-1 mt-1 border-t border-gray-50">
                          <span className="text-gray-400">Ability Index:</span>
                          <span className="text-sm font-black text-indigo-700">{d.theta.toFixed(4)}</span>
                        </div>
                      </div>
                    </div>
                  )
                }
                return null
              }}
            />
            <Scatter name="Tests" data={chartData}>
              {chartData.map((entry, index) => (
                <Cell 
                  key={`cell-${index}`} 
                  fill={COLORS[Math.min(entry.attempt - 1, COLORS.length - 1)]}
                  stroke="#fff"
                  strokeWidth={2}
                />
              ))}
            </Scatter>
          </ScatterChart>
        </ResponsiveContainer>
      </div>
    </Card>
  )
}
