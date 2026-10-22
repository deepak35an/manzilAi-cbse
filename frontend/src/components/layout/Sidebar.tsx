import { Link, useLocation } from 'react-router-dom'
import { Home, BookOpen, Users, BarChart3, Settings, Briefcase, FileText, FolderOpen, GraduationCap, ChevronLeft } from 'lucide-react'
import { useAuthStore } from '../../store/authStore'
import { useUiStore } from '../../store/uiStore'
import { cn } from '../../lib/utils'

const studentLinks = [
  { to: '/student/dashboard', icon: Home, label: 'Dashboard' },
  { to: '/student/evaluate', icon: GraduationCap, label: 'Evaluate' },
  { to: '/student/history', icon: BarChart3, label: 'History' },
  { to: '/student/job-eval', icon: Briefcase, label: 'Job Readiness' },
]

const orgLinks = [
  { to: '/org/dashboard', icon: Home, label: 'Dashboard' },
  { to: '/org/students', icon: Users, label: 'Students' },
  { to: '/org/question-banks', icon: BookOpen, label: 'Question Banks' },
]

const adminLinks = [
  { to: '/admin/dashboard', icon: Home, label: 'Dashboard' },
  { to: '/admin/content', icon: FolderOpen, label: 'Content' },
  { to: '/admin/organizations', icon: Users, label: 'Organizations' },
]


import { useMediaQuery } from '../../hooks/useMediaQuery'

export default function Sidebar() {
  const location = useLocation()
  const user = useAuthStore((s) => s.user)
  const { sidebarOpen, toggleSidebar, setSidebarOpen } = useUiStore()
  const isLargeScreen = useMediaQuery('(min-width: 1024px)')

  const links = user?.role === 'super_admin' ? adminLinks : user?.role === 'org_admin' ? orgLinks : studentLinks

  return (
    <aside className={cn(
      'fixed left-0 top-0 h-full bg-white border-r border-gray-200 z-40 transition-all duration-300 overflow-hidden',
      sidebarOpen ? 'w-64' : 'w-16'
    )}>
      <div className="flex items-center justify-between h-16 px-4 border-b border-gray-200">
        {sidebarOpen && (
          <Link
            to="/"
            onClick={() => {
              if (!isLargeScreen) {
                setSidebarOpen(false)
              }
            }}
            className="flex items-center gap-2"
          >
            <div className="w-8 h-8 bg-primary-600 rounded-lg flex items-center justify-center">
              <GraduationCap className="w-5 h-5 text-white" />
            </div>
            <span className="font-bold text-gray-900">Manzil AI</span>
          </Link>
        )}
        <button onClick={toggleSidebar} className="p-1.5 hover:bg-gray-100 rounded-lg">
          <ChevronLeft className={cn('w-5 h-5 text-gray-500 transition-transform', !sidebarOpen && 'rotate-180')} />
        </button>
      </div>
      <nav className="p-3 space-y-1">
        {links.map((link) => {
          const active = location.pathname === link.to
          return (
            <Link
              key={link.to}
              to={link.to}
              onClick={() => {
                if (!isLargeScreen) {
                  setSidebarOpen(false)
                }
              }}
              className={cn(
                'flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors',
                active ? 'bg-primary-50 text-primary-700' : 'text-gray-600 hover:bg-gray-100 hover:text-gray-900'
              )}
            >
              <link.icon className="w-5 h-5 flex-shrink-0" />
              {sidebarOpen && <span>{link.label}</span>}
            </Link>
          )
        })}
      </nav>
    </aside>
  )
}
