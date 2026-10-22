import { useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { ArrowLeft, BookOpen } from 'lucide-react'
import OrgTopicBreakdown from '../../components/org/OrgTopicBreakdown'
import ExamFilter from '../../components/org/ExamFilter'
import { getOrgDashboard } from '../../services/orgApi'

export default function OrgDetailTopicBreakdown() {
  const [searchParams] = useSearchParams()
  const initialExam = searchParams.get('exam') || undefined
  const [selectedExam, setSelectedExam] = useState<string | undefined>(initialExam)

  const { data: dashboardData } = useQuery({
    queryKey: ['org-dashboard', selectedExam],
    queryFn: () => getOrgDashboard(selectedExam),
  })

  const effectiveExam = selectedExam || dashboardData?.selected_exam || undefined

  return (
    <div className="space-y-6 animate-fade-in">
      {/* Top Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <Link to="/org/dashboard" className="p-2 border border-gray-200 rounded-xl hover:bg-gray-50 transition-colors text-gray-600">
            <ArrowLeft className="w-5 h-5" />
          </Link>
          <div>
            <h1 className="text-2xl font-bold text-gray-900 flex items-center gap-2">
              <BookOpen className="w-6 h-6 text-primary-600" />
              Detailed Topic Breakdown
            </h1>
            <p className="text-sm text-gray-500 mt-0.5">
              Comprehensive subject & topic performance across all organization students
            </p>
          </div>
        </div>

        {/* Exam Filter Dropdown */}
        <div className="w-full sm:w-64">
          <ExamFilter
            exams={dashboardData?.available_exams || []}
            selected={effectiveExam || null}
            onChange={(exam) => setSelectedExam(exam)}
          />
        </div>
      </div>

      {/* Render full OrgTopicBreakdown with detailed view */}
      <OrgTopicBreakdown exam={effectiveExam} hideHeader={true} />
    </div>
  )
}
