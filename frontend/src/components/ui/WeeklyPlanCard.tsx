import { Link } from 'react-router-dom'
import { Lock, CheckCircle2, PlayCircle, Eye, ChevronDown, ChevronUp, RotateCcw } from 'lucide-react'
import { useState } from 'react'
import { cn } from '@/lib/utils'
import { STUDENT_ROUTES } from '@/lib/constants'
import type { WeekPlan, WeekTest } from '@/types/exam'

interface WeeklyPlanCardProps {
  week: WeekPlan
  planId: string
  isCurrent: boolean
  topicWise?: boolean
}

function TestRow({ test, planId, week, testsPerWeek, topicWise }: { test: WeekTest; planId: string; week: WeekPlan; testsPerWeek: number; topicWise?: boolean }) {
  const isDone = test.status === 'completed'
  const isActive = test.status === 'current'
  const isLocked = test.status === 'locked'

  return (
    <div className={cn(
      'flex items-center justify-between py-2.5 px-3 rounded-lg border',
      isDone ? 'bg-success-50/60 border-success-200' :
      isActive ? 'bg-primary-50/60 border-primary-200' :
      'bg-gray-50 border-gray-200 opacity-60'
    )}>
      <div className="flex items-center gap-2.5">
        {isDone ? (
          <CheckCircle2 className="w-4 h-4 text-success-600 shrink-0" />
        ) : isLocked ? (
          <Lock className="w-3.5 h-3.5 text-gray-400 shrink-0" />
        ) : (
          <PlayCircle className="w-4 h-4 text-primary-600 shrink-0" />
        )}
        <span className={cn(
          'text-sm font-medium',
          isDone ? 'text-success-700' :
          isActive ? 'text-primary-700' :
          'text-gray-400'
        )}>
          {topicWise ? 'Full Topic Test' : `Test ${test.test_number}`}
          {!topicWise && testsPerWeek > 1 && <span className="text-xs font-normal text-gray-400 ml-1">of {testsPerWeek}</span>}
        </span>
      </div>

      {isDone && test.session_id ? (
        <div className="flex items-center gap-1.5">
          <Link
            to={STUDENT_ROUTES.testReview(planId, week.week)}
            state={{ session_id: test.session_id, returnTo: STUDENT_ROUTES.examPlan(planId) }}
            className="btn-outline btn-sm flex items-center gap-1 text-xs"
          >
            <Eye className="w-3 h-3" />
            Review
          </Link>
          <Link
            to={STUDENT_ROUTES.testQuiz(planId, week.week)}
            state={{ test_number: test.test_number, tests_per_week: testsPerWeek }}
            className="btn-outline btn-sm flex items-center gap-1 text-xs text-warning-600 border-warning-300 hover:bg-warning-50"
          >
            <RotateCcw className="w-3 h-3" />
            Retake
          </Link>
        </div>
      ) : isActive ? (
        <Link
          to={STUDENT_ROUTES.testQuiz(planId, week.week)}
          state={{ test_number: test.test_number, tests_per_week: testsPerWeek }}
          className="btn-primary btn-sm flex items-center gap-1 text-xs"
        >
          <PlayCircle className="w-3 h-3" />
          Start
        </Link>
      ) : (
        <span className="text-xs text-gray-400 font-medium">Locked</span>
      )}
    </div>
  )
}

