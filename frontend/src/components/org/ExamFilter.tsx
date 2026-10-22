import { ChevronDown } from 'lucide-react'

interface ExamFilterProps {
  exams: string[]
  selected: string | null
  onChange: (exam: string) => void
}

export default function ExamFilter({ exams, selected, onChange }: ExamFilterProps) {
  return (
    <div className="flex items-center justify-end gap-3">
      <span className="text-sm font-medium text-gray-500">Examination</span>
      <div className="relative">
        <select
          id="exam-filter-select"
          value={selected || ''}
          onChange={(e) => onChange(e.target.value)}
          className="appearance-none bg-white border border-gray-200 rounded-xl px-4 py-2.5 pr-10 text-sm font-semibold text-gray-800 shadow-sm hover:border-primary-400 focus:outline-none focus:ring-2 focus:ring-primary-500/20 focus:border-primary-500 transition-all cursor-pointer"
        >
          {exams.map((exam) => (
            <option key={exam} value={exam}>{exam}</option>
          ))}
        </select>
        <ChevronDown className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
      </div>
    </div>
  )
}
