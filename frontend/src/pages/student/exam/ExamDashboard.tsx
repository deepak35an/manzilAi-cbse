import { useParams, useNavigate, Link } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { BookOpen, Clock, Target, BarChart3, Zap, ChevronRight } from 'lucide-react'
import { getStudentDashboard, getStudentPerformance } from '@/services/studentApi'
import MetricCard from '@/components/ui/MetricCard'
import ProgressBar from '@/components/ui/ProgressBar'
import PerformanceChart from '@/components/ui/PerformanceChart'
import TestCard from '@/components/ui/TestCard'
import { STUDENT_ROUTES } from '@/lib/constants'
import { cn } from '@/lib/utils'

export default function ExamDashboard() {
  const { id: planId } = useParams<{ id: string }>()
  const navigate = useNavigate()

  const { data, isLoading } = useQuery({
    queryKey: ['dashboard', planId],
    queryFn: () => getStudentDashboard(planId),
    enabled: !!planId,
  })

  const { data: perfData } = useQuery({
    queryKey: ['performance', planId],
    queryFn: () => getStudentPerformance(planId),
    enabled: !!planId,
  })

  const topicWise = data?.plan_type === 'TOPIC_WISE_TESTS'
  const progressPct = data?.current_week && data?.total_weeks
    ? Math.round(((data.current_week - 1) / data.total_weeks) * 100)
    : 0

  const chartData = data?.recent_results?.slice().reverse().map((r, i) => ({
    label: r.test_name
      ? r.test_name.replace('Test ', 'T')   // "W-3 Test 2" → "W-3 T2"
      : `Test ${i + 1}`,
    score: r.max_score > 0 ? Math.round((r.total_score / r.max_score) * 100) : 0,
  })) || []

  const strengths = perfData?.strengths || []
  const weaknesses = perfData?.weaknesses || []

  if (isLoading) {
    return (
      <div className="space-y-4 animate-pulse">
        <div className="skeleton h-24 w-full" />
        <div className="grid grid-cols-3 gap-4">
          {[1,2,3].map((i) => <div key={i} className="skeleton h-24" />)}
        </div>
        <div className="skeleton h-48" />
      </div>
    )
  }

  return (
    <div className="space-y-6 animate-fade-in">
      {/* Welcome header */}
      <div className="card p-6">
        <div className="flex items-start justify-between">
          <div className="flex-1">
            <div className="flex items-center gap-2 mb-1 flex-wrap">
              <h1 className="text-xl font-bold text-gray-900">
                {(data?.exam_name || 'Exam').replace('_CHEMISTRY', '').replace('_BIOLOGY', '').replace('_PHYSICS', '').replace('_MATHEMATICS', '').replace('_ENGLISH', '')} Preparation
              </h1>
              {data?.is_cuet && (
                <span className="text-xs font-semibold bg-primary-100 text-primary-700 px-2.5 py-0.5 rounded-full">
                  Multi-Subject CUET
                </span>
              )}
            </div>
            <p className="text-sm text-gray-500 mb-3">
              {topicWise ? 'Topic' : 'Week'} {data?.current_week ?? 1} of {data?.total_weeks ?? 0}
            </p>

            {/* CUET Subject Badges */}
            {data?.is_cuet && (data?.cuet_subjects || []).length > 0 && (
              <div className="flex items-center gap-1.5 mb-4 flex-wrap">
                <span className="text-xs font-semibold text-gray-400">Enrolled Subjects:</span>
                {data.cuet_subjects?.map((s: any) => (
                  <span key={s.plan_id} className="text-xs bg-gray-100 text-gray-700 font-medium px-2.5 py-1 rounded-lg">
                    {s.label}
                  </span>
                ))}
              </div>
            )}


            <ProgressBar
              value={progressPct}
              label={`${progressPct}% Completed`}
            />
          </div>
        </div>
      </div>


      {/* Metric cards */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <MetricCard
          title="Total Tests"
          value={data?.total_tests ?? 0}
          icon={BookOpen}
          color="primary"
        />
        <MetricCard
          title="Average Score"
          value={data?.avg_score ? `${data.avg_score.toFixed(1)}%` : '—'}
          icon={Target}
          color="success"
        />
        <MetricCard
          title="Upcoming Test"
          value={data?.upcoming_test?.label ?? `W-${data?.current_week ?? '—'} Test 1`}
          // subtitle={data?.upcoming_test?.topics?.slice(0, 2).join(', ') || ''}
          icon={Clock}
          color="warning"
        />
      </div>

      {/* Continue preparation */}
      {data?.upcoming_test && (
        <div className="card p-6 border-2 border-primary-100 bg-primary-50/40">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-semibold text-primary-600 uppercase tracking-wider mb-1">Continue Preparation</p>
              <p className="text-lg text-gray-900 font-bold">
                {topicWise ? 'Current topic:' : "This week's topics:"}{' '}
                <span className="text-gray-500 text-base font-normal">
                  {data.upcoming_test.topics.length > 0 ? data.upcoming_test.topics.join(', ') : '—'}
                </span>
              </p>
            </div>
            <Link
              to={STUDENT_ROUTES.testQuiz(planId!, data.upcoming_test.week_number)}
              state={{ test_number: data.upcoming_test.test_number ?? 1 }}
              className="btn-primary btn-md flex items-center gap-2 shrink-0"
            >
              <Zap className="w-4 h-4" />
              Start
            </Link>
          </div>
        </div>
      )}


      {/* Performance chart */}
      <div className="card p-6">
        <div className="flex items-center justify-between mb-4">
          <h2 className="font-semibold text-gray-900">Recent Performance Trend</h2>
        </div>
        <PerformanceChart data={chartData} dataKey="score" height={180} />
      </div>

     
      {/* Topic strength preview */}
      {(strengths.length > 0 || weaknesses.length > 0) && (
        <div className="card p-6">
          <div className="flex items-center justify-between mb-4">
            <h2 className="font-semibold text-gray-900">Topic Strength</h2>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            {strengths.length > 0 && (
              <div>
                <p className="text-xs font-semibold text-success-700 uppercase tracking-wider mb-2">Strong</p>
                <div className="space-y-2">
                  {strengths.map((s) => (
                    <div key={s.topic} className="flex items-center justify-between">
                      <span className="text-sm text-gray-700 truncate">{s.topic}</span>
                      <span className="badge-success ml-2 shrink-0">{s.avg_score.toFixed(1)}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}
            {weaknesses.length > 0 && (
              <div>
                <p className="text-xs font-semibold text-danger-600 uppercase tracking-wider mb-2">Needs Work</p>
                <div className="space-y-2">
                  {weaknesses.map((w) => (
                    <div key={w.topic} className="flex items-center justify-between">
                      <span className="text-sm text-gray-700 truncate">{w.topic}</span>
                      <span className="badge-danger ml-2 shrink-0">{w.avg_score.toFixed(1)}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
          <Link
            to={STUDENT_ROUTES.strengthWeakness(planId!)}
            className="btn-outline btn-sm mt-4 w-full flex items-center justify-center gap-2"
          >
            <BarChart3 className="w-4 h-4" />
            View Full Analysis
          </Link>
        </div>
      )}

      {/* Recent evaluations */}
      {data?.recent_results && data.recent_results.length > 0 && (
        <div className="card p-6">
          <div className="flex items-center justify-between mb-4">
            <h2 className="font-semibold text-gray-900">Recent Evaluations</h2>
            <Link
              to={STUDENT_ROUTES.examHistory(planId!)}
              className="text-sm text-primary-600 hover:underline flex items-center gap-1"
            >
              More Records <ChevronRight className="w-3.5 h-3.5" />
            </Link>
          </div>
          <div className="space-y-3">
            {data.recent_results.slice(0, 3).map((r) => (
              <TestCard key={r.id} result={r} planId={planId!} compact />
            ))}
          </div>
        </div>
      )}

      {!data?.total_tests && (
        <div className="card p-10 text-center">
          <BookOpen className="w-12 h-12 text-gray-300 mx-auto mb-3" />
          <p className="text-gray-500 font-medium">No tests taken yet</p>
          <p className="text-sm text-gray-400 mt-1 mb-5">
            Start your {topicWise ? 'first topic' : 'Week 1'} evaluation to see your performance here.
          </p>
          <Link
            to={STUDENT_ROUTES.examPlan(planId!)}
            className="btn-primary btn-md"
          >
            Go to Study Plan
          </Link>
        </div>
      )}
    </div>
  )
}
