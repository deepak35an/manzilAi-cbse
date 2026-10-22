import { useState } from 'react'
import { Send } from 'lucide-react'

interface AnswerInputProps {
  onSubmit: (answer: string) => void
  disabled?: boolean
  placeholder?: string
}

export default function AnswerInput({ onSubmit, disabled, placeholder = 'Type your answer...' }: AnswerInputProps) {
  const [value, setValue] = useState('')

  const handleSubmit = () => {
    if (!value.trim()) return
    onSubmit(value.trim())
    setValue('')
  }

  return (
    <div className="flex gap-2">
      <input
        type="text"
        value={value}
        onChange={(e) => setValue(e.target.value)}
        onKeyDown={(e) => e.key === 'Enter' && handleSubmit()}
        placeholder={placeholder}
        disabled={disabled}
        className="flex-1 px-4 py-3 border border-gray-300 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-primary-500"
      />
      <button onClick={handleSubmit} disabled={disabled || !value.trim()} className="p-3 bg-primary-600 text-white rounded-xl hover:bg-primary-700 disabled:opacity-50 transition-colors">
        <Send className="w-5 h-5" />
      </button>
    </div>
  )
}
