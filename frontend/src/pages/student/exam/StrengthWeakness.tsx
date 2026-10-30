import { useState } from 'react'
import { useParams, Link } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { getPerformanceReport, getStudentDashboard } from '@/services/studentApi'
import { STUDENT_ROUTES } from '@/lib/constants'
import { BarChart3, TrendingUp, TrendingDown, Sparkles, ChevronRight, ChevronDown } from 'lucide-react'
import AiReportFormatter from '@/components/ui/AiReportFormatter'

export default function StrengthWeakness() {
  const { id: planId } = useParams<{ id: string }>()

  // ── Metadata query (dashboard) — used only to know is_cuet and cuet_subjects ──
  const { data: dashData } = useQuery({
    queryKey: ['dashboard', planId],
    queryFn: () => getStudentDashboard(planId!),
    enabled: !!planId,
  })

  const isCuet = dashData?.is_cuet || dashData?.exam_name?.startsWith('CUET')
  const cuetSubjects: { plan_id: string; exam: string; label: string }[] = dashData?.cuet_subjects || []

  // Selected specific subject plan_id. Empty string = "All Enrolled Subjects".
  const [selectedPlanId, setSelectedPlanId] = useState<string>('')

  // true when user has selected a specific subject (not "All Enrolled")
  const isSubjectFiltered = isCuet && !!selectedPlanId

  // ── Query 1: Journey-level (STABLE) — keyed by route planId only ─────────────
  // Fetches: AI report + cross-subject combined S&W (subject_only=false).
  // Never re-fetches on subject switch. AI report section always reads from this.
  const { data: journeyReport, isLoading: journeyLoading } = useQuery({
    queryKey: ['performance-report', planId],
    queryFn: () => getPerformanceReport(planId, false),
    enabled: !!planId,
    refetchInterval: (query) => (query.state.data?.ai_summary ? false : 3000),
  })

  // ── Query 2: Subject-level (DYNAMIC) — keyed by selectedPlanId ───────────────
  // Fetches: S&W scoped to the selected subject (subject_only=true).
  // Only runs when a specific subject is selected. Otherwise shares journeyReport data.
  const { data: subjectReport, isLoading: subjectLoading } = useQuery({
    queryKey: ['performance-report-subject', selectedPlanId],
    queryFn: () => getPerformanceReport(selectedPlanId, true),
    enabled: isSubjectFiltered,
  })

  // The active S&W data depends on whether a subject is filtered or not
  const activeReport = isSubjectFiltered ? subjectReport : journeyReport
  const swLoading = isSubjectFiltered ? subjectLoading : journeyLoading

  const strengths = activeReport?.strengths || []
  const weaknesses = activeReport?.weaknesses || []

  // AI report always comes from the stable journey query — never changes on subject switch
  const aiSummary = journeyReport?.ai_summary

  // Label for what S&W data is currently shown
  const currentLabel = isCuet
    ? (selectedPlanId
      ? cuetSubjects.find(s => s.plan_id === selectedPlanId)?.label || 'Selected Subject'
      : 'All Enrolled Subjects')
    : (dashData?.exam_name || 'Your Exam')

  if (journeyLoading) {
    return (
      <div className="space-y-4 animate-pulse">
        <div className="skeleton h-48" />
        <div className="skeleton h-32" />
      </div>
    )
  }

  return (
    <div className="space-y-6 animate-fade-in">
      {/* Header */}
      <div className="border-b border-gray-100 pb-4">
        <h1 className="text-xl font-bold text-gray-900">Strength &amp; Weakness</h1>
        <p className="text-sm text-gray-500 mt-0.5">
          {isCuet
            ? `Showing data for: ${currentLabel}`
            : 'Based on all your evaluations'}
        </p>
      </div>

      {/* CUET Subject Selector — each option maps to a distinct plan_id */}
      {isCuet && (
        <div className="card p-4 border border-primary-100 bg-primary-50/20">
          <label className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-2 block">
            Filter by Subject
          </label>
          <div className="relative">
            <select
              value={selectedPlanId}
              onChange={(e) => setSelectedPlanId(e.target.value)}
              className="w-full appearance-none border border-gray-200 rounded-xl px-4 py-2.5 text-sm font-semibold text-gray-800 bg-white focus:outline-none focus:ring-2 focus:ring-primary-300 pr-10 cursor-pointer"
            >
              <option value="">All Enrolled Subjects (Combined)</option>
              {cuetSubjects.map((s) => (
                <option key={s.plan_id} value={s.plan_id}>
                  {s.label}
                </option>
              ))}
            </select>
            <ChevronDown className="w-4 h-4 text-gray-400 absolute right-3 top-3.5 pointer-events-none" />
          </div>
        </div>
      )}

      {/* Strengths & Weaknesses unified card — only this section re-renders on subject switch */}
      <div className="card overflow-hidden">
        {swLoading ? (
          <div className="p-5 space-y-3 animate-pulse">
            {[1, 2, 3].map((i) => (
              <div key={i} className="skeleton h-10 w-full" />
            ))}
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 divide-y sm:divide-y-0 sm:divide-x divide-gray-100">
            {/* Strengths */}
            <div className="pt-5 pb-7 px-5">
              <div className="flex items-center gap-2 mb-4">
                <TrendingUp className="w-5 h-5 text-success-600" />
                <h3 className="font-semibold text-gray-900">Top Strengths</h3>
              </div>
              {strengths.length === 0 ? (
                <p className="text-sm text-gray-400">Take more tests to see your strengths.</p>
              ) : (
                <div className="space-y-3">
                  {strengths.map((s: any, i: number) => (
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
            <div className="p-5 pb-3">
              <div className="flex items-center gap-2 mb-4">
                <TrendingDown className="w-5 h-5 text-danger-600" />
                <h3 className="font-semibold text-gray-900">Areas to Improve</h3>
              </div>
              {weaknesses.length === 0 ? (
                <p className="text-sm text-gray-400">Take more tests to identify areas for improvement.</p>
              ) : (
                <div className="space-y-3">
                  {weaknesses.map((w: any, i: number) => (
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
        )}
      </div>



      {/* AI Performance Report — stable, polling in background until ai_summary is generated */}
      <div className="card p-5">
        <div className="flex items-center gap-2 mb-3 pb-3 border-b border-gray-100">
          <div className="w-8 h-8 rounded-xl bg-primary-100 flex items-center justify-center text-primary-600 shrink-0">
            <Sparkles className={`w-4 h-4 ${!aiSummary ? 'animate-pulse' : ''}`} />
          </div>
          <div>
            <h2 className="font-bold text-gray-900 text-base">AI Performance Report</h2>
            <p className="text-xs text-gray-500">Holistic insights generated from your evaluations</p>
          </div>
          <span className="text-xs font-semibold text-primary-700 bg-primary-50 border border-primary-100 px-2.5 py-1 rounded-full ml-auto">
            All Enrolled Subjects
          </span>
        </div>
        {aiSummary ? (
          <AiReportFormatter text={aiSummary} />
        ) : (
          <div className="flex items-center gap-3 p-4 bg-primary-50/50 rounded-xl text-xs text-primary-700 font-medium animate-pulse">
            <Sparkles className="w-4 h-4 text-primary-600 shrink-0 animate-spin" />
            <span>Generating AI performance report based on your latest evaluation...</span>
          </div>
        )}
      </div>

      {/* Continue to plan */}
      <div className="card p-5">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div>
            <p className="font-semibold text-gray-900">Ready to study?</p>
            <p className="text-sm text-gray-500 mt-0.5">Jump to your study plan and start the next topic evaluation.</p>
          </div>
          <Link
            to={STUDENT_ROUTES.examPlan(planId!)}
            className="btn-primary btn-md flex items-center gap-2 shrink-0 self-start sm:self-auto"
          >
            Continue <ChevronRight className="w-4 h-4" />
          </Link>
        </div>
      </div>
    </div>
  )
}
