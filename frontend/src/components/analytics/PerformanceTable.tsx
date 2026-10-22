import Card from '../ui/Card'
import Badge from '../ui/Badge'
import { formatDate, formatScore } from '../../lib/utils'
import type { TestResult } from '../../types/analytics'

interface PerformanceTableProps {
  results: TestResult[]
  onViewDetails?: (id: string) => void
}

export default function PerformanceTable({ results, onViewDetails }: PerformanceTableProps) {
  return (
    <Card className="overflow-hidden">
      <div className="px-5 py-4 border-b border-gray-200">
        <h3 className="text-sm font-semibold text-gray-700">Recent Tests</h3>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead><tr className="bg-gray-50">
            <th className="px-4 py-3 text-left text-xs font-medium text-gray-500">Date</th>
            <th className="px-4 py-3 text-left text-xs font-medium text-gray-500">Score</th>
            <th className="px-4 py-3 text-left text-xs font-medium text-gray-500">Theta</th>
            <th className="px-4 py-3 text-left text-xs font-medium text-gray-500">Status</th>
            <th className="px-4 py-3 text-right text-xs font-medium text-gray-500">Action</th>
          </tr></thead>
          <tbody>
            {results.map((r) => (
              <tr key={r.id} className="border-b border-gray-100 hover:bg-gray-50">
                <td className="px-4 py-3 text-gray-700">{formatDate(r.created_at)}</td>
                <td className="px-4 py-3 font-medium">{formatScore(r.total_score, r.max_score)}</td>
                <td className="px-4 py-3 text-gray-600">{r.theta_final.toFixed(2)}</td>
                <td className="px-4 py-3">
                  <Badge variant={r.total_score / r.max_score >= 0.6 ? 'success' : 'error'}>
                    {r.total_score / r.max_score >= 0.6 ? 'Pass' : 'Needs Work'}
                  </Badge>
                </td>
                <td className="px-4 py-3 text-right">
                  <button onClick={() => onViewDetails?.(r.session_id)} className="text-primary-600 hover:text-primary-700 text-sm font-medium">
                    View
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </Card>
  )
}
