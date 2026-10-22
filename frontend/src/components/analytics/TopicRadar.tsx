import { RadarChart, PolarGrid, PolarAngleAxis, PolarRadiusAxis, Radar, ResponsiveContainer } from 'recharts'
import Card from '../ui/Card'

interface TopicRadarProps {
  data: { topic: string; score: number }[]
  title?: string
}

export default function TopicRadar({ data, title = 'Topic Strengths' }: TopicRadarProps) {
  return (
    <Card className="p-5">
      <h3 className="text-sm font-semibold text-gray-700 mb-4">{title}</h3>
      <div className="h-64">
        <ResponsiveContainer width="100%" height="100%">
          <RadarChart data={data}>
            <PolarGrid stroke="#e5e7eb" />
            <PolarAngleAxis dataKey="topic" tick={{ fontSize: 11 }} />
            <PolarRadiusAxis tick={{ fontSize: 10 }} />
            <Radar dataKey="score" stroke="#2563eb" fill="#3b82f6" fillOpacity={0.3} />
          </RadarChart>
        </ResponsiveContainer>
      </div>
    </Card>
  )
}
