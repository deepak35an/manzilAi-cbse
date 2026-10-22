import { createContext, useContext, useEffect, useState, useCallback, type ReactNode } from 'react'
import { useNavigate } from 'react-router-dom'
import type { User } from '@/types/auth'
import { useAuthStore } from '@/store/authStore'
import { getMe } from '@/services/authApi'

interface AuthContextValue {
  user: User | null
  token: string | null
  isAuthenticated: boolean
  isLoading: boolean
  login: (token: string, user: User) => void
  logout: () => void
  redirectByRole: () => void
}

const AuthContext = createContext<AuthContextValue | null>(null)

import { useQueryClient } from '@tanstack/react-query'

export function AuthProvider({ children }: { children: ReactNode }) {
  const store = useAuthStore()
  const queryClient = useQueryClient()
  const [isLoading, setIsLoading] = useState(!!store.token && !store.user)
  const navigate = useNavigate()

  // Hydrate user from token on first load
  useEffect(() => {
    if (store.token && !store.user) {
      setIsLoading(true)
      getMe()
        .then(store.setUser)
        .catch(() => {
          queryClient.clear()
          store.logout()
        })
        .finally(() => setIsLoading(false))
    }
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  const redirectByRole = useCallback(() => {
    if (!store.user) return
    if (store.user.role === 'student') navigate('/student/home')
    else if (store.user.role === 'org_admin') navigate('/org/dashboard')
    else if (store.user.role === 'super_admin') navigate('/admin/dashboard')
  }, [store.user, navigate])

  const handleLogin = useCallback((token: string, user: User) => {
    queryClient.clear()
    store.login(token, user)
  }, [queryClient, store])

  const handleLogout = useCallback(() => {
    queryClient.clear()
    store.logout()
  }, [queryClient, store])

  return (
    <AuthContext.Provider
      value={{
        user: store.user,
        token: store.token,
        isAuthenticated: store.isAuthenticated,
        isLoading,
        login: handleLogin,
        logout: handleLogout,
        redirectByRole,
      }}
    >
      {children}
    </AuthContext.Provider>
  )
}


export function useAuth() {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth must be used inside AuthProvider')
  return ctx
}
