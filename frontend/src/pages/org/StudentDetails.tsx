import { useParams, Link } from 'react-router-dom'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { ArrowLeft, BookOpen, ChevronDown, Copy, Check, KeyRound, Eye, EyeOff } from 'lucide-react'
import { useState } from 'react'
import toast from 'react-hot-toast'
import Card from '../../components/ui/Card'
import Spinner from '../../components/ui/Spinner'
import Modal from '../../components/ui/Modal'
import Button from '../../components/ui/Button'
import { getOrgStudentDetail, getOrgStudentHistory, getOrgStudentPerformanceReport, resetStudentCredentials, revealStudentPassword } from '../../services/orgApi'
import PerformanceChart from '../../components/ui/PerformanceChart'
import { formatDate } from '../../lib/utils'

export default function StudentDetails() {
  const { studentId } = useParams<{ studentId: string }>()
  const [selectedBatchIndex, setSelectedBatchIndex] = useState<number>(0)
  const queryClient = useQueryClient()

  // Reset credentials state
  const [resetResult, setResetResult] = useState<{ username: string; new_password: string } | null>(null)
  const [copiedUser, setCopiedUser] = useState(false)
  const [copiedPass, setCopiedPass] = useState(false)

  const copyText = (text: string, setDone: (v: boolean) => void) => {
    navigator.clipboard.writeText(text)
    setDone(true)
    setTimeout(() => setDone(false), 2000)
  }

  // Reveal credentials state
  const [revealedPassword, setRevealedPassword] = useState<string | null>(null)
  const [isRevealing, setIsRevealing] = useState(false)
  const [revealCountdown, setRevealCountdown] = useState<number>(0)

  const handleRevealPassword = async () => {
    if (revealedPassword) {
      setRevealedPassword(null)
      setRevealCountdown(0)
      return
    }
    setIsRevealing(true)
    try {
      const res = await revealStudentPassword(studentId!)
      setRevealedPassword(res.password)
      setRevealCountdown(5)

      let remaining = 5
      const interval = setInterval(() => {
        remaining -= 1
        setRevealCountdown(remaining)
        if (remaining <= 0) {
          clearInterval(interval)
          setRevealedPassword(null)
        }
      }, 1000)
    } catch (err: any) {
      toast.error(err.response?.data?.detail || 'Failed to reveal password')
    } finally {
      setIsRevealing(false)
    }
  }

  const resetMutation = useMutation({
    mutationFn: () => resetStudentCredentials(studentId!),
    onSuccess: (data) => {
      setResetResult(data)
      queryClient.invalidateQueries({ queryKey: ['org-student-detail-base', studentId] })
    },
  })


  // 1. Initial base fetch to obtain student profile and enrolled batches list
  const { data: studentBase, isLoading: isBaseLoading, error: baseError } = useQuery({
    queryKey: ['org-student-detail-base', studentId],
    queryFn: () => getOrgStudentDetail(studentId!),
    enabled: !!studentId,
  })

  // Normalize list of enrolled batches
  const batchesList = (studentBase?.enrolled_batches && studentBase.enrolled_batches.length > 0)
    ? studentBase.enrolled_batches
    : (studentBase?.cuet_batches && studentBase.cuet_batches.length > 0)
    ? studentBase.cuet_batches.map((b: any) => ({
        exam: 'CUET',
        is_cuet: true,
        subjects: b.subjects,
        duration_months: b.duration_months,
        started_at: b.started_at,
        current_week: b.current_week,
        plan_id: null,
        plan_ids: [],
      }))
    : (studentBase?.all_batches || []).map((dur: number) => ({
        exam: studentBase?.exam ? studentBase.exam.replace('_PYQ', '').replace('_', ' ') : 'General',
        is_cuet: false,
        subjects: [],
        duration_months: dur,
        started_at: studentBase?.started_at ?? null,
        current_week: studentBase?.current_week ?? null,
        plan_id: null,
        plan_ids: [],
      }))

  const activeBatch = batchesList[selectedBatchIndex] || batchesList[0]

  const filterParams = activeBatch
    ? {
        plan_id: activeBatch.plan_id || undefined,
        // Omit for topic-wise plans (null duration) so the API scopes by plan_id only
        ...(activeBatch.duration_months != null
          ? { duration_months: activeBatch.duration_months }
          : {}),
      }
    : undefined

  // 2. Fetch scoped metrics (total tests, avg score, recent tests) for active batch
  const { data: student, isLoading: isDetailLoading } = useQuery({
    queryKey: ['org-student-detail-scoped', studentId, activeBatch?.plan_id, activeBatch?.duration_months],
    queryFn: () => getOrgStudentDetail(studentId!, filterParams),
    enabled: !!studentId,
  })

  // 3. Fetch scoped recent evaluation history for active batch
  const { data: historyData, isLoading: isHistoryLoading } = useQuery({
    queryKey: ['org-student-recent-evaluations-scoped', studentId, activeBatch?.plan_id, activeBatch?.duration_months],
    queryFn: () => getOrgStudentHistory(studentId!, 3, 0, filterParams),
    enabled: !!studentId,
  })

  // 4. Fetch scoped strengths & weaknesses for active batch
  const { data: perfReport } = useQuery({
    queryKey: ['org-student-performance-report-scoped', studentId, activeBatch?.plan_id, activeBatch?.duration_months],
    queryFn: () => getOrgStudentPerformanceReport(studentId!, filterParams),
    enabled: !!studentId,
  })

  const strengths: any[] = perfReport?.strengths || []
  const weaknesses: any[] = perfReport?.weaknesses || []

  if (isBaseLoading || isDetailLoading) {
    return (
      <div className="flex justify-center py-20">
        <Spinner size="lg" />
      </div>
    )
  }

  if (baseError || !studentBase || !student) {
    return (
      <div className="space-y-6 animate-fade-in">
        <Link to="/org/students" className="inline-flex items-center text-sm font-semibold text-gray-500 hover:text-gray-700">
          <ArrowLeft className="w-4 h-4 mr-2" /> Back to Students
        </Link>
        <Card className="p-8 text-center text-gray-400">
          <p className="text-lg font-medium">Failed to load student details</p>
          <p className="text-sm mt-1">Make sure the student belongs to your organization.</p>
        </Card>
      </div>
    )
  }

  // Format Started Date for active batch: DD-MM-YYYY
  const activeStartedAt = activeBatch?.started_at || student.started_at
  const formattedDate = activeStartedAt
    ? new Date(activeStartedAt).toLocaleDateString('en-GB', {
        day: '2-digit',
        month: '2-digit',
        year: 'numeric',
      }).replace(/\//g, '-')
    : '-'

  // Calculate Ideal Week for active batch
  const getIdealWeek = () => {
    if (!activeStartedAt) return '-'
    const startedDate = new Date(activeStartedAt)
    const now = new Date()
    const diffTime = now.getTime() - startedDate.getTime()
    if (diffTime < 0) return 'Week 1'
    const diffDays = Math.floor(diffTime / (1000 * 60 * 60 * 24))
    const idealWeek = Math.floor(diffDays / 7) + 1
    if (activeBatch?.duration_months) {
      const totalWeeks = activeBatch.duration_months * 4
      return `Week ${Math.min(idealWeek, totalWeeks)}`
    }
    return `Week ${idealWeek}`
  }

  // Prep chart data to match student performance trend
  const chartData = student.recent_tests?.slice().reverse().map((r: any, i: number) => ({
    label: r.test_name
      ? r.test_name.replace('Test ', 'T')   // "W-3 Test 2" → "W-3 T2"
      : `Test ${i + 1}`,
    score: r.max_score > 0 ? Math.round((r.total_score / r.max_score) * 100) : 0,
  })) || []

  return (
    <div className="space-y-8 animate-fade-in max-w-5xl mx-auto">
      {/* Navigation */}
      <div>
        <Link
          to="/org/students"
          className="inline-flex items-center text-sm font-semibold text-gray-500 hover:text-primary-600 transition-colors"
        >
          <ArrowLeft className="w-4 h-4 mr-2" /> Back to Students
        </Link>
      </div>

      {/* Header Info with Batch Dropdown Selector */}
      <div className="flex flex-wrap items-center gap-x-10 gap-y-4 text-sm text-gray-600 font-medium bg-white p-5 rounded-2xl border border-gray-100 shadow-sm">
        <div>
          <span className="text-gray-400">Student:</span>{' '}
          <strong className="text-gray-900 text-base ml-1">{student.name}</strong>
        </div>

        <div className="flex items-center gap-2">
          <span className="text-gray-400 font-medium">Batch:</span>{' '}
          {batchesList.length > 0 ? (
            <div className="relative inline-block">
              <select
                value={selectedBatchIndex}
                onChange={(e) => setSelectedBatchIndex(Number(e.target.value))}
                className="bg-gray-50 border border-gray-200 hover:border-primary-500 font-bold text-gray-900 text-sm rounded-xl px-3.5 py-1.5 shadow-sm focus:outline-none focus:ring-2 focus:ring-primary-500/20 cursor-pointer pr-8 appearance-none transition-all"
              >
                {batchesList.map((b: any, i: number) => {
                  const durationLabel =
                    b.duration_months != null ? `${b.duration_months} months` : 'Topic-wise'
                  const label = b.is_cuet
                    ? `CUET [${(b.subjects || []).join(', ')}] — ${durationLabel}`
                    : `${b.exam || 'Plan'} — ${durationLabel}`
                  return (
                    <option key={`${b.exam}-${b.duration_months ?? 'topic'}-${i}`} value={i}>
                      {label}
                    </option>
                  )
                })}
              </select>
              <ChevronDown className="w-4 h-4 text-gray-400 absolute right-2.5 top-1/2 -translate-y-1/2 pointer-events-none" />
            </div>
          ) : (
            <strong className="text-gray-800 text-base ml-1">Not Registered in Any Batch</strong>
          )}
        </div>

        <div>
          <span className="text-gray-400">Started:</span>{' '}
          <strong className="text-gray-900 text-base ml-1">{formattedDate}</strong>
        </div>
      </div>

      {/* Credentials Card */}
      <Card className="p-5 shadow-sm border border-gray-100">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-6 flex-1">
            {/* Username */}
            <div>
              <p className="text-xs text-gray-400 uppercase font-bold tracking-wider mb-1">Login Username</p>
              {studentBase.username ? (
                <div className="flex items-center gap-3">
                  <span className="text-base font-bold text-gray-900 font-mono">{studentBase.username}</span>
                  <button
                    onClick={() => copyText(studentBase.username!, setCopiedUser)}
                    className="flex items-center gap-1 text-xs text-primary-600 hover:text-primary-700 font-medium px-2 py-1 rounded-lg hover:bg-primary-50 transition-all"
                  >
                    {copiedUser ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
                    {copiedUser ? 'Copied!' : 'Copy'}
                  </button>
                </div>
              ) : (
                <span className="text-gray-400 text-sm italic">No username assigned</span>
              )}
            </div>

            {/* Password with Eye toggle */}
            <div>
              <p className="text-xs text-gray-400 uppercase font-bold tracking-wider mb-1">Password</p>
              <div className="flex items-center gap-3">
                <span className="text-base font-bold text-gray-900 font-mono tracking-wider">
                  {revealedPassword || '••••••••'}
                </span>
                <button
                  onClick={handleRevealPassword}
                  disabled={isRevealing}
                  title={revealedPassword ? 'Hide password' : 'Reveal password'}
                  className="flex items-center gap-1.5 text-xs text-gray-600 hover:text-primary-600 font-medium px-2.5 py-1 rounded-lg border border-gray-200 hover:border-primary-300 bg-gray-50 hover:bg-primary-50 transition-all"
                >
                  {isRevealing ? (
                    <span className="w-3.5 h-3.5 border-2 border-primary-600 border-t-transparent rounded-full animate-spin" />
                  ) : revealedPassword ? (
                    <>
                      <EyeOff className="w-3.5 h-3.5 text-primary-600" />
                      <span className="text-primary-600 font-semibold">{revealCountdown}s</span>
                    </>
                  ) : (
                    <>
                      <Eye className="w-3.5 h-3.5" />
                      <span>Show</span>
                    </>
                  )}
                </button>
              </div>
            </div>
          </div>

          <button
            onClick={() => resetMutation.mutate()}
            disabled={resetMutation.isPending}
            className="flex items-center justify-center gap-2 text-sm font-semibold text-amber-700 bg-amber-50 hover:bg-amber-100 border border-amber-200 px-4 py-2 rounded-xl transition-all disabled:opacity-50 shrink-0"
          >
            <KeyRound className="w-4 h-4" />
            {resetMutation.isPending ? 'Resetting…' : 'Reset Password'}
          </button>
        </div>
      </Card>


      {/* New password reveal modal after reset */}
      {resetResult && (
        <Modal isOpen onClose={() => setResetResult(null)} title="Password Reset Successfully">
          <div className="space-y-4">
            <p className="text-sm text-gray-600">A new password has been generated. Share it with the student — it won't be shown again.</p>
            <div className="bg-gray-50 rounded-xl border border-gray-200 p-4 space-y-3">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-xs text-gray-400 uppercase font-semibold tracking-wide">Username</p>
                  <p className="text-lg font-bold text-gray-900 font-mono mt-0.5">{resetResult.username}</p>
                </div>
              </div>
              <div className="border-t border-gray-200 pt-3 flex items-center justify-between">
                <div>
                  <p className="text-xs text-gray-400 uppercase font-semibold tracking-wide">New Password</p>
                  <p className="text-lg font-bold text-gray-900 font-mono mt-0.5">{resetResult.new_password}</p>
                </div>
                <button
                  onClick={() => copyText(resetResult.new_password, setCopiedPass)}
                  className="flex items-center gap-1.5 text-xs text-primary-600 hover:text-primary-700 font-medium px-3 py-1.5 rounded-lg hover:bg-primary-50 transition-all"
                >
                  {copiedPass ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
                  {copiedPass ? 'Copied!' : 'Copy'}
                </button>
              </div>
            </div>
            <p className="text-xs text-amber-600 bg-amber-50 border border-amber-100 rounded-lg px-3 py-2">
              ⚠️ Save the new password — it cannot be recovered.
            </p>
            <Button className="w-full" onClick={() => setResetResult(null)}>Done</Button>
          </div>
        </Modal>
      )}

      {/* Metrics Cards Grid */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        {/* Total Tests */}
        <Card className="p-5 flex flex-col justify-center items-center text-center shadow-sm">
          <span className="text-xs text-gray-400 font-bold uppercase tracking-wider">Total Tests</span>
          <span className="text-3xl font-extrabold text-gray-900 mt-2">{student.tests_taken}</span>
        </Card>

        {/* Avg Score */}
        <Card className="p-5 flex flex-col justify-center items-center text-center shadow-sm">
          <span className="text-xs text-gray-400 font-bold uppercase tracking-wider">Avg Score</span>
          <span className="text-3xl font-extrabold text-gray-900 mt-2">{student.avg_score.toFixed(1)}%</span>
        </Card>

        {/* Week Status */}
        <Card className="p-5 flex flex-col justify-between shadow-sm text-sm font-semibold text-gray-700 min-h-[140px]">
          <div className="flex items-center justify-between border-b border-gray-100 pb-2 mb-2">
            <span className="text-xs text-gray-400 font-bold uppercase tracking-wider">Week Status</span>
          </div>
          <div className="space-y-1.5">
            <div className="flex justify-between py-1 border-b border-gray-100/50">
              <span className="text-gray-400">Ideal week:</span>
              <span className="text-indigo-600 font-bold">
                {!activeStartedAt ? '-' : `Week ${getIdealWeek().replace('Week ', '')}`}
              </span>
            </div>
            <div className="flex justify-between py-1">
              <span className="text-gray-400">{student.name}'s week:</span>
              <span className="text-amber-600 font-bold">
                {!activeStartedAt && (!student.all_batches || student.all_batches.length === 0)
                  ? '-'
                  : `Week ${activeBatch?.current_week || student.current_week || 1}`}
              </span>
            </div>
          </div>
        </Card>
      </div>

      {/* Performance Trend */}
      <div className="space-y-3">
        <h2 className="text-xs font-bold text-gray-400 uppercase tracking-wider">Performance Trend</h2>
        <Card className="p-6 shadow-sm">
          {chartData.length > 0 ? (
            <PerformanceChart data={chartData} dataKey="score" height={180} />
          ) : (
            <div className="h-44 flex items-center justify-center text-gray-400">
              No performance data to display for this batch.
            </div>
          )}
        </Card>
      </div>

      {/* Recent Evaluation */}
      <div className="space-y-3">
        <h2 className="text-xs font-bold text-gray-400 uppercase tracking-wider">Recent Evaluation</h2>
        <div className="space-y-4">
          {isHistoryLoading ? (
            <div className="space-y-3">
              {[1, 2, 3].map((i) => (
                <div key={i} className="skeleton h-16 rounded-2xl" />
              ))}
            </div>
          ) : !historyData?.results || historyData.results.length === 0 ? (
            <Card className="p-8 text-center text-gray-400">
              <p>No recent evaluation records found for this batch.</p>
            </Card>
          ) : (
            <div className="space-y-3">
              {historyData.results.slice(0, 3).map((r: any) => {
                const scorePct = r.max_score > 0 ? (r.total_score / r.max_score) * 100 : 0
                return (
                  <div
                    key={r.id}
                    className="bg-white border border-gray-100 rounded-2xl px-5 py-4 shadow-sm hover:shadow transition"
                  >
                    <div className="flex flex-wrap items-start gap-x-8 gap-y-3">
                      <div className="min-w-[80px]">
                        <p className="text-[10px] text-gray-400 font-semibold uppercase tracking-wide">Date</p>
                        <p className="text-sm font-semibold text-gray-700 mt-0.5">{formatDate(r.created_at)}</p>
                      </div>
                      <div className="min-w-[100px]">
                        <p className="text-[10px] text-gray-400 font-semibold uppercase tracking-wide">Test</p>
                        <p className="text-sm font-bold text-gray-900 mt-0.5">{r.test_name}</p>
                      </div>
                      <div className="min-w-[60px]">
                        <p className="text-[10px] text-gray-400 font-semibold uppercase tracking-wide">Score</p>
                        <p className="text-sm font-extrabold text-indigo-600 mt-0.5">{scorePct.toFixed(0)}%</p>
                      </div>
                      <div className="min-w-[70px]">
                        <p className="text-[10px] text-gray-400 font-semibold uppercase tracking-wide">Accuracy</p>
                        <p className="text-sm font-extrabold text-emerald-600 mt-0.5">
                          {r.accuracy != null ? `${Math.round(r.accuracy * 100)}%` : '—'}
                        </p>
                      </div>
                      <div className="min-w-[70px]">
                        <p className="text-[10px] text-gray-400 font-semibold uppercase tracking-wide">Questions</p>
                        <p className="text-sm font-semibold text-gray-700 mt-0.5">{r.question_count ?? '—'}</p>
                      </div>
                      <div className="flex-1 min-w-[150px]">
                        <p className="text-[10px] text-gray-400 font-semibold uppercase tracking-wide">Topics</p>
                        <p className="text-sm text-gray-500 mt-0.5 leading-snug break-words whitespace-normal" title={r.topic}>
                          {r.topic || '—'}
                        </p>
                      </div>
                    </div>
                  </div>
                )
              })}

              {/* View Full History Button */}
              <Link
                to={`/org/student/${studentId}/history`}
                className="w-full bg-primary-50 hover:bg-primary-100 text-primary-700 font-bold border border-primary-100 py-3 rounded-2xl flex items-center justify-center gap-1.5 transition-colors mt-4 text-sm"
              >
                View Full History
              </Link>
            </div>
          )}
        </div>
      </div>

      {/* Top Strengths & Areas to Improve */}
      <div className="space-y-4">
        <Card className="p-6 shadow-sm">
          {(strengths.length > 0 || weaknesses.length > 0) ? (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-8 relative">
              {/* Divider line in middle */}
              <div className="hidden md:block absolute left-1/2 top-0 bottom-0 w-px bg-gray-100" />

              {/* Top Strengths */}
              <div className="space-y-4">
                <h3 className="text-sm font-extrabold text-emerald-600 uppercase tracking-wider flex items-center gap-1.5">
                  Top Strengths:
                </h3>
                {strengths.length > 0 ? (
                  <div className="space-y-3">
                    {strengths.slice(0, 5).map((s: any, idx: number) => (
                      <div key={s.topic} className="flex items-start gap-3">
                        <span className="w-5 h-5 rounded-full bg-emerald-50 text-emerald-700 text-xs font-bold flex items-center justify-center shrink-0 mt-0.5">
                          {idx + 1}
                        </span>
                        <div>
                          <p className="text-sm font-semibold text-gray-800">{s.topic}</p>
                          <p className="text-xs text-gray-400 mt-0.5">
                            {s.subject} · Avg {s.avg_score.toFixed(1)}/10
                          </p>
                        </div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="text-xs text-gray-400">No top strengths for this batch yet.</p>
                )}
              </div>

              {/* Areas to Improve */}
              <div className="space-y-4">
                <h3 className="text-sm font-extrabold text-rose-600 uppercase tracking-wider flex items-center gap-1.5">
                  Areas to Improve:
                </h3>
                {weaknesses.length > 0 ? (
                  <div className="space-y-3">
                    {weaknesses.slice(0, 5).map((w: any, idx: number) => (
                      <div key={w.topic} className="flex items-start gap-3">
                        <span className="w-5 h-5 rounded-full bg-rose-50 text-rose-700 text-xs font-bold flex items-center justify-center shrink-0 mt-0.5">
                          {idx + 1}
                        </span>
                        <div>
                          <p className="text-sm font-semibold text-gray-800">{w.topic}</p>
                          <p className="text-xs text-gray-400 mt-0.5">
                            {w.subject} · Avg {w.avg_score.toFixed(1)}/10
                          </p>
                        </div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="text-xs text-gray-400">No areas to improve for this batch yet.</p>
                )}
              </div>
            </div>
          ) : (
            <div className="flex flex-col items-center justify-center py-8 text-center">
              <BookOpen className="w-10 h-10 text-gray-200 mb-3" />
              <p className="text-sm font-semibold text-gray-500">No strengths or weaknesses for this batch yet</p>
              <p className="text-xs text-gray-400 mt-1">These will appear once the student completes enough tests in this batch.</p>
            </div>
          )}
        </Card>

        {/* View Detailed Topic Breakdown Button — only when data exists */}
        {(strengths.length > 0 || weaknesses.length > 0) && (
          <Link
            to={`/org/student/${studentId}/topic-breakdown`}
            className="w-full bg-primary-50 hover:bg-primary-100 text-primary-700 font-bold border border-primary-100 py-3 rounded-2xl flex items-center justify-center gap-1.5 transition-colors text-sm"
          >
            View Detailed Topic Breakdown &gt;
          </Link>
        )}
      </div>
    </div>
  )
}
