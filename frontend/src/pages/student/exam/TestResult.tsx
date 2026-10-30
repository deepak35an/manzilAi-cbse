import { useParams, useNavigate, useLocation, Link } from 'react-router-dom'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { useEffect, useState } from 'react'
import { getSessionResult, getSummaryStatus } from '@/services/quizApi'
import { STUDENT_ROUTES } from '@/lib/constants'
import { CheckCircle2, Clock, Target, BookOpen, Eye, LayoutDashboard, Sparkles, Loader2 } from 'lucide-react'
import { cn } from '@/lib/utils'
import AiReportFormatter from '@/components/ui/AiReportFormatter'

export default function TestResult() {
  const { id: planId, testId } = useParams<{ id: string; testId: string }>()
  const location = useLocation()
  const locationState = location.state as { session_id?: string } | null
  const sessionId = locationState?.session_id || ''
  const queryClient = useQueryClient()

  // Eagerly invalidate all plan & dashboard related caches when this page mounts
  // so that navigating back shows fresh data without a manual refresh
  useEffect(() => {
    queryClient.invalidateQueries({ queryKey: ['dashboard', planId] })
    queryClient.invalidateQueries({ queryKey: ['performance', planId] })
    queryClient.invalidateQueries({ queryKey: ['performance-report'] })
    queryClient.invalidateQueries({ queryKey: ['history', planId] })
    queryClient.invalidateQueries({ queryKey: ['plan-status', planId] })
    // Invalidate the main student dashboard too
    queryClient.invalidateQueries({ queryKey: ['student-dashboard'] })
    queryClient.invalidateQueries({ queryKey: ['student-performance'] })
    queryClient.invalidateQueries({ queryKey: ['student-history'] })
    queryClient.invalidateQueries({ queryKey: ['exam-plan'] })
  }, [queryClient, planId])

  // Core result data (score, stats, questions)
  const { data, isLoading } = useQuery({
    queryKey: ['session-result', sessionId],
    queryFn: () => getSessionResult(sessionId),
    enabled: !!sessionId,
  })

  // Track the resolved AI summary — either from the cached result or from polling
  const [resolvedSummary, setResolvedSummary] = useState<string | null>(null)

  // Seed from cached result if it already has a summary (e.g. user navigates back)
  useEffect(() => {
    if (data?.ai_summary && !resolvedSummary) {
      setResolvedSummary(data.ai_summary)
    }
  }, [data?.ai_summary, resolvedSummary])

  // Poll /quiz/summary-status every 3 seconds while the summary is not yet ready
  const summaryAlreadyAvailable = !!(data?.ai_summary || resolvedSummary)
  const { data: statusData } = useQuery({
    queryKey: ['summary-status', sessionId],
    queryFn: () => getSummaryStatus(sessionId),
    enabled: !!sessionId && !summaryAlreadyAvailable,
    // Keep polling every 3s while generating; stop as soon as it's ready
    refetchInterval: (query) => {
      const d = query.state.data
      return d?.status === 'ready' ? false : 3000
    },
  })

  // When polling returns 'ready', store the summary and stop polling
  useEffect(() => {
    if (statusData?.status === 'ready' && statusData.ai_summary) {
      setResolvedSummary(statusData.ai_summary)
      queryClient.cancelQueries({ queryKey: ['summary-status', sessionId] })
    }
  }, [statusData, sessionId, queryClient])

  const aiSummary = resolvedSummary
  const summaryGenerating = !summaryAlreadyAvailable && statusData?.status !== 'ready'

  const pct = data ? Math.round((data.total_score / Math.max(data.max_score, 1)) * 100) : 0
  const mins = data ? Math.floor(data.time_seconds / 60) : 0
  const secs = data ? data.time_seconds % 60 : 0
  const avgSecs = data && data.total_questions > 0
    ? Math.round(data.time_seconds / data.total_questions)
    : 0

  if (!sessionId) {
    return (
      <div className="max-w-2xl mx-auto card p-10 text-center">
        <p className="text-gray-400">No session data found.</p>
        <Link to={STUDENT_ROUTES.examDashboard(planId!)} className="btn-primary mt-4 inline-block">
          Back to Dashboard
        </Link>
      </div>
    )
  }

  if (isLoading) {
    return <div className="max-w-2xl mx-auto space-y-4 animate-pulse"><div className="skeleton h-64" /></div>
  }

  return (
    <div className="max-w-2xl mx-auto my-10 space-y-6 animate-fade-in">
      {/* Score circle */}
      <div className="card p-8 text-center">
        <div className={cn(
          'w-24 h-24 rounded-full mx-auto flex flex-col items-center justify-center border-4 mb-4',
          pct >= 80 ? 'border-success-500 bg-success-50' :
          pct >= 60 ? 'border-warning-500 bg-warning-50' :
          'border-danger-500 bg-danger-50'
        )}>
          <span className={cn(
            'text-2xl font-extrabold',
            pct >= 80 ? 'text-success-700' : pct >= 60 ? 'text-warning-700' : 'text-danger-700'
          )}>{pct}%</span>
        </div>
        <h1 className="text-xl font-bold text-gray-900">
          {data?.label
            || (data?.week_number
              ? (data.plan_type === 'TOPIC_WISE_TESTS'
                ? `Topic ${data.week_number}`
                : (data.test_number ? `W-${data.week_number} Test ${data.test_number}` : `Week ${data.week_number}`))
              : `Week ${testId}`)}{' '}
          Complete
        </h1>
        <p className="text-gray-500 text-sm mt-1">
          {pct >= 80 ? 'Excellent performance!' : pct >= 60 ? 'Good effort, keep improving.' : 'Keep practicing — you\'ll get there!'}
        </p>
      </div>

      {/* Stats grid */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {[
          { label: 'Questions', value: data?.answered ?? '—', icon: <BookOpen className="w-4 h-4" /> },
          { label: 'Correct', value: data?.correct_count ?? '—', icon: <CheckCircle2 className="w-4 h-4" /> },
          { label: 'Time Taken', value: `${mins}m ${secs}s`, icon: <Clock className="w-4 h-4" /> },
          { label: 'Avg/Question', value: `${avgSecs}s`, icon: <Target className="w-4 h-4" /> },
        ].map((s) => (
          <div key={s.label} className="card p-4 text-center">
            <div className="text-primary-500 flex justify-center mb-1">{s.icon}</div>
            <p className="text-lg font-bold text-gray-900">{s.value}</p>
            <p className="text-xs text-gray-400">{s.label}</p>
          </div>
        ))}
      </div>

      {/* AI Summary — shows skeleton while generating, fills in automatically when ready */}
      <div className="card p-6">
        <div className="flex items-center gap-2 mb-3 pb-3 border-b border-gray-100">
          <div className="w-8 h-8 rounded-xl bg-primary-100 flex items-center justify-center text-primary-600 shrink-0">
            <Sparkles className="w-4 h-4" />
          </div>
          <div>
            <h2 className="font-bold text-gray-900 text-base">AI Performance Summary</h2>
            <p className="text-xs text-gray-500">Instant feedback &amp; recommendations</p>
          </div>
          {summaryGenerating && (
            <span className="ml-auto flex items-center gap-1.5 text-xs text-primary-500 font-medium">
              <Loader2 className="w-3.5 h-3.5 animate-spin" />
              Generating…
            </span>
          )}
        </div>

        {aiSummary ? (
          <AiReportFormatter text={aiSummary} />
        ) : (
          /* Animated skeleton shown while Ollama is generating the summary */
          <div className="space-y-3 animate-pulse">
            <div className="flex items-center gap-2 text-sm text-primary-600 font-medium mb-4">
              <Loader2 className="w-4 h-4 animate-spin shrink-0" />
              <span>Analysing your performance… this takes about 15–20 seconds.</span>
            </div>
            <div className="h-3 bg-gray-100 rounded-full w-full" />
            <div className="h-3 bg-gray-100 rounded-full w-5/6" />
            <div className="h-3 bg-gray-100 rounded-full w-4/6" />
            <div className="h-3 bg-gray-100 rounded-full w-full mt-2" />
            <div className="h-3 bg-gray-100 rounded-full w-3/4" />
            <div className="h-3 bg-gray-100 rounded-full w-5/6" />
          </div>
        )}
      </div>

      {/* Actions — always visible, no longer blocked by summary */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <Link
          to={STUDENT_ROUTES.examDashboard(planId!)}
          className="btn-outline flex items-center justify-center gap-2 py-3"
        >
          <LayoutDashboard className="w-4 h-4" />
          Back to Dashboard
        </Link>
        <Link
          to={STUDENT_ROUTES.testReview(planId!, testId!)}
          state={{ session_id: sessionId }}
          className="btn-primary flex items-center justify-center gap-2 py-3"
        >
          <Eye className="w-4 h-4" />
          Detailed Review
        </Link>
      </div>
    </div>
  )
}
