import { Navigate } from 'react-router-dom'
import { useAuth } from '@/context/AuthContext'
import type { ReactNode } from 'react'

interface RoleRouteProps {
  allowedRoles: ('student' | 'org_admin' | 'super_admin')[]
  children: ReactNode
}

const ROLE_HOME: Record<string, string> = {
  student: '/student/home',
  org_admin: '/org/dashboard',
  super_admin: '/admin/dashboard',
}

export default function RoleRoute({ allowedRoles, children }: RoleRouteProps) {
  const { user, isAuthenticated, isLoading } = useAuth()

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="w-8 h-8 border-4 border-primary-600 border-t-transparent rounded-full animate-spin" />
      </div>
    )
  }

  if (!isAuthenticated || !user) {
    return <Navigate to="/login" replace />
  }

  if (!allowedRoles.includes(user.role)) {
    return <Navigate to={ROLE_HOME[user.role] || '/'} replace />
  }

  return <>{children}</>
}
