import { useQuery } from '@tanstack/react-query'
import { useNavigate } from 'react-router-dom'
import { Award, Target, TrendingUp, BarChart3 } from 'lucide-react'
import { getStudentDashboard, getStudentPerformance, type PerformanceData } from '../../services/studentApi'
import type { DashboardData } from '../../types/analytics'
import ScoreCard from '../../components/analytics/ScoreCard'
import ThetaChart from '../../components/analytics/ThetaChart'
import TopicRadar from '../../components/analytics/TopicRadar'
import PerformanceTable from '../../components/analytics/PerformanceTable'
import StrengthsWeaknesses from '../../components/analytics/StrengthsWeaknesses'
import Button from '../../components/ui/Button'
import Spinner from '../../components/ui/Spinner'

export default function StudentDashboard() {
  const navigate = useNavigate()

  const { data, isLoading } = useQuery<DashboardData>({
    queryKey: ['student-dashboard'],
    queryFn: () => getStudentDashboard(),
  })

  const { data: perfData, isLoading: perfLoading } = useQuery<PerformanceData>({
    queryKey: ['student-performance'],
    queryFn: () => getStudentPerformance(),
    retry: false,
  })

  if (isLoading) return <div className="flex justify-center py-20"><Spinner size="lg" /></div>

  const thetaData = data?.recent_results.map((r: any) => ({
    date: r.created_at.slice(0, 10),
    theta: r.theta_final,
    exam: r.exam_title,
  })).reverse() || []

  const radarData = data?.topic_performance.map((t) => ({
    topic: t.subject,
    score: t.avg_theta * 5 + 5,
  })) || []

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-gray-900">Dashboard</h1>
        <Button onClick={() => navigate('/student/evaluate')}>Start Evaluation</Button>
      </div>

      {/* Stat cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <ScoreCard title="Total Tests" value={data?.total_tests || 0} icon={BarChart3} />
        <ScoreCard title="Average Score" value={data?.avg_score?.toFixed(1) || '0'} icon={Award} />
        <ScoreCard title="Current Ability" value={data?.current_theta?.toFixed(2) || '0.00'} icon={Target} />
        <ScoreCard title="Tests This Week" value={data?.recent_results.length || 0} icon={TrendingUp} />
      </div>

      {/* Strengths & Weaknesses card — full width */}
      <StrengthsWeaknesses
        strengths={perfData?.strengths ?? []}
        weaknesses={perfData?.weaknesses ?? []}
        isLoading={perfLoading}
      />

      {/* Charts row */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <ThetaChart data={thetaData} />
        <TopicRadar data={radarData} />
      </div>

      <PerformanceTable
        results={data?.recent_results || []}
        onViewDetails={(id) => navigate(`/student/results/${id}`)}
      />
    </div>
  )
}

