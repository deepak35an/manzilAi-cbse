import { useParams } from 'react-router-dom'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { useState, useEffect } from 'react'
import { getStudentHistory } from '@/services/studentApi'
import { Link } from 'react-router-dom'
import { Eye, RotateCcw, ChevronDown, History, Loader2 } from 'lucide-react'
import { STUDENT_ROUTES } from '@/lib/constants'
import { formatDate } from '@/lib/utils'
import { cn } from '@/lib/utils'
import type { TestResultExtended } from '@/types/analytics'

const PAGE_SIZE = 15

type SortKey = 'date' | 'score' | 'accuracy'
type SortDir = 'asc' | 'desc'

export default function ExamHistory() {
  const { id: planId } = useParams<{ id: string }>()
  const queryClient = useQueryClient()

  const [offset, setOffset] = useState(0)
  const [isFetchingMore, setIsFetchingMore] = useState(false)
  const [sortKey, setSortKey] = useState<SortKey>('date')
  const [sortDir, setSortDir] = useState<SortDir>('desc')

  // Seed from React Query cache on mount so switching tabs never shows a blank flash
  const [allResults, setAllResults] = useState<TestResultExtended[]>(() => {
    const cached = queryClient.getQueryData<{ total: number; results: TestResultExtended[] }>(['history', planId, 0])
    return cached?.results ?? []
  })
  const [total, setTotal] = useState<number>(() => {
    const cached = queryClient.getQueryData<{ total: number; results: TestResultExtended[] }>(['history', planId, 0])
    return cached?.total ?? 0
  })

  const { data, isLoading } = useQuery({
    queryKey: ['history', planId, offset],
    queryFn: () => getStudentHistory(PAGE_SIZE, offset, planId),
    enabled: !!planId,
    // No staleTime — React Query default: show cache instantly + always background-refetch
  })

  // Accumulate pages whenever the query result changes (covers both fresh fetch and cache hit)
  useEffect(() => {
    if (!data) return
    setTotal(data.total)
    setIsFetchingMore(false)
    if (offset === 0) {
      setAllResults(data.results)
    } else {
      setAllResults((prev) => {
        const existingIds = new Set(prev.map((r) => r.id))
        const newItems = data.results.filter((r) => !existingIds.has(r.id))
        return [...prev, ...newItems]
      })
    }
  }, [data, offset])

  const toggleSort = (key: SortKey) => {
    if (sortKey === key) setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'))
    else { setSortKey(key); setSortDir('desc') }
  }

  const handleLoadMore = () => {
    setIsFetchingMore(true)
    setOffset((prev) => prev + PAGE_SIZE)
  }

  const sorted = [...allResults].sort((a, b) => {
    let av = 0, bv = 0
    if (sortKey === 'date') { av = new Date(a.created_at).getTime(); bv = new Date(b.created_at).getTime() }
    if (sortKey === 'score') { av = a.total_score; bv = b.total_score }
    if (sortKey === 'accuracy') { av = a.accuracy ?? 0; bv = b.accuracy ?? 0 }
    return sortDir === 'asc' ? av - bv : bv - av
  })

  const SortHeader = ({ label, col }: { label: string; col: SortKey }) => (
    <th
      className="px-4 py-3 text-left text-xs font-semibold text-gray-500 cursor-pointer hover:text-gray-900 select-none"
      onClick={() => toggleSort(col)}
    >
      {label} {sortKey === col ? (sortDir === 'asc' ? '↑' : '↓') : ''}
    </th>
  )

  return (
    <div className="space-y-6 animate-fade-in">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-gray-900">Test History</h1>
          <p className="text-sm text-gray-500 mt-0.5">
            {total} evaluations total
          </p>
        </div>
        <div className="flex items-center gap-1.5 px-3 py-1.5 bg-gray-100 text-gray-600 rounded-xl text-sm font-medium">
          <History className="w-4 h-4" />
          All Time
        </div>
      </div>

      <div className="card overflow-hidden">
        {isLoading && offset === 0 ? (
          <div className="p-6 space-y-3">
            {[1,2,3].map((i) => <div key={i} className="skeleton h-12" />)}
          </div>
        ) : sorted.length === 0 ? (
          <div className="p-10 text-center">
            <History className="w-10 h-10 text-gray-200 mx-auto mb-3" />
            <p className="text-gray-400">No tests taken yet</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead className="border-b border-gray-100">
                <tr>
                  <SortHeader label="Date" col="date" />
                  <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500">Test</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500">Questions</th>
                  <SortHeader label="Score" col="score" />
                  <SortHeader label="Accuracy" col="accuracy" />
                  <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {sorted.map((r) => {
                  const pct = r.max_score > 0 ? Math.round((r.total_score / r.max_score) * 100) : 0
                  return (
                    <tr key={r.id} className="hover:bg-gray-50 transition">
                      <td className="px-4 py-3 text-sm text-gray-500">{formatDate(r.created_at)}</td>
                      <td className="px-4 py-3 text-sm font-medium text-gray-900">{r.test_name || 'Evaluation'}</td>
                      <td className="px-4 py-3 text-sm text-gray-500">{r.question_count ?? '—'}</td>
                      <td className="px-4 py-3">
                        <span className={cn(
                          'text-sm font-semibold',
                          pct >= 80 ? 'text-success-600' : pct >= 60 ? 'text-warning-600' : 'text-danger-600'
                        )}>{pct}%</span>
                      </td>
                      <td className="px-4 py-3 text-sm text-gray-500">
                        {r.accuracy != null ? `${Math.round(r.accuracy * 100)}%` : '—'}
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex gap-1.5">
                          <Link
                            to={STUDENT_ROUTES.testReview(planId!, r.week_number ?? r.session_id)}
                            state={{ session_id: r.session_id, returnTo: STUDENT_ROUTES.examHistory(planId!) }}
                            className="btn-outline btn-sm p-1.5"
                            title="Review"
                          >
                            <Eye className="w-3.5 h-3.5" />
                          </Link>
                          {r.week_number && (
                            <Link
                              to={STUDENT_ROUTES.testQuiz(planId!, r.week_number)}
                              state={{ test_number: r.test_number ?? 1 }}
                              className="btn-outline btn-sm p-1.5"
                              title="Retake"
                            >
                              <RotateCcw className="w-3.5 h-3.5" />
                            </Link>
                          )}
                        </div>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}
        {allResults.length < total && (
          <div className="p-4 border-t border-gray-100">
            <button
              onClick={handleLoadMore}
              disabled={isFetchingMore}
              className="btn-outline btn-sm w-full flex items-center justify-center gap-2 disabled:opacity-60"
            >
              {isFetchingMore
                ? <><Loader2 className="w-4 h-4 animate-spin" /> Loading…</>
                : <><ChevronDown className="w-4 h-4" /> Load More Records ({allResults.length} of {total})</>
              }
            </button>
          </div>
        )}
      </div>
    </div>
  )
}
