import Card from '../ui/Card'
import ConfidenceGauge from '../analytics/ConfidenceGauge'
import TopicRadar from '../analytics/TopicRadar'
import type { JobReport } from '../../types/analytics'

interface ReadinessReportProps { report: JobReport }

export default function ReadinessReport({ report }: ReadinessReportProps) {
  const radarData = Object.entries(report.skill_scores).map(([topic, score]) => ({ topic, score }))

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <ConfidenceGauge value={report.readiness_percentage / 100} label="Job Readiness" />
        <ConfidenceGauge value={report.overall_score / 10} label="Overall Score" />
        <Card className="p-5">
          <p className="text-sm text-gray-500 mb-1">AI Assessment</p>
          <p className="text-sm text-gray-700 line-clamp-6">{report.ai_summary || 'No summary available'}</p>
        </Card>
      </div>
      <TopicRadar data={radarData} title="Skill-wise Breakdown" />
    </div>
  )
}
