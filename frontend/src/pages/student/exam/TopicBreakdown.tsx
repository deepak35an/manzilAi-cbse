import { useState } from 'react'
import { useParams, Link } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { getPerformanceReport, getStudentDashboard } from '@/services/studentApi'
import { ArrowLeft, TrendingUp, TrendingDown, Minus, ChevronDown, BookOpen } from 'lucide-react'
import { STUDENT_ROUTES } from '@/lib/constants'
import { cn } from '@/lib/utils'

type TopicEntry = {
  topic: string
  subject: string
  avg_score: number
  attempts: number
  level: 'strong' | 'moderate' | 'weak'
}

type SubjectSummary = {
  subjectName: string
  topics: TopicEntry[]
  totalAttempts: number
  avgScore: number
  avgPct: number
}

export default function TopicBreakdown() {
  const { id: planId } = useParams<{ id: string }>()
  const [selectedSubjectFilter, setSelectedSubjectFilter] = useState<string>('')

  // 1. Dashboard metadata (gives list of all enrolled subjects in journey)
  const { data: dashData } = useQuery({
    queryKey: ['dashboard', planId],
    queryFn: () => getStudentDashboard(planId!),
    enabled: !!planId,
  })

  // 2. Journey-level performance report across all enrolled subjects (subject_only = false)
  const { data: report, isLoading: isReportLoading } = useQuery({
    queryKey: ['performance-report', planId],
    queryFn: () => getPerformanceReport(planId, false),
    enabled: !!planId,
  })

  const isCuet = dashData?.is_cuet || dashData?.exam_name?.startsWith('CUET')
  const cuetSubjects: { plan_id: string; exam: string; label: string }[] = dashData?.cuet_subjects || []

  // Group topics by subject name
  const grouped: Record<string, TopicEntry[]> = {}
  for (const t of (report?.all_topics ?? []) as TopicEntry[]) {
    const subjKey = t.subject || 'General'
    if (!grouped[subjKey]) grouped[subjKey] = []
    grouped[subjKey].push(t)
  }

  // Build complete list of enrolled subjects to ensure all enrolled subjects appear
  const enrolledSubjectNames: string[] = []

  if (isCuet && cuetSubjects.length > 0) {
    for (const cs of cuetSubjects) {
      if (!enrolledSubjectNames.includes(cs.label)) {
        enrolledSubjectNames.push(cs.label)
      }
    }
  } else if (dashData?.exam_name) {
    enrolledSubjectNames.push(dashData.exam_name)
  }

  // Include any extra subjects returned in performance data
  for (const sName of Object.keys(grouped)) {
    if (!enrolledSubjectNames.includes(sName)) {
      enrolledSubjectNames.push(sName)
    }
  }

  // Calculate subject-level summaries with average marks
  const subjectSummaries: SubjectSummary[] = enrolledSubjectNames.map((subjName) => {
    const topics = grouped[subjName] || []
    const totalAttempts = topics.reduce((acc, curr) => acc + curr.attempts, 0)

    let avgScore = 0
    let avgPct = 0

    if (totalAttempts > 0) {
      const totalWeightedScore = topics.reduce((acc, curr) => acc + curr.avg_score * curr.attempts, 0)
      avgScore = totalWeightedScore / totalAttempts
      avgPct = Math.max(0, Math.min(100, Math.round(avgScore * 10)))
    }

    return {
      subjectName: subjName,
      topics,
      totalAttempts,
      avgScore: Math.round(avgScore * 10) / 10,
      avgPct,
    }
  })

  const filteredSummaries = selectedSubjectFilter
    ? subjectSummaries.filter((s) => s.subjectName === selectedSubjectFilter)
    : subjectSummaries

  if (isReportLoading) {
    return (
      <div className="space-y-4 animate-pulse">
        {[1, 2, 3].map((i) => (
          <div key={i} className="skeleton h-28 rounded-2xl" />
        ))}
      </div>
    )
  }

  const LevelIcon = ({ level }: { level: 'strong' | 'moderate' | 'weak' }) =>
    level === 'strong' ? (
      <TrendingUp className="w-4 h-4 text-success-600" />
    ) : level === 'weak' ? (
      <TrendingDown className="w-4 h-4 text-danger-600" />
    ) : (
      <Minus className="w-4 h-4 text-warning-600" />
    )

  const levelBadge = (level: 'strong' | 'moderate' | 'weak') =>
    level === 'strong'
      ? 'badge-success'
      : level === 'weak'
      ? 'badge-danger'
      : 'badge-warning'

  return (
    <div className="space-y-6 animate-fade-in">
      {/* Page Header & Filter */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div className="flex items-center gap-3">
          <Link to={STUDENT_ROUTES.strengthWeakness(planId!)} className="btn-outline btn-sm p-2">
            <ArrowLeft className="w-4 h-4" />
          </Link>
          <div>
            <h1 className="text-xl font-bold text-gray-900">Topic Breakdown</h1>
            <p className="text-sm text-gray-500 mt-0.5">Detailed view across all enrolled subjects</p>
          </div>
        </div>

        {enrolledSubjectNames.length > 1 && (
          <div className="relative shrink-0">
            <select
              value={selectedSubjectFilter}
              onChange={(e) => setSelectedSubjectFilter(e.target.value)}
              className="appearance-none border border-gray-200 rounded-xl px-4 py-2 text-sm font-semibold text-gray-800 bg-white focus:outline-none focus:ring-2 focus:ring-primary-300 pr-9 cursor-pointer shadow-sm"
            >
              <option value="">All Subjects ({enrolledSubjectNames.length})</option>
              {enrolledSubjectNames.map((s) => (
                <option key={s} value={s}>
                  {s}
                </option>
              ))}
            </select>
            <ChevronDown className="w-4 h-4 text-gray-400 absolute right-3 top-3 pointer-events-none" />
          </div>
        )}
      </div>

      {/* Subject Breakdown Cards */}
      {filteredSummaries.length === 0 ? (
        <div className="card p-10 text-center">
          <p className="text-gray-400">No subject data available for this selection.</p>
        </div>
      ) : (
        filteredSummaries.map((subj) => (
          <div key={subj.subjectName} className="card overflow-hidden border border-gray-200/80 shadow-sm">
            {/* Subject Header with Average Marks & Attempts */}
            <div className="px-5 py-4 bg-gray-50/80 border-b border-gray-100 flex flex-col sm:flex-row sm:items-center justify-between gap-2">
              <div className="flex items-center gap-2.5">
                <div className="p-2 rounded-lg bg-primary-50 text-primary-600">
                  <BookOpen className="w-4 h-4" />
                </div>
                <div>
                  <h3 className="font-bold text-base text-gray-900">{subj.subjectName}</h3>
                  <p className="text-xs text-gray-500 mt-0.5">
                    {subj.totalAttempts > 0
                      ? `${subj.totalAttempts} total questions attempted across ${subj.topics.length} topic(s)`
                      : 'Enrolled Subject'}
                  </p>
                </div>
              </div>

              {subj.totalAttempts > 0 ? (
                <div className="flex items-center gap-3">
                  <span className="text-xs text-gray-500 font-medium uppercase tracking-wider">
                    Average Marks:
                  </span>
                  <span
                    className={cn(
                      'px-3 py-1 rounded-full text-xs font-bold shadow-xs',
                      subj.avgPct >= 70
                        ? 'bg-success-100 text-success-800 border border-success-200'
                        : subj.avgPct >= 50
                        ? 'bg-warning-100 text-warning-800 border border-warning-200'
                        : 'bg-danger-100 text-danger-800 border border-danger-200'
                    )}
                  >
                    {subj.avgScore} / 10 ({subj.avgPct}%)
                  </span>
                </div>
              ) : (
                <span className="px-3 py-1 rounded-full text-xs font-semibold bg-gray-100 text-gray-500 border border-gray-200">
                  No tests attempted yet
                </span>
              )}
            </div>

            {/* Topics List under Subject */}
            {subj.topics.length === 0 ? (
              <div className="p-6 text-center text-sm text-gray-400 bg-white">
                No evaluations recorded for {subj.subjectName} yet. Take a test to see your topic performance.
              </div>
            ) : (
              <div className="divide-y divide-gray-50 bg-white">
                {[...subj.topics]
                  .sort((a, b) => b.avg_score - a.avg_score)
                  .map((t) => {
                    const pct = Math.max(0, Math.min(100, Math.round(t.avg_score * 10)))
                    return (
                      <div key={t.topic} className="px-5 py-3.5 flex items-center gap-3 hover:bg-gray-50/50 transition-colors">
                        <LevelIcon level={t.level} />
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center justify-between mb-1.5">
                            <p className="text-sm font-medium text-gray-900 truncate">{t.topic}</p>
                            <div className="flex items-center gap-2.5 shrink-0 ml-4">
                              <span className={cn('badge', levelBadge(t.level))}>{t.level}</span>
                              <span className="text-xs text-gray-400 font-medium">{t.attempts} questions</span>
                            </div>
                          </div>
                          <div className="flex items-center gap-3">
                            <div className="flex-1 h-2 bg-gray-100 rounded-full overflow-hidden">
                              <div
                                className={cn(
                                  'h-full rounded-full transition-all duration-300',
                                  t.level === 'strong'
                                    ? 'bg-success-500'
                                    : t.level === 'weak'
                                    ? 'bg-danger-500'
                                    : 'bg-warning-500'
                                )}
                                style={{ width: `${pct}%` }}
                              />
                            </div>
                            <span className="text-xs font-semibold text-gray-600 w-12 text-right">
                              {t.avg_score}/10 ({pct}%)
                            </span>
                          </div>
                        </div>
                      </div>
                    )
                  })}
              </div>
            )}
          </div>
        ))
      )}
    </div>
  )
}

