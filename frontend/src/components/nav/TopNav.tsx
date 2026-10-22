import { useState, useRef, useEffect } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import {
  ChevronDown, Bell, User, LogOut, Settings,
  Briefcase, Plus, BookOpen,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import { useAuth } from '@/context/AuthContext'
import { useExam } from '@/context/ExamContext'
import { getMyPlans } from '@/services/quizApi'
import { getNotifications, markNotificationRead } from '@/services/studentApi'
import { STUDENT_ROUTES } from '@/lib/constants'


function useClickOutside(ref: React.RefObject<HTMLElement | null>, handler: () => void) {
  useEffect(() => {
    const handleClick = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) handler()
    }
    document.addEventListener('mousedown', handleClick)
    return () => document.removeEventListener('mousedown', handleClick)
  }, [ref, handler])
}

export default function TopNav() {
  const { id: currentPlanId } = useParams()
  const navigate = useNavigate()
  const { user, logout } = useAuth()
  const { journeys, setActiveJourney } = useExam()

  const [examDropdownOpen, setExamDropdownOpen] = useState(false)
  const [notifOpen, setNotifOpen] = useState(false)
  const [profileOpen, setProfileOpen] = useState(false)

  const examRef = useRef<HTMLDivElement>(null)
  const notifRef = useRef<HTMLDivElement>(null)
  const profileRef = useRef<HTMLDivElement>(null)

  useClickOutside(examRef, () => setExamDropdownOpen(false))
  useClickOutside(notifRef, () => setNotifOpen(false))
  useClickOutside(profileRef, () => setProfileOpen(false))

  const { data: plans } = useQuery({
    queryKey: ['my-plans', user?.id],
    queryFn: getMyPlans,
    enabled: !!user,
  })


  const { data: notifications, refetch: refetchNotifs } = useQuery({
    queryKey: ['notifications'],
    queryFn: () => getNotifications(10),
    enabled: !!user,
    refetchInterval: 60000,
  })

  const unreadCount = notifications?.filter((n) => !n.read).length ?? 0

  const handleMarkRead = async (id: string) => {
    await markNotificationRead(id)
    refetchNotifs()
  }

  const handleSwitchExam = (planId: string, exam: string) => {
    const journey = plans?.find((p) => p.plan_id === planId)
    if (journey) setActiveJourney(journey)
    setExamDropdownOpen(false)
    navigate(STUDENT_ROUTES.examDashboard(planId))
  }

  // Group CUET subject plans by duration into combined CUET journeys
  const displayPlans: (import('@/types/exam').ExamJourney & { isCuetGroup?: boolean; isGroupActive?: boolean; displayLabel?: string })[] = []
  if (plans && plans.length > 0) {
    const cuetGroupMap: Record<number, any> = {}
    for (const p of plans) {
      if (p.exam?.startsWith('CUET_') || p.exam === 'CUET') {
        if (!cuetGroupMap[p.duration_months]) {
          const isGroupActive = plans.some(
            (item) => (item.exam?.startsWith('CUET_') || item.exam === 'CUET') && item.duration_months === p.duration_months && item.plan_id === currentPlanId
          )
          const cuetEntry = {
            ...p,
            exam: 'CUET',
            displayLabel: `CUET (${p.duration_months} Month Plan)`,
            isCuetGroup: true,
            isGroupActive,
          }
          cuetGroupMap[p.duration_months] = cuetEntry
          displayPlans.push(cuetEntry)
        }
      } else {
        displayPlans.push({
          ...p,
          displayLabel: p.exam,
          isGroupActive: p.plan_id === currentPlanId,
        })
      }
    }
  }

  return (
    <header className="h-16 bg-white border-b border-gray-200 flex items-center px-4 gap-3 shrink-0 z-20 relative">
      
      {/* Exam switcher dropdown */}
      <div ref={examRef} className="relative">
        <button
          onClick={() => setExamDropdownOpen((p) => !p)}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-sm font-medium text-gray-700 hover:bg-gray-100 transition"
        >
          <BookOpen className="w-4 h-4 text-primary-600" />
          <span>Exam Center</span>
          <ChevronDown className={cn('w-4 h-4 text-gray-400 transition-transform', examDropdownOpen && 'rotate-180')} />
        </button>

        {examDropdownOpen && (
          <div className="absolute top-full left-0 mt-2 w-64 bg-white rounded-2xl shadow-card-lg border border-gray-100 py-2 z-50 animate-fade-in">
            {displayPlans.length > 0 ? (
              <>
                <p className="px-4 py-1.5 text-xs font-semibold text-gray-400 uppercase tracking-wider">My Exams</p>
                {displayPlans.map((plan) => (
                  <button
                    key={plan.plan_id}
                    onClick={() => handleSwitchExam(plan.plan_id, plan.exam)}
                    className={cn(
                      'w-full flex items-center justify-between px-4 py-2.5 text-sm hover:bg-gray-50 transition text-left',
                      plan.isGroupActive && 'bg-primary-50 text-primary-700 font-medium'
                    )}
                  >
                    <div>
                      <p className="font-medium">{plan.displayLabel || plan.exam}</p>
                      <p className="text-xs text-gray-400">Week {plan.current_week} of {plan.total_weeks}</p>
                    </div>
                    {plan.isGroupActive && (
                      <span className="text-xs bg-primary-100 text-primary-700 px-2 py-0.5 rounded-full font-semibold">Active</span>
                    )}
                  </button>
                ))}
                <hr className="my-2 border-gray-100" />
              </>
            ) : (
              <p className="px-4 py-2 text-sm text-gray-400">No active exam journeys</p>
            )}


            <button
              onClick={() => { setExamDropdownOpen(false); navigate(STUDENT_ROUTES.EXAM_ONBOARDING) }}
              className="w-full flex items-center gap-2 px-4 py-2.5 text-sm text-primary-600 hover:bg-primary-50 transition font-medium"
            >
              <Plus className="w-4 h-4" />
              Create New Exam Journey
            </button>
          </div>
        )}
      </div>

      {/* Job Center link */}
      <Link
        to={STUDENT_ROUTES.JOB}
        className="hidden sm:flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-sm font-medium text-gray-700 hover:bg-gray-100 transition"
      >
        <Briefcase className="w-4 h-4 text-accent-600" />
        Job Center
      </Link>

      <div className="flex-1" />

      {/* Notification bell */}
      <div ref={notifRef} className="relative">
        <button
          onClick={() => setNotifOpen((p) => !p)}
          className="relative p-2 rounded-xl hover:bg-gray-100 text-gray-500 transition"
        >
          <Bell className="w-5 h-5" />
          {unreadCount > 0 && (
            <span className="absolute -top-0.5 -right-0.5 w-4 h-4 bg-danger-500 text-white text-[10px] rounded-full flex items-center justify-center font-bold">
              {unreadCount > 9 ? '9+' : unreadCount}
            </span>
          )}
        </button>

        {notifOpen && (
          <div className="absolute right-0 top-full mt-2 w-80 bg-white rounded-2xl shadow-card-lg border border-gray-100 z-50 animate-fade-in overflow-hidden">
            <div className="px-4 py-3 border-b border-gray-100 flex items-center justify-between">
              <p className="font-semibold text-sm text-gray-900">Notifications</p>
              {unreadCount > 0 && <span className="badge-primary">{unreadCount} new</span>}
            </div>
            <div className="max-h-72 overflow-y-auto">
              {!notifications || notifications.length === 0 ? (
                <p className="px-4 py-6 text-sm text-gray-400 text-center">No notifications yet</p>
              ) : (
                notifications.map((n) => (
                  <button
                    key={n.id}
                    onClick={() => { handleMarkRead(n.id); if (n.link) navigate(n.link) }}
                    className={cn('w-full text-left px-4 py-3 hover:bg-gray-50 transition border-b border-gray-50 last:border-0', !n.read && 'bg-primary-50/50')}
                  >
                    <p className={cn('text-sm font-medium', n.read ? 'text-gray-700' : 'text-gray-900')}>{n.title}</p>
                    {n.body && <p className="text-xs text-gray-500 mt-0.5 line-clamp-2">{n.body}</p>}
                    <p className="text-[10px] text-gray-400 mt-1">{new Date(n.created_at).toLocaleDateString()}</p>
                  </button>
                ))
              )}
            </div>
          </div>
        )}
      </div>

      {/* Profile dropdown */}
      <div ref={profileRef} className="relative">
        <button
          onClick={() => setProfileOpen((p) => !p)}
          className="flex items-center gap-2 pl-2 pr-3 py-1.5 rounded-xl hover:bg-gray-100 transition"
        >
          <div className="w-7 h-7 bg-primary-100 rounded-full flex items-center justify-center text-primary-700 text-xs font-bold">
            {user?.name?.[0]?.toUpperCase() ?? 'S'}
          </div>
          <span className="text-sm font-medium text-gray-700 hidden sm:block max-w-[100px] truncate">
            {user?.name || 'Student'}
          </span>
          <ChevronDown className={cn('w-4 h-4 text-gray-400 transition-transform', profileOpen && 'rotate-180')} />
        </button>

        {profileOpen && (
          <div className="absolute right-0 top-full mt-2 w-56 bg-white rounded-2xl shadow-card-lg border border-gray-100 py-2 z-50 animate-fade-in">
            <div className="px-4 py-2 border-b border-gray-100">
              <p className="font-semibold text-sm text-gray-900">{user?.name}</p>
              <p className="text-xs text-gray-400">{user?.phone}</p>
            </div>
            <Link
              to={STUDENT_ROUTES.JOB}
              onClick={() => setProfileOpen(false)}
              className="flex items-center gap-2 px-4 py-2.5 text-sm text-gray-700 hover:bg-gray-50 transition"
            >
              <Briefcase className="w-4 h-4" />
              Job Center
            </Link>
            <button
              onClick={() => { setProfileOpen(false); navigate(STUDENT_ROUTES.EXAM_ONBOARDING) }}
              className="w-full flex items-center gap-2 px-4 py-2.5 text-sm text-gray-700 hover:bg-gray-50 transition"
            >
              <Plus className="w-4 h-4" />
              New Exam Journey
            </button>
            <hr className="my-1 border-gray-100" />
            <button
              onClick={() => { setProfileOpen(false); logout(); navigate('/login') }}
              className="w-full flex items-center gap-2 px-4 py-2.5 text-sm text-danger-600 hover:bg-danger-50 transition"
            >
              <LogOut className="w-4 h-4" />
              Sign Out
            </button>
          </div>
        )}
      </div>
    </header>
  )
}
