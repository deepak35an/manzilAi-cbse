import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Users, FileCheck, CheckCircle2 } from 'lucide-react'
import ScoreCard from '../../components/analytics/ScoreCard'
import ExamFilter from '../../components/org/ExamFilter'
import StudentsPerBatchChart from '../../components/org/StudentsPerBatchChart'
import AvgScorePerBatchChart from '../../components/org/AvgScorePerBatchChart'
import ScoreDistributionChart from '../../components/org/ScoreDistributionChart'
import WeeklyActiveUsersChart from '../../components/org/WeeklyActiveUsersChart'
import OrgTopicBreakdown from '../../components/org/OrgTopicBreakdown'
import Spinner from '../../components/ui/Spinner'
import { getOrgDashboard } from '../../services/orgApi'

export default function OrgDashboard() {
  const [selectedExam, setSelectedExam] = useState<string | undefined>(undefined)

  const { data, isLoading } = useQuery({
    queryKey: ['org-dashboard', selectedExam],
    queryFn: () => getOrgDashboard(selectedExam),
  })

  // Once data arrives and no exam is selected yet, sync to server's default
  const effectiveExam = selectedExam || data?.selected_exam || null

  if (isLoading && !data) {
    return (
      <div className="flex justify-center py-20">
        <Spinner size="lg" />
      </div>
    )
  }

  const hasGraphData = data && data.students_per_batch.length > 0

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold text-gray-900">Organization Dashboard</h1>

      {/* ── Summary Cards ───────────────────────────────────────────── */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <ScoreCard
          title="Total Students"
          value={data?.total_students || 0}
          icon={Users}
        />
        <ScoreCard
          title="Total Tests Taken"
          value={data?.total_tests || 0}
          icon={FileCheck}
        />
        <ScoreCard
          title="Completion Rate"
          value={`${data?.completion_rate || 0}%`}
          icon={CheckCircle2}
        />
      </div>

      {/* ── Exam Filter Dropdown ────────────────────────────────────── */}
      <ExamFilter
        exams={data?.available_exams || []}
        selected={effectiveExam}
        onChange={(exam) => setSelectedExam(exam)}
      />

      {/* ── Graphs Section ──────────────────────────────────────────── */}
      {hasGraphData ? (
        <div className="space-y-6">
          {/* Row 1: Two bar charts side by side */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <StudentsPerBatchChart data={data.students_per_batch} />
            <AvgScorePerBatchChart data={data.avg_score_per_batch} />
          </div>

          {/* Row 2: Score distribution (full width) */}
          <ScoreDistributionChart data={data.score_distribution} />

          {/* Row 3: Weekly active users (full width) */}
          <WeeklyActiveUsersChart data={data.weekly_active_users} />
        </div>
      ) : (
        <div className="text-center py-16 text-gray-400">
          <p className="text-lg font-medium">No analytics charts available</p>
          <p className="text-sm mt-1">Students need to register for an exam and take tests to see chart analytics here.</p>
        </div>
      )}

      {/* ── Organization Topic Breakdown Section ──────────────────────── */}
      <div className="pt-4 border-t border-gray-100">
        <OrgTopicBreakdown exam={effectiveExam ?? undefined} compact={true} />
      </div>
    </div>
  )
}

