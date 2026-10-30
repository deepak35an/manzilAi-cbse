import { useState, useEffect } from 'react'
import { useParams } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { getPlanStatus } from '@/services/quizApi'
import WeeklyPlanCard from '@/components/ui/WeeklyPlanCard'
import { BookOpen, ChevronDown } from 'lucide-react'

export default function ExamPlan() {
  const { id: routePlanId } = useParams<{ id: string }>()
  const [activePlanId, setActivePlanId] = useState<string>(routePlanId || '')

  useEffect(() => {
    if (routePlanId && !activePlanId) {
      setActivePlanId(routePlanId)
    }
  }, [routePlanId, activePlanId])

  const { data: planStatus, isLoading } = useQuery({
    queryKey: ['plan-status', activePlanId || routePlanId],
    queryFn: () => getPlanStatus(activePlanId || routePlanId!),
    enabled: !!(activePlanId || routePlanId),
  })

  if (isLoading) {
    return (
      <div className="space-y-3 animate-pulse">
        {[1,2,3,4,5].map((i) => <div key={i} className="skeleton h-16" />)}
      </div>
    )
  }

  const weeks = planStatus?.weeks || []
  const currentWeek = planStatus?.current_week ?? 1
  const isCuet = planStatus?.is_cuet || planStatus?.exam?.startsWith('CUET_')
  const cuetSubjects = planStatus?.cuet_subjects || []
  const topicWise = planStatus?.plan_type === 'TOPIC_WISE_TESTS'
  const unitLabel = topicWise ? 'topics' : 'weeks'
  const completedCount = weeks.filter((w) => w.status === 'completed').length
  const currentUnitLabel = topicWise
    ? `${completedCount}/${planStatus?.total_weeks ?? 0} topics done`
    : `Week ${currentWeek}`

  return (
    <div className="space-y-6 animate-fade-in">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-xl font-bold text-gray-900">
            {topicWise ? 'Topic-wise Tests' : 'Full Study Plan'}
          </h1>
          <p className="text-sm text-gray-500 mt-0.5">
            {planStatus?.exam} · {completedCount} of {planStatus?.total_weeks ?? 0} {unitLabel} completed
            {topicWise ? ' · pick any topic · 20 questions each' : ''}
          </p>
        </div>
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-1.5 px-3 py-1.5 bg-primary-50 text-primary-700 rounded-xl text-sm font-semibold shrink-0">
            <BookOpen className="w-4 h-4" />
            {currentUnitLabel}
          </div>
        </div>
      </div>

      {/* CUET Subject Dropdown Selector */}
      {isCuet && cuetSubjects.length > 0 && (
        <div className="card p-4 border border-primary-100 bg-primary-50/20">
          <label className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-2 block">
            Select Subject Plan
          </label>
          <div className="relative">
            <select
              value={activePlanId || routePlanId}
              onChange={(e) => setActivePlanId(e.target.value)}
              className="w-full appearance-none border border-gray-200 rounded-xl px-4 py-2.5 text-sm font-semibold text-gray-800 bg-white focus:outline-none focus:ring-2 focus:ring-primary-300 pr-10 cursor-pointer"
            >
              {cuetSubjects.map((s: any) => (
                <option key={s.plan_id} value={s.plan_id}>
                  {s.label} ({s.exam})
                </option>
              ))}
            </select>
            <ChevronDown className="w-4 h-4 text-gray-400 absolute right-3 top-3.5 pointer-events-none" />
          </div>
        </div>
      )}

      {/* Unit list (weeks or topics) */}
      {weeks.length === 0 ? (
        <div className="card p-10 text-center">
          <p className="text-gray-400">Plan not loaded yet. Try refreshing.</p>
        </div>
      ) : (
        <div className="space-y-2">
          {weeks.map((week) => (
            <WeeklyPlanCard
              key={week.week}
              week={week}
              planId={activePlanId || routePlanId!}
              isCurrent={!topicWise && week.week === currentWeek}
              topicWise={topicWise}
            />
          ))}
        </div>
      )}
    </div>
  )
}
