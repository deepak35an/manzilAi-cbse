import { Link, useLocation, useParams } from 'react-router-dom'
import { Home, BookOpen, History, BarChart3, Layers, ChevronLeft, GraduationCap } from 'lucide-react'
import { cn } from '@/lib/utils'
import { STUDENT_ROUTES } from '@/lib/constants'

interface ExamSidebarProps {
  open: boolean
  onToggle: () => void
}

import { useMediaQuery } from '@/hooks/useMediaQuery'

export default function ExamSidebar({ open, onToggle }: ExamSidebarProps) {
  const { id } = useParams()
  const { pathname } = useLocation()
  const isLargeScreen = useMediaQuery('(min-width: 1024px)')

  const links = id ? [
    { to: STUDENT_ROUTES.examDashboard(id), label: 'Dashboard', icon: Home },
    { to: STUDENT_ROUTES.examPlan(id), label: 'Full Plan', icon: BookOpen },
    { to: STUDENT_ROUTES.examHistory(id), label: 'History', icon: History },
    { to: STUDENT_ROUTES.strengthWeakness(id), label: 'Strength & Weakness', icon: BarChart3 },
    { to: STUDENT_ROUTES.topicBreakdown(id), label: 'Topic Breakdown', icon: Layers },
  ] : []

  const isActive = (to: string) => {
    if (to.endsWith('/dashboard')) return pathname === to
    if (to.endsWith('/strength-weakness')) return pathname === to
    return pathname.startsWith(to)
  }

  return (
    <aside className={cn(
      'fixed left-0 top-0 h-full bg-white border-r border-gray-200 z-40 flex flex-col transition-all duration-300 shadow-sm',
      open ? 'w-64' : 'w-16'
    )}>
      {/* Header */}
      <div className={cn(
        'flex items-center h-16 px-3 border-b border-gray-200 shrink-0',
        open ? 'justify-between' : 'justify-center'
      )}>
        {open && (
          <Link
            to="/student/home"
            onClick={() => {
              if (!isLargeScreen && open) {
                onToggle()
              }
            }}
            className="flex items-center gap-2 overflow-hidden"
          >
            <div className="w-8 h-8 bg-primary-600 rounded-lg flex items-center justify-center shrink-0">
              <GraduationCap className="w-4 h-4 text-white" />
            </div>
            <span className="font-bold text-gray-900 truncate">Manzil AI</span>
          </Link>
        )}
        <button
          onClick={onToggle}
          className="p-1.5 rounded-lg hover:bg-gray-100 text-gray-400 shrink-0"
          aria-label={open ? 'Collapse sidebar' : 'Expand sidebar'}
        >
          <ChevronLeft className={cn('w-5 h-5 transition-transform', !open && 'rotate-180')} />
        </button>
      </div>

      {/* Nav links */}
      <nav className="p-2 space-y-0.5 flex-1 overflow-y-auto">
        {links.map(({ to, label, icon: Icon }) => (
          <Link
            key={to}
            to={to}
            title={open ? undefined : label}
            onClick={() => {
              if (!isLargeScreen && open) {
                onToggle()
              }
            }}
            className={cn(
              'flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium transition-colors',
              isActive(to)
                ? 'bg-primary-50 text-primary-700'
                : 'text-gray-600 hover:bg-gray-100 hover:text-gray-900'
            )}
          >
            <Icon className="w-5 h-5 shrink-0" />
            {open && <span className="truncate">{label}</span>}
          </Link>
        ))}
      </nav>

      {/* Collapsed icon-only hint */}
      {!open && (
        <div className="p-3 border-t border-gray-100">
          <div className="w-8 h-8 bg-primary-600 rounded-lg flex items-center justify-center mx-auto">
            <GraduationCap className="w-4 h-4 text-white" />
          </div>
        </div>
      )}
    </aside>
  )
}
