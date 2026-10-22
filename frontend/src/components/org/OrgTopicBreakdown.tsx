import { useQuery } from '@tanstack/react-query'
import { Link } from 'react-router-dom'
import { TrendingUp, TrendingDown, Minus, Users, BookOpen, ArrowRight } from 'lucide-react'
import { getOrgTopicBreakdown, OrgTopicItem } from '../../services/orgApi'
import { cn } from '../../lib/utils'

interface OrgTopicBreakdownProps {
  exam?: string
  compact?: boolean
  hideHeader?: boolean
}

export default function OrgTopicBreakdown({ exam, compact = false, hideHeader = false }: OrgTopicBreakdownProps) {
  const { data, isLoading } = useQuery({
    queryKey: ['org-topic-breakdown', exam],
    queryFn: () => getOrgTopicBreakdown(exam),
  })

  if (isLoading) {
    return (
      <div className="space-y-4 animate-pulse">
        <div className="h-6 w-48 bg-gray-200 rounded" />
        {compact ? (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="h-40 bg-gray-100 rounded-xl" />
            <div className="h-40 bg-gray-100 rounded-xl" />
          </div>
        ) : (
          <div className="h-48 bg-gray-100 rounded-xl" />
        )}
      </div>
    )
  }

  const allTopics = data?.all_topics || []
  const strengths = data?.strengths || []
  const weaknesses = data?.weaknesses || []

  // Group topics by subject
  const grouped: Record<string, OrgTopicItem[]> = {}
  for (const t of allTopics) {
    const subj = t.subject || 'General'
    if (!grouped[subj]) grouped[subj] = []
    grouped[subj].push(t)
  }

  const LevelIcon = ({ level }: { level: 'strong' | 'moderate' | 'weak' }) =>
    level === 'strong' ? (
      <TrendingUp className="w-4 h-4 text-emerald-600 shrink-0" />
    ) : level === 'weak' ? (
      <TrendingDown className="w-4 h-4 text-red-600 shrink-0" />
    ) : (
      <Minus className="w-4 h-4 text-amber-600 shrink-0" />
    )

  const levelBadge = (level: 'strong' | 'moderate' | 'weak') => {
    switch (level) {
      case 'strong':
        return 'bg-emerald-50 text-emerald-700 border-emerald-200'
      case 'weak':
        return 'bg-red-50 text-red-700 border-red-200'
      case 'moderate':
      default:
        return 'bg-amber-50 text-amber-700 border-amber-200'
    }
  }

  return (
    <div className="space-y-6 pt-2">
      {!hideHeader && (
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-xl font-bold text-gray-900 flex items-center gap-2">
              <BookOpen className="w-5 h-5 text-primary-600" />
              {compact ? 'Organization Topic Summary' : 'Detailed Subject Breakdown'}
            </h2>
            <p className="text-sm text-gray-500 mt-0.5">
              Aggregated proficiency across all students {exam ? `preparing for ${exam.replace(/_/g, ' ')}` : ''}
            </p>
          </div>
          {data && data.total_students_with_data > 0 && (
            <div className="flex items-center gap-1.5 px-3 py-1 bg-gray-100 text-gray-700 rounded-full text-xs font-semibold">
              <Users className="w-3.5 h-3.5" />
              <span>{data.total_students_with_data} student{data.total_students_with_data > 1 ? 's' : ''} evaluated</span>
            </div>
          )}
        </div>
      )}

      {allTopics.length === 0 ? (
        <div className="bg-white rounded-2xl border border-gray-100 p-10 text-center text-gray-400 space-y-2">
          <BookOpen className="w-8 h-8 mx-auto text-gray-300" />
          <p className="text-base font-medium text-gray-600">No topic performance data available yet</p>
          <p className="text-xs text-gray-400 max-w-md mx-auto">
            Once students start completing tests under this exam, subject-wise topic proficiency will appear here.
          </p>
        </div>
      ) : compact ? (
        /* ── COMPACT MODE (DASHBOARD): Strengths & Weaknesses Cards + Button ──── */
        <>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {/* Top Strengths */}
            <div className="bg-gradient-to-br from-emerald-50/60 to-white border border-emerald-100 rounded-2xl p-5 shadow-sm">
              <div className="flex items-center gap-2 mb-3">
                <div className="w-8 h-8 rounded-xl bg-emerald-100 flex items-center justify-center text-emerald-700">
                  <TrendingUp className="w-4 h-4" />
                </div>
                <div>
                  <h3 className="text-sm font-bold text-gray-900">Key Strengths</h3>
                  <p className="text-xs text-gray-500">Highest performing topics overall</p>
                </div>
              </div>
              {strengths.length === 0 ? (
                <p className="text-xs text-gray-400 italic py-2">No strong topics recorded yet.</p>
              ) : (
                <div className="space-y-2">
                  {strengths.map((s) => (
                    <div key={s.topic} className="flex items-center justify-between p-2.5 bg-white rounded-xl border border-emerald-100/60 text-xs">
                      <span className="font-medium text-gray-800 truncate">{s.topic}</span>
                      <div className="flex items-center gap-2 shrink-0">
                        <span className="text-emerald-700 font-bold">{Math.round(s.avg_score * 10)}%</span>
                        <span className="text-[10px] text-gray-400">({s.student_count} student{s.student_count > 1 ? 's' : ''})</span>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Top Weaknesses */}
            <div className="bg-gradient-to-br from-red-50/60 to-white border border-red-100 rounded-2xl p-5 shadow-sm">
              <div className="flex items-center gap-2 mb-3">
                <div className="w-8 h-8 rounded-xl bg-red-100 flex items-center justify-center text-red-700">
                  <TrendingDown className="w-4 h-4" />
                </div>
                <div>
                  <h3 className="text-sm font-bold text-gray-900">Topics Needing Focus</h3>
                  <p className="text-xs text-gray-500">Lowest performing topics needing revision</p>
                </div>
              </div>
              {weaknesses.length === 0 ? (
                <p className="text-xs text-gray-400 italic py-2">No weak topics recorded yet.</p>
              ) : (
                <div className="space-y-2">
                  {weaknesses.map((w) => (
                    <div key={w.topic} className="flex items-center justify-between p-2.5 bg-white rounded-xl border border-red-100/60 text-xs">
                      <span className="font-medium text-gray-800 truncate">{w.topic}</span>
                      <div className="flex items-center gap-2 shrink-0">
                        <span className="text-red-700 font-bold">{Math.round(w.avg_score * 10)}%</span>
                        <span className="text-[10px] text-gray-400">({w.student_count} student{w.student_count > 1 ? 's' : ''})</span>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>

          <div className="pt-2 text-center">
            <Link
              to={`/org/detail-topic-breakdown${exam ? `?exam=${encodeURIComponent(exam)}` : ''}`}
              className="inline-flex items-center justify-center gap-2 px-6 py-3 bg-primary-600 hover:bg-primary-700 text-white text-sm font-semibold rounded-xl transition-all shadow-sm hover:shadow"
            >
              <BookOpen className="w-4 h-4" />
              View Detailed Subject Breakdown
              <ArrowRight className="w-4 h-4 ml-1" />
            </Link>
          </div>
        </>
      ) : (
        /* ── DETAILED MODE (DETAILED BREAKDOWN PAGE): ONLY Subject-Grouped Topic Tables ──── */
        <div className="space-y-4 pt-1">
          {Object.entries(grouped).map(([subject, topics]) => (
            <div key={subject} className="bg-white rounded-2xl border border-gray-100 overflow-hidden shadow-sm">
              <div className="px-5 py-3.5 bg-gray-50/80 border-b border-gray-100 flex items-center justify-between">
                <span className="font-bold text-sm text-gray-800">{subject}</span>
                <span className="text-xs font-semibold text-gray-400">{topics.length} topic{topics.length > 1 ? 's' : ''}</span>
              </div>
              <div className="divide-y divide-gray-50">
                {[...topics]
                  .sort((a, b) => b.avg_score - a.avg_score)
                  .map((t) => {
                    const pct = Math.max(0, Math.min(100, Math.round(t.avg_score * 10)))
                    return (
                      <div key={t.topic} className="px-5 py-3.5 flex items-center gap-3.5 hover:bg-gray-50/50 transition-colors">
                        <LevelIcon level={t.level} />
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center justify-between mb-1.5">
                            <span className="text-sm font-semibold text-gray-900 truncate">{t.topic}</span>
                            <div className="flex items-center gap-2.5 shrink-0 ml-4">
                              <span className={cn('px-2 py-0.5 rounded-full text-[11px] font-semibold border capitalize', levelBadge(t.level))}>
                                {t.level}
                              </span>
                              <span className="text-xs text-gray-400 hidden sm:inline">
                                {t.attempts} Qs ({t.student_count} student{t.student_count > 1 ? 's' : ''})
                              </span>
                            </div>
                          </div>
                          <div className="flex items-center gap-3">
                            <div className="flex-1 h-2 bg-gray-100 rounded-full overflow-hidden">
                              <div
                                className={cn(
                                  'h-full rounded-full transition-all duration-500',
                                  t.level === 'strong' ? 'bg-emerald-500' :
                                  t.level === 'weak' ? 'bg-red-500' :
                                  'bg-amber-500'
                                )}
                                style={{ width: `${pct}%` }}
                              />
                            </div>
                            <span className="text-xs font-bold text-gray-600 w-10 text-right">{pct}%</span>
                          </div>
                        </div>
                      </div>
                    )
                  })}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
