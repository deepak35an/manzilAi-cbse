import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts'
import Card from '../ui/Card'

interface BatchAnalyticsProps {
  data: { batch: string; avgScore: number }[]
}

export default function BatchAnalytics({ data }: BatchAnalyticsProps) {
  return (
    <Card className="p-5">
      <h3 className="text-sm font-semibold text-gray-700 mb-4">Batch Performance</h3>
      <div className="h-64">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={data}>
            <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
            <XAxis dataKey="batch" tick={{ fontSize: 12 }} />
            <YAxis tick={{ fontSize: 12 }} />
            <Tooltip contentStyle={{ borderRadius: '8px', fontSize: '13px' }} />
            <Bar dataKey="avgScore" fill="#3b82f6" radius={[4, 4, 0, 0]} />
          </BarChart>
        </ResponsiveContainer>
      </div>
    </Card>
  )
}
