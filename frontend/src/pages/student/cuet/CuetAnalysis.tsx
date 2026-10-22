import { useState } from 'react'
import { Link } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { TrendingUp, TrendingDown, BarChart3, ChevronRight, ChevronDown, Sparkles } from 'lucide-react'
import { getMyCuetPlans } from '@/services/quizApi'
import { getCuetPerformance } from '@/services/studentApi'
import type { CuetSubjectBreakdown, CuetTopicStat } from '@/services/studentApi'
import { STUDENT_ROUTES } from '@/lib/constants'

export default function CuetAnalysis() {

  const { data: cuetPlans } = useQuery({
    queryKey: ['my-cuet-plans'],
    queryFn: getMyCuetPlans,
  })

  const planGroup = cuetPlans?.[0]
  const subjects = planGroup?.subjects || []

  // Cross-subject summary (no param)
  const { data: crossPerf, isLoading: crossLoading } = useQuery({
    queryKey: ['cuet-performance-cross'],
    queryFn: () => getCuetPerformance(),
  })

  // Subject dropdown options fallback
  const subjectOptions = subjects.length > 0
    ? subjects
    : (crossPerf?.subjects_breakdown || []).map((s) => ({
        plan_id: '',
        exam: s.exam,
        label: s.label,
        current_week: 1,
        total_weeks: 24,
        completed_weeks: [],
      }))

  const [selectedSubjectExam, setSelectedSubjectExam] = useState<string | null>(null)

  // Per-subject (when dropdown selected)
  const { data: subjectPerf, isLoading: subjectLoading } = useQuery({
    queryKey: ['cuet-performance-subject', selectedSubjectExam],
    queryFn: () => getCuetPerformance(selectedSubjectExam!),
    enabled: !!selectedSubjectExam,
  })

  const activeSubjectData: CuetSubjectBreakdown | undefined = selectedSubjectExam
    ? crossPerf?.subjects_breakdown?.find((s) => s.exam === selectedSubjectExam)
    : undefined

  const displayedStrengths: CuetTopicStat[] = selectedSubjectExam
    ? (subjectPerf?.strengths || activeSubjectData?.strengths || [])
    : (crossPerf?.strengths || [])

  const displayedWeaknesses: CuetTopicStat[] = selectedSubjectExam
    ? (subjectPerf?.weaknesses || activeSubjectData?.weaknesses || [])
    : (crossPerf?.weaknesses || [])

  const selectedSubjectObj = subjectOptions.find((s) => s.exam === selectedSubjectExam)

  return (
    <div className="min-h-screen bg-gradient-to-br from-primary-50 via-white to-accent-50">
      <div className="max-w-3xl mx-auto px-4 py-8 space-y-6">

        {/* Header */}
        <div className="border-b border-gray-100 pb-4">
          <h1 className="text-xl font-bold text-gray-900">CUET Strength & Weakness</h1>
          <p className="text-sm text-gray-500 mt-0.5">
            {selectedSubjectExam
              ? `Showing top 5 topics for ${selectedSubjectObj?.label ?? selectedSubjectExam}`
              : 'Top topics across all enrolled subjects'
            }
          </p>
        </div>

        {/* Subject dropdown */}
        <div className="card p-4">
          <label className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-2 block">
            View by Subject
          </label>
          <div className="relative">
            <select
              value={selectedSubjectExam ?? ''}
              onChange={(e) => setSelectedSubjectExam(e.target.value || null)}
              className="w-full appearance-none border border-gray-200 rounded-xl px-4 py-2.5 text-sm font-medium text-gray-800 bg-white focus:outline-none focus:ring-2 focus:ring-primary-300 pr-10"
            >
              <option value="">All Subjects (Cross-subject Summary)</option>
              {subjectOptions.map((s) => (
                <option key={s.exam} value={s.exam}>{s.label}</option>
              ))}
            </select>
            <ChevronDown className="w-4 h-4 text-gray-400 absolute right-3 top-3 pointer-events-none" />
          </div>
        </div>

        {/* Cross-subject Summary banner — always visible */}
        {!selectedSubjectExam && crossPerf && (
          <p className="text-xs text-gray-400 text-center -mt-2">
            Showing top strengths and weaknesses drawn from all enrolled subjects
          </p>
        )}

        {/* S&W unified card */}
        <div className="card overflow-hidden">
          <div className="grid grid-cols-1 sm:grid-cols-2 divide-y sm:divide-y-0 sm:divide-x divide-gray-100">

            {/* Strengths */}
            <div className="p-5">
              <div className="flex items-center gap-2 mb-4">
                <TrendingUp className="w-5 h-5 text-success-600" />
                <h3 className="font-semibold text-gray-900">Top 5 Strengths</h3>
              </div>
              {(crossLoading || subjectLoading) ? (
                <div className="space-y-2">
                  {[1,2,3].map((i) => <div key={i} className="skeleton h-10 rounded-xl" />)}
                </div>
              ) : displayedStrengths.length === 0 ? (
                <p className="text-sm text-gray-400">Take more tests to see your strengths.</p>
              ) : (
                <div className="space-y-3">
                  {displayedStrengths.map((s, i) => (
                    <div key={s.topic} className="flex items-start gap-3">
                      <span className="w-5 h-5 rounded-full bg-success-50 text-success-700 text-xs font-bold flex items-center justify-center shrink-0 mt-0.5">
                        {i + 1}
                      </span>
                      <div>
                        <p className="text-sm font-medium text-gray-900">{s.topic}</p>
                        <p className="text-xs text-gray-500">{s.subject} · Avg {s.avg_score.toFixed(1)}/10</p>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Weaknesses */}
            <div className="p-5">
              <div className="flex items-center gap-2 mb-4">
                <TrendingDown className="w-5 h-5 text-danger-600" />
                <h3 className="font-semibold text-gray-900">Top 5 Weaknesses</h3>
              </div>
              {(crossLoading || subjectLoading) ? (
                <div className="space-y-2">
                  {[1,2,3].map((i) => <div key={i} className="skeleton h-10 rounded-xl" />)}
                </div>
              ) : displayedWeaknesses.length === 0 ? (
                <p className="text-sm text-gray-400">Take more tests to identify areas for improvement.</p>
              ) : (
                <div className="space-y-3">
                  {displayedWeaknesses.map((w, i) => (
                    <div key={w.topic} className="flex items-start gap-3">
                      <span className="w-5 h-5 rounded-full bg-danger-50 text-danger-600 text-xs font-bold flex items-center justify-center shrink-0 mt-0.5">
                        {i + 1}
                      </span>
                      <div>
                        <p className="text-sm font-medium text-gray-900">{w.topic}</p>
                        <p className="text-xs text-gray-500">{w.subject} · Avg {w.avg_score.toFixed(1)}/10</p>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>

        {/* AI Performance Report */}
        {!selectedSubjectExam && crossPerf?.ai_summary && (
          <div className="card p-5">
            <div className="flex items-center gap-2 mb-3">
              <Sparkles className="w-5 h-5 text-primary-600" />
              <h2 className="font-semibold text-gray-900">AI Performance Report</h2>
            </div>
            <div className="prose prose-sm max-w-none text-gray-700 leading-relaxed whitespace-pre-line">
              {crossPerf.ai_summary}
            </div>
          </div>
        )}

        {/* Detailed topic breakdown (per-subject only) */}
        {selectedSubjectExam && selectedSubjectObj && (
          <Link
            to={STUDENT_ROUTES.topicBreakdown(selectedSubjectObj.plan_id)}
            className="card p-4 flex items-center justify-between hover:bg-primary-50/30 transition"
          >
            <div className="flex items-center gap-3">
              <BarChart3 className="w-5 h-5 text-primary-600" />
              <div>
                <p className="font-semibold text-gray-900 text-sm">Detailed Topic Breakdown</p>
                <p className="text-xs text-gray-500">All topics for {selectedSubjectObj.label}</p>
              </div>
            </div>
            <ChevronRight className="w-4 h-4 text-gray-400" />
          </Link>
        )}

        {/* Back to CUET Hub */}
        <Link
          to={STUDENT_ROUTES.CUET_HUB}
          className="card p-5 flex items-center justify-between hover:bg-primary-50/30 transition"
        >
          <div>
            <p className="font-semibold text-gray-900">Back to CUET Hub</p>
            <p className="text-sm text-gray-500 mt-0.5">Continue your weekly preparation.</p>
          </div>
          <ChevronRight className="w-4 h-4 text-gray-400" />
        </Link>
      </div>
    </div>
  )
}
