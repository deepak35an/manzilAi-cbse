import { useRef, useState, type KeyboardEvent, type ClipboardEvent } from 'react'
import { cn } from '../../lib/utils'

interface OtpInputProps {
  length?: number
  onComplete: (otp: string) => void
  error?: boolean
}

export default function OtpInput({ length = 6, onComplete, error }: OtpInputProps) {
  const [values, setValues] = useState<string[]>(Array(length).fill(''))
  const refs = useRef<(HTMLInputElement | null)[]>([])

  const handleChange = (index: number, value: string) => {
    if (!/^\d*$/.test(value)) return
    const newValues = [...values]
    newValues[index] = value.slice(-1)
    setValues(newValues)
    if (value && index < length - 1) refs.current[index + 1]?.focus()
    const otp = newValues.join('')
    if (otp.length === length) onComplete(otp)
  }

  const handleKeyDown = (index: number, e: KeyboardEvent) => {
    if (e.key === 'Backspace' && !values[index] && index > 0) {
      refs.current[index - 1]?.focus()
    }
  }

  const handlePaste = (e: ClipboardEvent) => {
    e.preventDefault()
    const paste = e.clipboardData.getData('text').replace(/\D/g, '').slice(0, length)
    const newValues = [...values]
    paste.split('').forEach((char, i) => { newValues[i] = char })
    setValues(newValues)
    if (paste.length === length) onComplete(paste)
    else refs.current[paste.length]?.focus()
  }

  return (
    <div className="flex gap-3 justify-center">
      {values.map((val, i) => (
        <input
          key={i}
          ref={(el) => { refs.current[i] = el }}
          type="text"
          inputMode="numeric"
          maxLength={1}
          value={val}
          onChange={(e) => handleChange(i, e.target.value)}
          onKeyDown={(e) => handleKeyDown(i, e)}
          onPaste={i === 0 ? handlePaste : undefined}
          className={cn(
            'w-12 h-14 text-center text-xl font-semibold border-2 rounded-xl transition-all',
            'focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-primary-500',
            error ? 'border-red-400 animate-shake' : 'border-gray-300'
          )}
        />
      ))}
    </div>
  )
}
