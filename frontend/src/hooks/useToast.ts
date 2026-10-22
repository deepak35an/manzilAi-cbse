import { useState, useCallback } from 'react'

export interface ToastMessage {
  id: string
  type: 'success' | 'error' | 'info'
  message: string
}

export function useToast() {
  const [toasts, setToasts] = useState<ToastMessage[]>([])

  const show = useCallback((message: string, type: ToastMessage['type'] = 'info') => {
    const id = Math.random().toString(36).slice(2)
    setToasts((prev) => [...prev, { id, type, message }])
    setTimeout(() => setToasts((prev) => prev.filter((t) => t.id !== id)), 3000)
  }, [])

  const dismiss = useCallback((id: string) => {
    setToasts((prev) => prev.filter((t) => t.id !== id))
  }, [])

  return { toasts, show, dismiss }
}