export default function WeeklyPlanCard({ week, planId, isCurrent, topicWise }: WeeklyPlanCardProps) {
  const [expanded, setExpanded] = useState(isCurrent)
  const isLocked = week.status === 'locked'
  const isCompleted = week.status === 'completed'
  const testsPerWeek = week.tests_per_week ?? (topicWise ? 1 : 3)
  const tests = week.tests ?? []
  const topicTitle = week.topics?.[0]

  // Compute overall progress label: e.g. "2/3 tests done"
  const doneCount = tests.filter((t) => t.status === 'completed').length

  return (
    <div className={cn(
      'card overflow-hidden transition-all',
      isCurrent && 'ring-2 ring-primary-500 ring-offset-2',
      isLocked && 'opacity-70'
    )}>
      <button
        onClick={() => (topicWise || !isLocked) && setExpanded((p) => !p)}
        className={cn('w-full flex items-center justify-between p-4', (topicWise || !isLocked) && 'hover:bg-gray-50')}
      >
        <div className="flex items-center gap-3">
          {/* Status icon */}
          <div className={cn(
            'w-9 h-9 rounded-full flex items-center justify-center shrink-0',
            isCompleted ? 'bg-success-100' :
            isCurrent ? 'bg-primary-100' :
            'bg-gray-100'
          )}>
            {isCompleted ? (
              <CheckCircle2 className="w-5 h-5 text-success-600" />
            ) : isLocked ? (
              <Lock className="w-4 h-4 text-gray-400" />
            ) : (
              <PlayCircle className="w-5 h-5 text-primary-600" />
            )}
          </div>
          <div className="text-left">
            <p className={cn(
              'font-semibold text-sm',
              isCompleted ? 'text-success-700' :
              isCurrent ? 'text-primary-700' :
              isLocked ? 'text-gray-400' :
              'text-gray-900'
            )}>
              {topicWise
                ? (topicTitle || `Topic ${week.week}`)
                : `Week ${week.week}`}
              {isCurrent && <span className="ml-2 badge-primary">Current</span>}
              {isCompleted && <span className="ml-2 badge-success">Done</span>}
            </p>

            {(week.subject || (!topicWise && doneCount > 0)) && (
              <p className="text-xs text-gray-400 mt-0.5">
                {week.subject && <span className="badge-gray">{week.subject}</span>}
                {topicWise && week.priority && (
                  <span className="ml-2 badge-gray">{week.priority}</span>
                )}
                {!topicWise && !isCompleted && !isLocked && doneCount > 0 && (
                  <span className="ml-2 text-primary-500 font-medium">{doneCount}/{testsPerWeek} tests done</span>
                )}
              </p>
            )}
          </div>
        </div>
        {(topicWise || !isLocked) && (
          expanded ? <ChevronUp className="w-4 h-4 text-gray-400" /> : <ChevronDown className="w-4 h-4 text-gray-400" />
        )}
      </button>

      {expanded && (topicWise || !isLocked) && (
        <div className="px-4 pb-4 border-t border-gray-100 pt-3 space-y-3">
          {/* Topics list (week-wise only; topic-wise uses the card title) */}
          {!topicWise && week.topics.length > 0 && (
            <div>
              <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-2">Topics</p>
              <div className="flex flex-wrap gap-1.5">
                {week.topics.map((t, idx) => (
                  <span key={`${t}-${idx}`} className="badge-gray">{t}</span>
                ))}
              </div>
            </div>
          )}
          {/* Subtopics list */}
          {week.subtopics && week.subtopics.length > 0 && (
            <div>
              <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-2">Subtopics</p>
              <div className="flex flex-wrap gap-1.5">
                {week.subtopics.map((s, idx) => (
                  <span key={`${s}-${idx}`} className="px-2 py-0.5 text-xs font-medium bg-primary-50/50 text-primary-700 border border-primary-100/70 rounded-lg">
                    {s}
                  </span>
                ))}
              </div>
            </div>
          )}

          {/* Sub-test rows */}
          {tests.length > 0 ? (
            <div className="space-y-2">
              <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider">Tests</p>
              {tests.map((t) => (
                <TestRow
                  key={t.test_number}
                  test={t}
                  planId={planId}
                  week={week}
                  testsPerWeek={testsPerWeek}
                  topicWise={topicWise}
                />
              ))}
            </div>
          ) : (
            /* Fallback for old data without tests array */
            <div className="flex gap-2">
              {isCompleted ? (
                <Link
                  to={STUDENT_ROUTES.testReview(planId, week.week)}
                  state={{ session_id: week.session_id, returnTo: STUDENT_ROUTES.examPlan(planId) }}
                  className="btn-outline btn-sm flex items-center gap-1.5"
                >
                  <Eye className="w-3.5 h-3.5" />
                  Review
                </Link>
              ) : (
                <Link
                  to={STUDENT_ROUTES.testQuiz(planId, week.week)}
                  state={{ test_number: 1, tests_per_week: testsPerWeek }}
                  className="btn-primary btn-sm flex items-center gap-1.5"
                >
                  <PlayCircle className="w-3.5 h-3.5" />
                  Start Evaluation
                </Link>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  )
}
