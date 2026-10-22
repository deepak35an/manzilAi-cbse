import { useQuery } from '@tanstack/react-query'
import { useNavigate } from 'react-router-dom'
import { getStudentHistory } from '../../services/studentApi'
import PerformanceTable from '../../components/analytics/PerformanceTable'
import Spinner from '../../components/ui/Spinner'

export default function HistoryPage() {
  const navigate = useNavigate()
  const { data, isLoading } = useQuery({ queryKey: ['student-history'], queryFn: () => getStudentHistory(50) })

  if (isLoading) return <div className="flex justify-center py-20"><Spinner size="lg" /></div>

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold text-gray-900">Test History</h1>
      <PerformanceTable results={data?.results || []} onViewDetails={(id) => navigate(`/student/results/${id}`)} />
    </div>
  )
}
