import { useState } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { ArrowLeft, BookOpen, TrendingUp, TrendingDown, Minus, Users } from 'lucide-react'
import ExamFilter from '../../components/org/ExamFilter'
import Spinner from '../../components/ui/Spinner'
import { getAdminOrgDashboard, getAdminOrgTopicBreakdown, AdminOrgTopicItem } from '../../services/adminApi'
import { getOrganizations } from '../../services/adminApi'
import { cn } from '../../lib/utils'

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
    default:
      return 'bg-amber-50 text-amber-700 border-amber-200'
  }
}

export default function AdminOrgDetailTopicBreakdown() {
  const { orgId } = useParams<{ orgId: string }>()
  const navigate = useNavigate()
  const [selectedExam, setSelectedExam] = useState<string | undefined>(undefined)

  const { data: orgs = [] } = useQuery({ queryKey: ['organizations'], queryFn: getOrganizations })
  const org = orgs.find((o) => o.id === orgId)

  const { data: dashboardData } = useQuery({
    queryKey: ['admin-org-dashboard', orgId, selectedExam],
    queryFn: () => getAdminOrgDashboard(orgId!, selectedExam),
    enabled: !!orgId,
  })

  const effectiveExam = selectedExam || dashboardData?.selected_exam || undefined

  const { data, isLoading } = useQuery({
    queryKey: ['admin-org-topic-breakdown', orgId, effectiveExam],
    queryFn: () => getAdminOrgTopicBreakdown(orgId!, effectiveExam),
    enabled: !!orgId,
  })

  const allTopics: AdminOrgTopicItem[] = data?.all_topics || []

  // Group by subject
  const grouped: Record<string, AdminOrgTopicItem[]> = {}
  for (const t of allTopics) {
    const subj = t.subject || 'General'
    if (!grouped[subj]) grouped[subj] = []
    grouped[subj].push(t)
  }

  return (
    <div className="space-y-6 animate-fade-in">
      {/* ── Header ───────────────────────────────────────────────────────── */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <button
            onClick={() => navigate(`/admin/org/${orgId}`)}
            className="p-2 border border-gray-200 rounded-xl hover:bg-gray-50 transition-colors text-gray-600"
          >
            <ArrowLeft className="w-5 h-5" />
          </button>
          <div>
            <h1 className="text-2xl font-bold text-gray-900 flex items-center gap-2">
              <BookOpen className="w-6 h-6 text-primary-600" />
              Detailed Topic Breakdown
            </h1>
            <p className="text-sm text-gray-500 mt-0.5">
              {org?.name ? `${org.name} — ` : ''}Comprehensive subject & topic performance across all students
            </p>
          </div>
        </div>

        <div className="w-full sm:w-64">
          <ExamFilter
            exams={dashboardData?.available_exams || []}
            selected={effectiveExam || null}
            onChange={(exam) => setSelectedExam(exam)}
          />
        </div>
      </div>

      {/* ── Stats bar ────────────────────────────────────────────────────── */}
      {data && data.total_students_with_data > 0 && (
        <div className="flex items-center gap-1.5 px-3 py-1.5 bg-gray-100 text-gray-700 rounded-full text-xs font-semibold w-fit">
          <Users className="w-3.5 h-3.5" />
          <span>{data.total_students_with_data} student{data.total_students_with_data > 1 ? 's' : ''} evaluated</span>
        </div>
      )}

      {/* ── Content ──────────────────────────────────────────────────────── */}
      {isLoading ? (
        <div className="flex justify-center py-16">
          <Spinner size="lg" />
        </div>
      ) : allTopics.length === 0 ? (
        <div className="bg-white rounded-2xl border border-gray-100 p-10 text-center text-gray-400 space-y-2">
          <BookOpen className="w-8 h-8 mx-auto text-gray-300" />
          <p className="text-base font-medium text-gray-600">No topic performance data available yet</p>
          <p className="text-xs text-gray-400 max-w-md mx-auto">
            Once students complete tests under this exam, subject-wise topic proficiency will appear here.
          </p>
        </div>
      ) : (
        <div className="space-y-4 pt-1">
          {Object.entries(grouped).map(([subject, topics]) => (
            <div key={subject} className="bg-white rounded-2xl border border-gray-100 overflow-hidden shadow-sm">
              <div className="px-5 py-3.5 bg-gray-50/80 border-b border-gray-100 flex items-center justify-between">
                <span className="font-bold text-sm text-gray-800">{subject}</span>
                <span className="text-xs font-semibold text-gray-400">
                  {topics.length} topic{topics.length > 1 ? 's' : ''}
                </span>
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
