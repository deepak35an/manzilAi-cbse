import { useParams, Link } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { getOrgStudentPerformanceReport } from '@/services/orgApi'
import { ArrowLeft, TrendingUp, TrendingDown, Minus } from 'lucide-react'
import { cn } from '@/lib/utils'

export default function StudentTopicBreakdown() {
  const { studentId } = useParams<{ studentId: string }>()

  const { data: report, isLoading } = useQuery({
    queryKey: ['org-student-performance-report', studentId],
    queryFn: () => getOrgStudentPerformanceReport(studentId!),
    enabled: !!studentId,
  })

  type TopicEntry = { topic: string; subject: string; avg_score: number; attempts: number; level: 'strong' | 'moderate' | 'weak' }
  const grouped: Record<string, TopicEntry[]> = {}
  for (const t of (report?.all_topics ?? []) as TopicEntry[]) {
    if (!grouped[t.subject]) grouped[t.subject] = []
    grouped[t.subject].push(t)
  }

  if (isLoading) {
    return (
      <div className="space-y-4 animate-pulse">
        {[1,2,3].map((i) => <div key={i} className="skeleton h-24" />)}
      </div>
    )
  }

  const LevelIcon = ({ level }: { level: 'strong' | 'moderate' | 'weak' }) =>
    level === 'strong' ? <TrendingUp className="w-4 h-4 text-success-600" />
    : level === 'weak' ? <TrendingDown className="w-4 h-4 text-danger-600" />
    : <Minus className="w-4 h-4 text-warning-600" />

  const levelBadge = (level: 'strong' | 'moderate' | 'weak') =>
    level === 'strong' ? 'badge-success'
    : level === 'weak' ? 'badge-danger'
    : 'badge-warning'

  return (
    <div className="space-y-6 animate-fade-in">
      <div className="flex items-center gap-3">
        <Link to={`/org/student/${studentId}`} className="btn-outline btn-sm p-2">
          <ArrowLeft className="w-4 h-4" />
        </Link>
        <div>
          <h1 className="text-xl font-bold text-gray-900">Topic Breakdown</h1>
          <p className="text-sm text-gray-500 mt-0.5">Detailed view across all subjects</p>
        </div>
      </div>

      {Object.keys(grouped).length === 0 ? (
        <div className="card p-10 text-center">
          <p className="text-gray-400">No topic data available yet for this student.</p>
        </div>
      ) : (
        Object.entries(grouped).map(([subject, topics]) => (
          <div key={subject} className="card overflow-hidden">
            <div className="px-5 py-3 bg-gray-50 border-b border-gray-100">
              <p className="font-semibold text-sm text-gray-700">{subject}</p>
            </div>
            <div className="divide-y divide-gray-50">
              {[...topics].sort((a: TopicEntry, b: TopicEntry) => b.avg_score - a.avg_score).map((t: TopicEntry) => {
                const pct = Math.max(0, Math.min(100, Math.round(t.avg_score * 10)))
                return (
                  <div key={t.topic} className="px-5 py-3 flex items-center gap-3">
                    <LevelIcon level={t.level} />
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center justify-between mb-1">
                        <p className="text-sm font-medium text-gray-900 truncate">{t.topic}</p>
                        <div className="flex items-center gap-2 shrink-0 ml-4">
                          <span className={cn('badge', levelBadge(t.level))}>{t.level}</span>
                          <span className="text-xs text-gray-400">{t.attempts} questions</span>
                        </div>
                      </div>
                      <div className="flex items-center gap-2">
                        <div className="flex-1 h-1.5 bg-gray-100 rounded-full overflow-hidden">
                          <div
                            className={cn(
                              'h-full rounded-full transition-all',
                              t.level === 'strong' ? 'bg-success-500' :
                              t.level === 'weak' ? 'bg-danger-500' :
                              'bg-warning-500'
                            )}
                            style={{ width: `${pct}%` }}
                          />
                        </div>
                        <span className="text-xs text-gray-500 w-10 text-right">{pct}%</span>
                      </div>
                    </div>
                  </div>
                )
              })}
            </div>
          </div>
        ))
      )}
    </div>
  )
}
