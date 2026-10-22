import { Link } from 'react-router-dom'
import { Clock, RotateCcw, Eye } from 'lucide-react'
import { cn } from '@/lib/utils'
import { formatDate } from '@/lib/utils'
import { STUDENT_ROUTES } from '@/lib/constants'

interface TestCardProps {
  result: {
    id: string
    session_id: string
    total_score: number
    max_score: number
    theta_final: number
    created_at: string
    exam_title?: string
    test_name?: string
    week_number?: number
    test_number?: number
  }
  planId: string
  compact?: boolean
}

export default function TestCard({ result, planId, compact }: TestCardProps) {
  const pct = result.max_score > 0 ? Math.round((result.total_score / result.max_score) * 100) : 0
  const label = result.test_name || result.exam_title || 'Evaluation'
  const weekNum = result.week_number ?? 0

  return (
    <div className={cn('card p-4 flex items-center justify-between gap-4', compact && 'py-3')}>
      <div className="flex items-center gap-3 min-w-0">
        <div className={cn(
          'w-10 h-10 rounded-xl flex items-center justify-center shrink-0 text-sm font-bold',
          pct >= 80 ? 'bg-success-100 text-success-700' :
          pct >= 60 ? 'bg-warning-100 text-warning-600' :
          'bg-danger-100 text-danger-600'
        )}>
          {pct}%
        </div>
        <div className="min-w-0">
          <p className="font-semibold text-sm text-gray-900 truncate">{label}</p>
          <p className="text-xs text-gray-400 flex items-center gap-1 mt-0.5">
            <Clock className="w-3 h-3" />
            {formatDate(result.created_at)}
          </p>
        </div>
      </div>
      <div className="flex gap-2 shrink-0">
        {weekNum > 0 && (
          <>
            <Link
              to={STUDENT_ROUTES.testReview(planId, weekNum)}
              state={{ session_id: result.session_id, returnTo: STUDENT_ROUTES.examPlan(planId) }}
              className="btn-outline btn-sm flex items-center gap-1.5"
            >
              <Eye className="w-3.5 h-3.5" />
              Review
            </Link>
            <Link
              to={STUDENT_ROUTES.testQuiz(planId, weekNum)}
              state={{ test_number: result.test_number ?? 1 }}
              className="btn-outline btn-sm flex items-center gap-1.5"
            >
              <RotateCcw className="w-3.5 h-3.5" />
              Retake
            </Link>
          </>
        )}
      </div>
    </div>
  )
}
