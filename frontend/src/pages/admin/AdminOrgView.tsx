import { useState } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import {
  Users,
  CheckCircle2,
  Trophy,
  ArrowLeft,
  TrendingUp,
  TrendingDown,
  BookOpen,
  ChevronRight,
  Calendar,
  Activity,
} from 'lucide-react'
import ScoreCard from '../../components/analytics/ScoreCard'
import ExamFilter from '../../components/org/ExamFilter'
import StudentsPerBatchChart from '../../components/org/StudentsPerBatchChart'
import AvgScorePerBatchChart from '../../components/org/AvgScorePerBatchChart'
import ScoreDistributionChart from '../../components/org/ScoreDistributionChart'
import WeeklyActiveUsersChart from '../../components/org/WeeklyActiveUsersChart'
import Spinner from '../../components/ui/Spinner'
import Button from '../../components/ui/Button'
import { getAdminOrgDashboard, getAdminOrgTopicBreakdown } from '../../services/adminApi'
import { getOrganizations } from '../../services/adminApi'
import { formatDate } from '../../lib/utils'
import Badge from '../../components/ui/Badge'

function TopicCard({
  topic,
}: {
  topic: { topic: string; subject: string; avg_score: number; attempts: number; student_count: number; level: string }
}) {
  const isStrong = topic.level === 'strong'
  const isWeak = topic.level === 'weak'

  return (
    <div
      className={`flex items-start gap-3 p-3 rounded-xl border text-sm ${
        isStrong
          ? 'bg-emerald-50 border-emerald-100'
          : isWeak
          ? 'bg-red-50 border-red-100'
          : 'bg-amber-50 border-amber-100'
      }`}
    >
      <div className="mt-0.5 shrink-0">
        {isStrong ? (
          <TrendingUp className="w-4 h-4 text-emerald-600" />
        ) : isWeak ? (
          <TrendingDown className="w-4 h-4 text-red-600" />
        ) : (
          <Activity className="w-4 h-4 text-amber-600" />
        )}
      </div>
      <div className="flex-1 min-w-0">
        <p className="font-semibold text-gray-900 truncate">{topic.topic}</p>
        <p className="text-xs text-gray-500 mt-0.5">{topic.subject}</p>
        <div className="flex items-center gap-3 mt-1.5 text-xs text-gray-500">
          <span className={`font-bold ${isStrong ? 'text-emerald-700' : isWeak ? 'text-red-600' : 'text-amber-600'}`}>
            {topic.avg_score.toFixed(1)} avg
          </span>
          <span>{topic.attempts} attempts</span>
          <span>{topic.student_count} students</span>
        </div>
      </div>
    </div>
  )
}

