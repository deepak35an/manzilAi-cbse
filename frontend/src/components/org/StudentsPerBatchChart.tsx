import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Cell } from 'recharts'
import Card from '../ui/Card'
import type { BatchCount } from '../../services/orgApi'

const COLORS = ['#8b5cf6', '#8b5cf6', '#8b5cf6']

interface Props {
  data: BatchCount[]
}

export default function StudentsPerBatchChart({ data }: Props) {
  return (
    <Card className="p-5">
      <h3 className="text-sm font-semibold text-gray-700 mb-1">Students Per Batch</h3>
      <p className="text-xs text-gray-400 mb-4">Enrolled students by plan duration</p>
      <div className="h-64">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={data} barSize={40}>
            <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" vertical={false} />
            <XAxis
              dataKey="batch"
              tick={{ fontSize: 12, fill: '#64748b' }}
              axisLine={{ stroke: '#e2e8f0' }}
              tickLine={false}
            />
            <YAxis
              tick={{ fontSize: 12, fill: '#64748b' }}
              axisLine={false}
              tickLine={false}
              allowDecimals={false}
            />
            <Tooltip
              contentStyle={{
                borderRadius: '12px',
                fontSize: '13px',
                border: '1px solid #e2e8f0',
                boxShadow: '0 4px 12px rgba(0,0,0,0.08)',
              }}
              formatter={(value: number) => [value, 'Students']}
            />
            <Bar dataKey="count" radius={[6, 6, 0, 0]} name="Students">
              {data.map((_, i) => (
                <Cell key={i} fill={COLORS[i % COLORS.length]} />
              ))}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </div>
    </Card>
  )
}
