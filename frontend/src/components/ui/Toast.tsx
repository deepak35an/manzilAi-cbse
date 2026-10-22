import { CheckCircle2, XCircle, Info, X } from 'lucide-react'
import { useToast, type ToastMessage } from '@/hooks/useToast'
import { cn } from '@/lib/utils'

export interface ToastProps {
  toasts: ToastMessage[]
  dismiss: (id: string) => void
}

const icons = {
  success: <CheckCircle2 className="w-4 h-4" />,
  error: <XCircle className="w-4 h-4" />,
  info: <Info className="w-4 h-4" />,
}

export function ToastContainer({ toasts, dismiss }: ToastProps) {
  return (
    <div className="fixed bottom-6 right-6 z-50 flex flex-col gap-2 pointer-events-none">
      {toasts.map((t) => (
        <div
          key={t.id}
          className={cn(
            'flex items-center gap-3 px-4 py-3 rounded-2xl shadow-card-lg text-sm font-medium pointer-events-auto animate-fade-in',
            t.type === 'success' && 'bg-success-600 text-white',
            t.type === 'error' && 'bg-danger-600 text-white',
            t.type === 'info' && 'bg-primary-600 text-white',
          )}
        >
          {icons[t.type]}
          <span>{t.message}</span>
          <button onClick={() => dismiss(t.id)} className="ml-1 opacity-75 hover:opacity-100">
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      ))}
    </div>
  )
}

/** Standalone, self-managing toast container — no props needed in App. */
export default function ToastProvider() {
  const { toasts, dismiss } = useToast()
  return <ToastContainer toasts={toasts} dismiss={dismiss} />
}