export default function AdminOrgView() {
  const { orgId } = useParams<{ orgId: string }>()
  const navigate = useNavigate()
  const [selectedExam, setSelectedExam] = useState<string | undefined>(undefined)

  const { data: orgs = [] } = useQuery({ queryKey: ['organizations'], queryFn: getOrganizations })
  const org = orgs.find((o) => o.id === orgId)

  const { data, isLoading } = useQuery({
    queryKey: ['admin-org-dashboard', orgId, selectedExam],
    queryFn: () => getAdminOrgDashboard(orgId!, selectedExam),
    enabled: !!orgId,
  })

  const effectiveExam = selectedExam || data?.selected_exam || null

  const { data: topicData } = useQuery({
    queryKey: ['admin-org-topic-breakdown', orgId, effectiveExam],
    queryFn: () => getAdminOrgTopicBreakdown(orgId!, effectiveExam ?? undefined),
    enabled: !!orgId,
  })

  if (isLoading && !data) {
    return (
      <div className="flex justify-center py-20">
        <Spinner size="lg" />
      </div>
    )
  }

  const hasGraphData = data && data.students_per_batch.length > 0
  const strengths = topicData?.strengths || []
  const weaknesses = topicData?.weaknesses || []
  const hasTopicData = strengths.length > 0 || weaknesses.length > 0

  // Org subscription badge
  const expiryDate = org?.valid_until ? new Date(org.valid_until) : null
  const isExpired = expiryDate ? expiryDate < new Date() : false
  const daysLeft = expiryDate ? Math.ceil((expiryDate.getTime() - Date.now()) / (1000 * 60 * 60 * 24)) : null

  return (
    <div className="space-y-6">
      {/* ── Header ───────────────────────────────────────────────────────── */}
      <div className="flex items-start justify-between gap-4">
        <div className="flex items-center gap-3">
          <Button
            variant="ghost"
            size="sm"
            onClick={() => navigate('/admin/organizations')}
            className="text-gray-500 hover:text-gray-800 -ml-2"
          >
            <ArrowLeft className="w-4 h-4 mr-1" />
            Back
          </Button>
        </div>
      </div>

      {/* ── Org Info Banner ───────────────────────────────────────────────── */}
      <div className="rounded-2xl border border-gray-100 bg-gradient-to-r from-primary-50 to-indigo-50 p-5 shadow-sm">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
          <div>
            <h1 className="text-2xl font-bold text-gray-900">{org?.name ?? 'Organization'}</h1>
            <div className="flex items-center gap-3 mt-1.5 text-sm text-gray-500">
              {org?.admin_phone && (
                <span className="flex items-center gap-1">
                  <span className="w-1.5 h-1.5 rounded-full bg-gray-400 inline-block" />
                  {org.admin_phone}
                </span>
              )}
              {org?.created_at && (
                <span className="flex items-center gap-1">
                  <Calendar className="w-3.5 h-3.5" />
                  Joined {formatDate(org.created_at)}
                </span>
              )}
            </div>
          </div>
          <div className="flex items-center gap-2 flex-wrap">
            {org && (
              <Badge variant={org.is_active ? 'success' : 'error'}>
                {org.is_active ? 'Active' : 'Inactive'}
              </Badge>
            )}
            {expiryDate && (
              <span
                className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg border text-xs font-medium ${
                  isExpired
                    ? 'bg-red-50 border-red-200 text-red-700'
                    : daysLeft !== null && daysLeft <= 30
                    ? 'bg-amber-50 border-amber-200 text-amber-700'
                    : 'bg-emerald-50 border-emerald-200 text-emerald-700'
                }`}
              >
                <Calendar className="w-3 h-3" />
                {isExpired
                  ? `Expired ${Math.abs(daysLeft!)}d ago`
                  : daysLeft === 0
                  ? 'Expires today'
                  : `Expires ${formatDate(org!.valid_until!)} (${daysLeft}d)`}
              </span>
            )}
          </div>
        </div>
      </div>

      {/* ── Summary Cards ─────────────────────────────────────────────────── */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <ScoreCard title="Total Students" value={data?.total_students || 0} icon={Users} />
        <ScoreCard
          title="Completion Rate"
          value={`${data?.completion_rate ?? 0}%`}
          icon={CheckCircle2}
        />
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5 flex items-center gap-4">
          <div className="w-10 h-10 rounded-xl bg-violet-50 flex items-center justify-center shrink-0">
            <Trophy className="w-5 h-5 text-violet-600" />
          </div>
          <div className="min-w-0">
            <p className="text-xs font-medium text-gray-500 uppercase tracking-wide">Most Attempted Exam</p>
            <p className="text-xl font-bold text-gray-900 truncate mt-0.5">
              {data?.most_attempted_exam ?? '—'}
            </p>
          </div>
        </div>
      </div>

      {/* ── Exam Filter ───────────────────────────────────────────────────── */}
      <ExamFilter
        exams={data?.available_exams || []}
        selected={effectiveExam}
        onChange={(exam) => setSelectedExam(exam)}
      />

      {/* ── Charts ────────────────────────────────────────────────────────── */}
      {hasGraphData ? (
        <div className="space-y-6">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <StudentsPerBatchChart data={data.students_per_batch} />
            <AvgScorePerBatchChart data={data.avg_score_per_batch} />
          </div>
          <ScoreDistributionChart data={data.score_distribution} />
          <WeeklyActiveUsersChart data={data.weekly_active_users} />
        </div>
      ) : (
        <div className="text-center py-16 bg-white rounded-2xl border border-gray-100 text-gray-400">
          <p className="text-lg font-medium">No chart data available</p>
          <p className="text-sm mt-1">Students need to register for exams and take tests to see analytics here.</p>
        </div>
      )}

      {/* ── Topic Breakdown ───────────────────────────────────────────────── */}
      <div className="pt-4 border-t border-gray-100 space-y-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <BookOpen className="w-5 h-5 text-primary-600" />
            <h2 className="text-lg font-semibold text-gray-900">Topic Performance</h2>
            {topicData && (
              <span className="text-xs text-gray-400 font-normal">
                ({topicData.total_students_with_data} students with data)
              </span>
            )}
          </div>
        </div>

        {hasTopicData ? (
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* Strengths */}
            <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5">
              <div className="flex items-center gap-2 mb-4">
                <TrendingUp className="w-4 h-4 text-emerald-600" />
                <h3 className="font-semibold text-emerald-700">Top Strengths</h3>
                <span className="ml-auto text-xs text-gray-400">{strengths.length} topics</span>
              </div>
              <div className="space-y-2">
                {strengths.map((t) => (
                  <TopicCard key={t.topic} topic={t} />
                ))}
                {strengths.length === 0 && (
                  <p className="text-sm text-gray-400 text-center py-4">No strong topics yet</p>
                )}
              </div>
            </div>

            {/* Weaknesses */}
            <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5">
              <div className="flex items-center gap-2 mb-4">
                <TrendingDown className="w-4 h-4 text-red-500" />
                <h3 className="font-semibold text-red-600">Top Weaknesses</h3>
                <span className="ml-auto text-xs text-gray-400">{weaknesses.length} topics</span>
              </div>
              <div className="space-y-2">
                {weaknesses.map((t) => (
                  <TopicCard key={t.topic} topic={t} />
                ))}
                {weaknesses.length === 0 && (
                  <p className="text-sm text-gray-400 text-center py-4">No weak topics identified</p>
                )}
              </div>
            </div>
          </div>
        ) : (
          <div className="text-center py-12 bg-white rounded-2xl border border-gray-100 text-gray-400">
            <p className="text-base font-medium">No topic performance data yet</p>
            <p className="text-sm mt-1">Students need to complete tests for topic data to appear.</p>
          </div>
        )}

        {/* ── CTA Banner ─────────────────────────────────────────────────────── */}
        <button
          onClick={() => navigate(`/admin/org/${orgId}/detail-topic-breakdown`)}
          className="group w-full mt-2 flex items-center justify-between gap-4 px-6 py-4 rounded-2xl bg-gradient-to-r from-primary-600 to-indigo-600 hover:from-primary-700 hover:to-indigo-700 active:from-primary-800 active:to-indigo-800 text-white shadow-md hover:shadow-lg transition-all duration-200"
        >
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-white/20 flex items-center justify-center shrink-0">
              <BookOpen className="w-5 h-5" />
            </div>
            <div className="text-left">
              <p className="text-sm font-bold">View Full Subject & Topic Breakdown</p>
              <p className="text-xs text-white/70 mt-0.5">Explore all subjects grouped by performance level with progress bars</p>
            </div>
          </div>
          <ChevronRight className="w-6 h-6 shrink-0 opacity-70 group-hover:translate-x-1 transition-transform duration-200" />
        </button>
      </div>
    </div>
  )
}
