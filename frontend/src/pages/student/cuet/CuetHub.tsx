import { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import {
  BookOpen, BarChart3, ChevronRight, ChevronDown, ChevronUp,
  Target, Clock, Zap, TrendingUp, TrendingDown, Loader2
} from 'lucide-react'
import { getMyCuetPlans } from '@/services/quizApi'
import { getCuetDashboard, getCuetPerformance } from '@/services/studentApi'
import { STUDENT_ROUTES } from '@/lib/constants'
import { cn } from '@/lib/utils'

export default function CuetHub() {
  const navigate = useNavigate()
  const [activeSubjectIdx, setActiveSubjectIdx] = useState(0)
  const [openWeeks, setOpenWeeks] = useState<Set<number>>(new Set())

  const { data: cuetPlans, isLoading: plansLoading } = useQuery({
    queryKey: ['my-cuet-plans'],
    queryFn: getMyCuetPlans,
  })

  const planGroup = cuetPlans?.[0] // first (and typically only) duration group
  const subjects = planGroup?.subjects || []
  const activeSubject = subjects[activeSubjectIdx]
  const durationMonths = planGroup?.duration_months ?? 6

  const { data: dashboard, isLoading: dashLoading } = useQuery({
    queryKey: ['cuet-dashboard'],
    queryFn: getCuetDashboard,
    enabled: subjects.length > 0,
  })

  const { data: crossPerf } = useQuery({
    queryKey: ['cuet-performance-cross'],
    queryFn: () => getCuetPerformance(),
    enabled: subjects.length > 0,
  })

  const toggleWeek = (wn: number) => {
    setOpenWeeks((prev) => {
      const next = new Set(prev)
      if (next.has(wn)) next.delete(wn)
      else next.add(wn)
      return next
    })
  }

  if (plansLoading || dashLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <Loader2 className="w-8 h-8 text-primary-600 animate-spin" />
      </div>
    )
  }

  if (!planGroup || subjects.length === 0) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-primary-50 via-white to-accent-50 flex items-center justify-center p-6">
        <div className="card p-10 text-center max-w-md w-full">
          <BookOpen className="w-12 h-12 text-gray-300 mx-auto mb-4" />
          <h2 className="text-xl font-bold text-gray-900 mb-2">No CUET Plan Found</h2>
          <p className="text-sm text-gray-500 mb-6">You haven't enrolled in a CUET plan yet.</p>
          <button
            onClick={() => navigate(STUDENT_ROUTES.EXAM_ONBOARDING)}
            className="btn-primary btn-md w-full"
          >
            Start CUET Enrollment
          </button>
        </div>
      </div>
    )
  }

  const overallPct = dashboard
    ? Math.round(
        dashboard.subjects.reduce((sum, s) => sum + s.completion_pct, 0) /
          Math.max(1, dashboard.subjects.length)
      )
    : 0

  return (
    <div className="min-h-screen bg-gradient-to-br from-primary-50 via-white to-accent-50">
      <div className="max-w-4xl mx-auto px-4 py-8 space-y-6">

        {/* Header */}
        <div className="card p-6">
          <div className="flex items-center justify-between mb-1">
            <h1 className="text-xl font-bold text-gray-900">CUET Preparation</h1>
            <span className="text-xs font-semibold bg-primary-100 text-primary-700 px-3 py-1 rounded-full">
              {durationMonths} Month Plan
            </span>
          </div>
          <p className="text-sm text-gray-500 mb-4">{subjects.length} subjects enrolled</p>
          {/* Overall progress bar */}
          <div className="w-full bg-gray-100 rounded-full h-2">
            <div
              className="bg-primary-500 rounded-full h-2 transition-all"
              style={{ width: `${overallPct}%` }}
            />
          </div>
          <p className="text-xs text-gray-400 mt-1">{overallPct}% Overall Completed</p>
        </div>

        {/* Metric cards */}
        <div className="grid grid-cols-3 gap-4">
          <div className="card p-4 text-center">
            <BookOpen className="w-5 h-5 text-primary-600 mx-auto mb-1" />
            <p className="text-2xl font-bold text-gray-900">{dashboard?.total_tests ?? 0}</p>
            <p className="text-xs text-gray-500">Tests Taken</p>
          </div>
          <div className="card p-4 text-center">
            <Target className="w-5 h-5 text-success-600 mx-auto mb-1" />
            <p className="text-2xl font-bold text-gray-900">
              {dashboard?.avg_score ? `${dashboard.avg_score.toFixed(1)}%` : '—'}
            </p>
            <p className="text-xs text-gray-500">Avg Score</p>
          </div>
          <div className="card p-4 text-center">
            <Clock className="w-5 h-5 text-warning-600 mx-auto mb-1" />
            <p className="text-2xl font-bold text-gray-900">{subjects.length}</p>
            <p className="text-xs text-gray-500">Subjects</p>
          </div>
        </div>

        {/* Cross-subject Strength/Weakness Summary */}
        {(crossPerf?.strengths.length ?? 0) > 0 || (crossPerf?.weaknesses.length ?? 0) > 0 ? (
          <div className="card p-6">
            <div className="flex items-center justify-between mb-4">
              <h2 className="font-semibold text-gray-900">Overall Strength & Weakness</h2>
              <Link
                to={STUDENT_ROUTES.cuetAnalysis(durationMonths)}
                className="text-sm text-primary-600 hover:underline flex items-center gap-1"
              >
                Full Analysis <ChevronRight className="w-3.5 h-3.5" />
              </Link>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <p className="text-xs font-semibold text-success-700 uppercase tracking-wider mb-2">Top Strengths</p>
                <div className="space-y-2">
                  {(crossPerf?.strengths || []).map((s) => (
                    <div key={s.topic} className="flex items-center justify-between">
                      <div>
                        <p className="text-sm text-gray-700 font-medium">{s.topic}</p>
                        <p className="text-xs text-gray-400">{s.subject}</p>
                      </div>
                      <span className="badge-success ml-2 shrink-0">{s.avg_score.toFixed(1)}</span>
                    </div>
                  ))}
                </div>
              </div>
              <div>
                <p className="text-xs font-semibold text-danger-600 uppercase tracking-wider mb-2">Needs Work</p>
                <div className="space-y-2">
                  {(crossPerf?.weaknesses || []).map((w) => (
                    <div key={w.topic} className="flex items-center justify-between">
                      <div>
                        <p className="text-sm text-gray-700 font-medium">{w.topic}</p>
                        <p className="text-xs text-gray-400">{w.subject}</p>
                      </div>
                      <span className="badge-danger ml-2 shrink-0">{w.avg_score.toFixed(1)}</span>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>
        ) : null}

        {/* Subject Switcher + Per-Subject Plan */}
        <div className="card overflow-hidden">
          {/* Subject tab pills */}
          <div className="border-b border-gray-100 px-4 pt-4 flex gap-2 flex-wrap">
            {subjects.map((subj, idx) => (
              <button
                key={subj.plan_id}
                onClick={() => setActiveSubjectIdx(idx)}
                className={cn(
                  'px-4 py-2 rounded-xl text-sm font-semibold transition-all mb-3',
                  idx === activeSubjectIdx
                    ? 'bg-primary-600 text-white'
                    : 'bg-gray-100 text-gray-600 hover:bg-primary-50 hover:text-primary-700'
                )}
              >
                {subj.label}
              </button>
            ))}
          </div>

          {/* Active subject detail */}
          {activeSubject && (
            <div className="p-5">
              <div className="flex items-center justify-between mb-4">
                <div>
                  <p className="font-semibold text-gray-900">{activeSubject.label}</p>
                  <p className="text-xs text-gray-400">
                    Week {activeSubject.current_week} of {activeSubject.total_weeks} · {activeSubject.completed_weeks.length} completed
                  </p>
                </div>
                {/* Start current week test */}
                <Link
                  to={STUDENT_ROUTES.testQuiz(activeSubject.plan_id, activeSubject.current_week)}
                  state={{ test_number: 1, cuet: true, duration_months: durationMonths }}
                  className="btn-primary btn-sm flex items-center gap-1.5"
                >
                  <Zap className="w-3.5 h-3.5" /> Start Week {activeSubject.current_week}
                </Link>
              </div>

              {/* Week progress bars — compact accordion */}
              <div className="space-y-2 max-h-80 overflow-y-auto pr-1">
                {Array.from({ length: activeSubject.total_weeks }, (_, i) => i + 1).map((wn) => {
                  const done = activeSubject.completed_weeks.includes(wn)
                  const isCurrent = wn === activeSubject.current_week
                  const locked = !done && !isCurrent
                  const open = openWeeks.has(wn)
                  return (
                    <div
                      key={wn}
                      className={cn(
                        'rounded-xl border transition-all',
                        done ? 'border-success-200 bg-success-50/30' :
                        isCurrent ? 'border-primary-300 bg-primary-50/40' :
                        'border-gray-100 bg-white opacity-60'
                      )}
                    >
                      <button
                        className="w-full flex items-center justify-between px-4 py-2.5 text-left"
                        onClick={() => !locked && toggleWeek(wn)}
                        disabled={locked}
                      >
                        <div className="flex items-center gap-3">
                          <span className={cn(
                            'w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold',
                            done ? 'bg-success-500 text-white' :
                            isCurrent ? 'bg-primary-600 text-white' :
                            'bg-gray-200 text-gray-400'
                          )}>
                            {wn}
                          </span>
                          <span className="text-sm font-medium text-gray-700">Week {wn}</span>
                          {isCurrent && <span className="text-[10px] bg-primary-100 text-primary-700 px-2 py-0.5 rounded-full font-semibold">Current</span>}
                          {done && <span className="text-[10px] bg-success-100 text-success-700 px-2 py-0.5 rounded-full font-semibold">Done</span>}
                        </div>
                        {!locked && (open ? <ChevronUp className="w-4 h-4 text-gray-400" /> : <ChevronDown className="w-4 h-4 text-gray-400" />)}
                      </button>
                      {open && (
                        <div className="px-4 pb-3 text-sm text-gray-500">
                          Week {wn} topics will appear here based on the plan.
                        </div>
                      )}
                    </div>
                  )
                })}
              </div>
            </div>
          )}
        </div>

        {/* Recent results */}
        {dashboard && dashboard.recent_results.length > 0 && (
          <div className="card p-6">
            <h2 className="font-semibold text-gray-900 mb-4">Recent Tests</h2>
            <div className="space-y-3">
              {dashboard.recent_results.map((r) => (
                <div key={r.id} className="flex items-center justify-between p-3 rounded-xl bg-gray-50">
                  <div>
                    <p className="text-sm font-medium text-gray-900">
                      Week {r.week_number ?? '?'} — Test {r.test_number ?? '?'}
                    </p>
                    <p className="text-xs text-gray-400">{new Date(r.created_at).toLocaleDateString()}</p>
                  </div>
                  <div className="flex items-center gap-3">
                    <span className={cn(
                      'text-sm font-bold',
                      r.score_pct >= 70 ? 'text-success-600' :
                      r.score_pct >= 40 ? 'text-warning-600' : 'text-danger-600'
                    )}>
                      {r.score_pct}%
                    </span>
                    <Link
                      to={`/student/exam/${subjects[0]?.plan_id}/${r.session_id}/result`}
                      className="text-xs text-primary-600 hover:underline"
                    >
                      View
                    </Link>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
