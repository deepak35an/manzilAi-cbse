/**
 * Legacy guard — kept for org/admin AppShell routes.
 * New student routes use RoleRoute from components/guards/RoleRoute.tsx.
 */
import { Navigate, useLocation } from 'react-router-dom'
import { useAuth } from '@/context/AuthContext'
import { ROLE_HOME } from '@/lib/constants'

interface ProtectedRouteProps {
  allowedRoles: string[]
  children: React.ReactNode
}

export default function ProtectedRoute({ allowedRoles, children }: ProtectedRouteProps) {
  const { isAuthenticated, user, isLoading } = useAuth()
  const location = useLocation()

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="w-8 h-8 border-4 border-primary-600 border-t-transparent rounded-full animate-spin" />
      </div>
    )
  }

  if (!isAuthenticated || !user) {
    return <Navigate to="/login" state={{ from: location }} replace />
  }

  if (!allowedRoles.includes(user.role)) {
    return <Navigate to={ROLE_HOME[user.role] || '/'} replace />
  }

  return <>{children}</>
}
