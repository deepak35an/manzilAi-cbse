import Card from '../ui/Card'
import Badge from '../ui/Badge'
import type { RoadmapItem } from '../../types/analytics'

interface RoadmapPanelProps { roadmap: RoadmapItem[] }

export default function RoadmapPanel({ roadmap }: RoadmapPanelProps) {
  return (
    <Card className="p-5">
      <h3 className="text-sm font-semibold text-gray-700 mb-4">Improvement Roadmap</h3>
      <div className="space-y-3">
        {roadmap.map((item, i) => (
          <div key={i} className="flex items-start gap-3 p-3 rounded-lg bg-gray-50">
            <div className="w-6 h-6 bg-primary-100 text-primary-700 rounded-full flex items-center justify-center text-xs font-bold flex-shrink-0">
              {i + 1}
            </div>
            <div className="flex-1">
              <div className="flex items-center gap-2 mb-1">
                <span className="font-medium text-sm text-gray-900">{item.skill}</span>
                <Badge variant={item.priority === 'high' ? 'error' : 'warning'}>{item.priority}</Badge>
              </div>
              <p className="text-sm text-gray-600">{item.suggestion}</p>
              <p className="text-xs text-gray-400 mt-1">Current score: {item.current_score.toFixed(1)}/10</p>
            </div>
          </div>
        ))}
        {roadmap.length === 0 && <p className="text-sm text-gray-400 text-center py-4">Great job! No improvements needed.</p>}
      </div>
    </Card>
  )
}
