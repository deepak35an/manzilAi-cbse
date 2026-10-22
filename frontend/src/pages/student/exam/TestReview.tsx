import { useParams, useLocation, Link } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { getSessionResult } from '@/services/quizApi'
import { STUDENT_ROUTES } from '@/lib/constants'
import { ArrowLeft, CheckCircle2, Clock, Target, BookOpen, Sparkles } from 'lucide-react'
import { cn } from '@/lib/utils'
import { useState } from 'react'
import AiReportFormatter from '@/components/ui/AiReportFormatter'

export default function TestReview() {
  const { id: planId, testId } = useParams<{ id: string; testId: string }>()
  const location = useLocation()
  const locationState = location.state as { session_id?: string; returnTo?: string } | null
  
  // Persist session_id in sessionStorage to handle reloads
  const [sessionId] = useState(() => {
    if (locationState?.session_id) {
      sessionStorage.setItem(`review_session_${planId}_${testId}`, locationState.session_id)
      return locationState.session_id
    }
    return sessionStorage.getItem(`review_session_${planId}_${testId}`) || ''
  })
  
  const returnTo = locationState?.returnTo || STUDENT_ROUTES.examDashboard(planId!)

  const { data, isLoading, isError } = useQuery({
    queryKey: ['session-result', sessionId],
    queryFn: () => getSessionResult(sessionId),
    enabled: !!sessionId,
  })

  if (!sessionId) {
    return (
      <div className="max-w-2xl mx-auto card p-10 text-center">
        <p className="text-gray-400 mb-4">No review data available. Please navigate here from a test result or history.</p>
        <Link to={returnTo} className="btn-primary mt-4 inline-block">Go Back</Link>
      </div>
    )
  }

  if (isLoading) {
    return <div className="max-w-2xl mx-auto space-y-4 animate-pulse"><div className="skeleton h-64" /></div>
  }

  if (isError || !data) {
    return (
      <div className="max-w-2xl mx-auto card p-10 text-center">
        <p className="text-gray-400 mb-4">Could not load review data. The session may have expired.</p>
        <Link to={returnTo} className="btn-primary mt-4 inline-block">Go Back</Link>
      </div>
    )
  }

  const pct = data ? Math.round((data.total_score / Math.max(data.max_score, 1)) * 100) : 0
  const mins = data ? Math.floor(data.time_seconds / 60) : 0
  const secs = data ? data.time_seconds % 60 : 0
  const avgSecs = data && data.total_questions > 0
    ? Math.round(data.time_seconds / data.total_questions)
    : 0

  const weekLabel = data?.week_number
    ? (data.test_number ? `W-${data.week_number} Test ${data.test_number}` : `Week ${data.week_number}`)
    : 'Evaluation'

  return (
    <div className="max-w-2xl mx-auto space-y-6 animate-fade-in">
      {/* Back */}
      <Link
        to={returnTo}
        className="flex items-center gap-2 text-sm text-gray-500 hover:text-gray-900"
      >
        <ArrowLeft className="w-4 h-4" />
        Back
      </Link>

      {/* Score circle */}
      <div className="card p-6 text-center">
        <div className={cn(
          'w-20 h-20 rounded-full mx-auto flex flex-col items-center justify-center border-4 mb-3',
          pct >= 80 ? 'border-success-500 bg-success-50' :
          pct >= 60 ? 'border-warning-500 bg-warning-50' :
          'border-danger-500 bg-danger-50'
        )}>
          <span className={cn(
            'text-xl font-extrabold',
            pct >= 80 ? 'text-success-700' : pct >= 60 ? 'text-warning-700' : 'text-danger-700'
          )}>{pct}%</span>
        </div>
        <h1 className="text-xl font-bold text-gray-900">{weekLabel} — Detailed Review</h1>
        <p className="text-gray-500 text-sm mt-1">
          {pct >= 80 ? 'Excellent performance!' : pct >= 60 ? 'Good effort, keep improving.' : 'Keep practicing — you\'ll get there!'}
        </p>
      </div>

      {/* Stats grid */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {[
          { label: 'Questions Attempted', value: data?.answered ?? '—', icon: <BookOpen className="w-4 h-4" /> },
          { label: 'Correct', value: data?.correct_count ?? '—', icon: <CheckCircle2 className="w-4 h-4" /> },
          { label: 'Time Taken', value: `${mins}m ${secs}s`, icon: <Clock className="w-4 h-4" /> },
          { label: 'Avg/Question', value: `${avgSecs}s`, icon: <Target className="w-4 h-4" /> },
        ].map((s) => (
          <div key={s.label} className="card p-4 text-center">
            <div className='flex justify-center items-center gap-2'>
              <div className="text-primary-500">{s.icon}</div>
              <p className="text-lg font-bold text-gray-900">{s.value}</p>
            </div>
            <p className="text-xs text-gray-400">{s.label}</p>
          </div>
        ))}
      </div>

      {/* AI summary */}
      {data?.ai_summary && (
        <div className="card p-5">
          <div className="flex items-center gap-2 mb-3 pb-3 border-b border-gray-100">
            <div className="w-8 h-8 rounded-xl bg-primary-100 flex items-center justify-center text-primary-600 shrink-0">
              <Sparkles className="w-4 h-4" />
            </div>
            <div>
              <h2 className="font-bold text-gray-900 text-base">AI Analysis</h2>
              <p className="text-xs text-gray-500">Evaluation breakdown &amp; performance feedback</p>
            </div>
          </div>
          {/* Topics covered */}
          {data.responses && data.responses.length > 0 && (() => {
            const topics = [...new Set(data.responses.map((r) => r.topic).filter(Boolean))]
            return topics.length > 0 ? (
              <div className="mb-4">
                <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-2">Topics Covered</p>
                <div className="flex flex-wrap gap-1.5">
                  {topics.map((t) => (
                    <span key={t} className="px-2.5 py-0.5 text-xs font-medium bg-primary-50 text-primary-700 border border-primary-100 rounded-full">
                      {t}
                    </span>
                  ))}
                </div>
              </div>
            ) : null
          })()}
          <AiReportFormatter text={data.ai_summary} />
        </div>
      )}


      {/* Detailed Question Review Action Card */}
      <div className="card p-5 border border-primary-100 bg-gradient-to-br from-white to-primary-50/10">
        <div className="flex flex-col sm:flex-row items-center justify-between gap-3">
          <div className="space-y-0.5 text-center sm:text-left">
            <h2 className="font-bold text-gray-900 flex items-center justify-center sm:justify-start gap-1.5">
              <BookOpen className="w-4 h-4 text-primary-500" />
              Detailed Question Review
            </h2>
            <p className="text-sm text-gray-500">
              Step through each question, check options and read explanations.
            </p>
          </div>
          <Link
            to={STUDENT_ROUTES.testQuestionReview(planId!, testId!)}
            state={{ session_id: sessionId, returnTo }}
            className="btn-primary shrink-0 w-full sm:w-auto px-6 py-2 flex items-center justify-center gap-2 font-bold"
          >
            Start Review →
          </Link>
        </div>
      </div>
    </div>
  )
}


