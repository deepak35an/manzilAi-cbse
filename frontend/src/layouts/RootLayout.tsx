/**
 * Root layout — wraps every route with Auth + Exam contexts.
 * Must be inside the router so useNavigate is available for AuthContext.
 */
import { Outlet } from 'react-router-dom'
import { AuthProvider } from '@/context/AuthContext'
import { ExamProvider } from '@/context/ExamContext'

export default function RootLayout() {
  return (
    <AuthProvider>
      <ExamProvider>
        <Outlet />
      </ExamProvider>
    </AuthProvider>
  )
}
