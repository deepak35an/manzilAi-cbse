import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts'
import Card from '../ui/Card'

interface SkillGapChartProps {
  data: { topic: string; gap: number }[]
}

export default function SkillGapChart({ data }: SkillGapChartProps) {
  return (
    <Card className="p-5">
      <h3 className="text-sm font-semibold text-gray-700 mb-4">Skill Gaps</h3>
      <div className="h-64">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={data} layout="vertical">
            <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
            <XAxis type="number" tick={{ fontSize: 12 }} />
            <YAxis type="category" dataKey="topic" tick={{ fontSize: 11 }} width={100} />
            <Tooltip contentStyle={{ borderRadius: '8px', fontSize: '13px' }} />
            <Bar dataKey="gap" fill="#ef4444" radius={[0, 4, 4, 0]} />
          </BarChart>
        </ResponsiveContainer>
      </div>
    </Card>
  )
}
