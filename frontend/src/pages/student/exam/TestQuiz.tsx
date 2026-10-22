import { useParams, useNavigate, Link, useLocation } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { getSessionMeta, startWeeklyTest } from '@/services/quizApi'
import { useMutation } from '@tanstack/react-query'
import { useState } from 'react'
import { STUDENT_ROUTES } from '@/lib/constants'
import { BookOpen, Clock, AlertTriangle, CheckSquare, ArrowLeft, Play } from 'lucide-react'
import { cn } from '@/lib/utils'

export default function TestQuiz() {
  const { id: planId, testId } = useParams<{ id: string; testId: string }>()
  const navigate = useNavigate()
  const location = useLocation()
  const routeState = location.state as { test_number?: number; tests_per_week?: number } | null
  const [agreed, setAgreed] = useState(false)
  const weekNumber = parseInt(testId || '1', 10)
  const testNumber = routeState?.test_number ?? 1
  const testsPerWeek = routeState?.tests_per_week ?? 3

  const { data: meta, isLoading } = useQuery({
    queryKey: ['session-meta', planId, weekNumber, testNumber],
    queryFn: () => getSessionMeta(planId!, weekNumber, testNumber),
    enabled: !!planId && !isNaN(weekNumber),
  })

  const startMutation = useMutation({
    mutationFn: () => startWeeklyTest({ plan_id: planId!, week_number: weekNumber, exam: meta?.exam || '', test_number: testNumber }),
    onSuccess: (data) => {
      navigate(STUDENT_ROUTES.testAttempt(planId!, testId!), {
        state: { session_id: data.session_id, first_question: data.question, total: data.total_questions, test_number: testNumber },
      })
    },
  })

  if (isLoading) {
    return <div className="space-y-4 animate-pulse"><div className="skeleton h-64" /></div>
  }

  return (
    <div className="max-w-2xl mx-auto my-8 space-y-6 animate-fade-in">
      {/* Back */}
      <Link
        to={STUDENT_ROUTES.examPlan(planId!)}
        className="flex items-center gap-2 text-sm text-gray-500 hover:text-gray-900"
      >
        <ArrowLeft className="w-4 h-4" />
        Back to Plan
      </Link>

      {/* Header */}
      <div className="card p-6">
        <div className="flex items-start gap-4">
          <div className="w-12 h-12 bg-primary-100 rounded-2xl flex items-center justify-center shrink-0">
            <BookOpen className="w-6 h-6 text-primary-600" />
          </div>
          <div>
            <p className="text-xs text-gray-400 uppercase tracking-wide font-semibold">
            W-{weekNumber} Test {testNumber} of {testsPerWeek}
          </p>
            <h1 className="text-xl font-bold text-gray-900 mt-0.5">{meta?.exam || 'Exam'} Preparation</h1>
            <div className="flex flex-wrap gap-1.5 mt-2">
              {(meta?.topics || []).map((t) => (
                <span key={t} className="badge-primary">{t}</span>
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-3 gap-3">
        {[
          { label: 'Questions', value: meta?.question_count ?? 0, icon: <CheckSquare className="w-4 h-4" /> },
          { label: 'Marks Each', value: `+${meta?.marks_per_question || 1}`, icon: <BookOpen className="w-4 h-4" /> },
          { label: 'Negative', value: meta?.negative_marking ? 'Yes' : 'No', icon: <AlertTriangle className="w-4 h-4" /> },
        ].map((s) => (
          <div key={s.label} className="card p-4 text-center">
            <div className="text-primary-500 flex justify-center mb-1">{s.icon}</div>
            <p className="text-lg font-bold text-gray-900">{s.value}</p>
            <p className="text-xs text-gray-400">{s.label}</p>
          </div>
        ))}
      </div>

      {/* Rules */}
      <div className="card p-6 space-y-3">
        <h2 className="font-semibold text-gray-900 flex items-center gap-2">
          <AlertTriangle className="w-4 h-4 text-warning-600" /> Instructions &amp; Rules
        </h2>
        <ul className="space-y-2 text-sm text-gray-600">
          {[
            'Questions are presented one at a time.',
            'You may either answer or skip the current question.',
            'Once you move on, you cannot return to previous questions.',
            'You cannot access future questions without first answering or skipping the current one.',
            'The timer records total time taken — there is no countdown.',
            'You will see your results immediately after completing the test.',
          ].map((rule, i) => (
            <li key={i} className="flex items-start gap-2">
              <span className="w-5 h-5 rounded-full bg-primary-50 text-primary-600 text-xs font-bold flex items-center justify-center shrink-0 mt-0.5">
                {i + 1}
              </span>
              {rule}
            </li>
          ))}
        </ul>
      </div>

      {/* Agreement + Start */}
      <div className="card p-5">
        <label className="flex items-start gap-3 cursor-pointer">
          <input
            type="checkbox"
            className="mt-0.5 w-4 h-4 rounded text-primary-600"
            checked={agreed}
            onChange={(e) => setAgreed(e.target.checked)}
          />
          <span className="text-sm text-gray-700">
            I have read and understood the instructions and rules above. I am ready to begin the test.
          </span>
        </label>
        <button
          onClick={() => startMutation.mutate()}
          disabled={!agreed || startMutation.isPending}
          className={cn(
            'btn-primary mt-4 w-full flex items-center justify-center gap-2 py-3',
            (!agreed || startMutation.isPending) && 'opacity-50 cursor-not-allowed'
          )}
        >
          <Play className="w-4 h-4" />
          {startMutation.isPending ? 'Starting…' : 'Start Test'}
        </button>
        {startMutation.isError && (
          <p className="text-sm text-danger-600 mt-2 text-center">Failed to start test. Please try again.</p>
        )}
      </div>
    </div>
  )
}
