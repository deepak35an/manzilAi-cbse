import { AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts'
import Card from '../ui/Card'
import type { WeeklyActiveUser } from '../../services/orgApi'

interface Props {
  data: WeeklyActiveUser[]
}

export default function WeeklyActiveUsersChart({ data }: Props) {
  return (
    <Card className="p-5">
      <h3 className="text-sm font-semibold text-gray-700 mb-1">Active Users (Last 7 Days)</h3>
      <p className="text-xs text-gray-400 mb-4">Daily active students who took at least one test</p>
      <div className="h-64">
        <ResponsiveContainer width="100%" height="100%">
          <AreaChart data={data}>
            <defs>
              <linearGradient id="wauGradient" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="#6366f1" stopOpacity={0.3} />
                <stop offset="100%" stopColor="#6366f1" stopOpacity={0.02} />
              </linearGradient>
            </defs>
            <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" vertical={false} />
            <XAxis
              dataKey="week"
              tick={{ fontSize: 11, fill: '#64748b' }}
              axisLine={{ stroke: '#e2e8f0' }}
              tickLine={false}
            />
            <YAxis
              tick={{ fontSize: 11, fill: '#64748b' }}
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
              formatter={(value: number) => [value, 'Active Students']}
            />
            <Area
              type="monotone"
              dataKey="active_users"
              stroke="#6366f1"
              strokeWidth={2.5}
              fill="url(#wauGradient)"
              dot={{ r: 4, fill: '#6366f1', strokeWidth: 2, stroke: '#fff' }}
              activeDot={{ r: 6, strokeWidth: 2, fill: '#4f46e5', stroke: '#fff' }}
              name="Active Users"
            />
          </AreaChart>
        </ResponsiveContainer>
      </div>
    </Card>
  )
}
