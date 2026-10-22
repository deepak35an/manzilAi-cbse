import { useState, useRef, useEffect, type ReactNode } from 'react'
import { cn } from '../../lib/utils'

interface DropdownMenuProps {
  trigger: ReactNode
  children: ReactNode
  className?: string
}

export default function DropdownMenu({ trigger, children, className }: DropdownMenuProps) {
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const handleClick = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', handleClick)
    return () => document.removeEventListener('mousedown', handleClick)
  }, [])

  return (
    <div ref={ref} className="relative">
      <div onClick={() => setOpen(!open)}>{trigger}</div>
      {open && (
        <div className={cn('absolute right-0 mt-2 w-48 bg-white rounded-lg shadow-lg border border-gray-200 py-1 z-50', className)}>
          {children}
        </div>
      )}
    </div>
  )
}
