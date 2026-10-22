import { useState } from 'react'
import type { Question } from '../../types/quiz'
import { cn } from '../../lib/utils'
import QuestionText from './QuestionText'

interface QuestionCardProps {
  question: Question
  onAnswer?: (answer: string) => void
  readOnly?: boolean
}

export default function QuestionCard({ question, onAnswer, readOnly }: QuestionCardProps) {
  const [selected, setSelected] = useState<string>('')
  const [multiSelected, setMultiSelected] = useState<string[]>([])
  const [natValue, setNatValue] = useState('')
  const [textValue, setTextValue] = useState('')

  const effectiveType = (() => {
    if (!question) return 'MCQ'
    const raw = (question.type || '').toString().trim()
    if (!raw) return 'MCQ'
    const u = raw.toUpperCase()
    if (u === 'MCQ' || u === 'SINGLE') return 'MCQ'
    if (u === 'MSQ' || u === 'MULTIPLE') return 'MSQ'
    if (u === 'NAT' || u === 'NUMERICAL') return 'NAT'
    if (raw.toLowerCase() === 'subjective') return 'subjective'
    if (question.options && question.options.length > 0) return 'MCQ'
    return u
  })()

  const handleSubmit = () => {
    if (effectiveType === 'MCQ') onAnswer?.(selected)
    else if (effectiveType === 'MSQ') onAnswer?.(multiSelected.join(','))
    else if (effectiveType === 'NAT') onAnswer?.(natValue)
    else onAnswer?.(textValue)
  }

  return (
    <div className="space-y-3">
      {readOnly && (
        <div className="flex flex-wrap gap-2 mb-2">
          {question.source_file && (
            <span className="px-2 py-0.5 bg-gray-100 text-gray-500 text-[10px] font-bold rounded uppercase tracking-tight border border-gray-200">
              {question.source_file}
            </span>
          )}
          {question.subtopic && (
            <span className="px-2 py-0.5 bg-primary-50 text-primary-600 text-[10px] font-bold rounded uppercase tracking-tight border border-primary-100">
              {question.subtopic}
            </span>
          )}
        </div>
      )}
      {readOnly && (
        <QuestionText text={question.text} className="font-medium text-gray-900" />
      )}
      {effectiveType === 'MCQ' && question.options && !readOnly && (
        <div className="space-y-2">
          {question.options.map((opt, i) => (
            <label key={i} className={cn(
              'flex items-center gap-3 p-3 rounded-lg border cursor-pointer transition-colors',
              selected === opt ? 'border-primary-500 bg-primary-50' : 'border-gray-200 hover:bg-gray-50',
              readOnly && 'pointer-events-none'
            )}>
              <input type="radio" name={question.id} value={opt} checked={selected === opt} onChange={() => setSelected(opt)} className="sr-only" />
              <div className={cn('w-4 h-4 rounded-full border-2', selected === opt ? 'border-primary-600 bg-primary-600' : 'border-gray-300')}>
                {selected === opt && <div className="w-2 h-2 bg-white rounded-full m-0.5" />}
              </div>
              <span className="text-sm whitespace-pre-wrap">{opt}</span>
            </label>
          ))}
        </div>
      )}
      {effectiveType === 'MSQ' && question.options && !readOnly && (
        <div className="space-y-2">
          {question.options.map((opt, i) => (
            <label key={i} className={cn(
              'flex items-center gap-3 p-3 rounded-lg border cursor-pointer transition-colors',
              multiSelected.includes(opt) ? 'border-primary-500 bg-primary-50' : 'border-gray-200 hover:bg-gray-50',
              readOnly && 'pointer-events-none'
            )}>
              <input type="checkbox" checked={multiSelected.includes(opt)} onChange={(e) => {
                setMultiSelected(e.target.checked ? [...multiSelected, opt] : multiSelected.filter(s => s !== opt))
              }} className="rounded border-gray-300 text-primary-600 focus:ring-primary-500" />
              <span className="text-sm whitespace-pre-wrap">{opt}</span>
            </label>
          ))}
        </div>
      )}
      {effectiveType === 'NAT' && !readOnly && (
        <input 
          type="number" 
          value={natValue} 
          onChange={(e) => {
            setNatValue(e.target.value)
          }} 
          placeholder="Enter numeric answer" 
          className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-primary-500" 
        />
      )}
      {effectiveType === 'subjective' && !readOnly && (

        <div className="space-y-2 pt-2 border-t border-gray-100">
          <label className="text-[10px] font-bold text-primary-600 uppercase tracking-wider">
            Your Answer
          </label>
          <textarea 
            value={textValue} 
            onChange={(e) => {
              setTextValue(e.target.value)
            }} 
            placeholder="Type your answer..."
            rows={4} 
            className="w-full px-3 py-2 border rounded-lg text-sm focus:ring-2 focus:ring-primary-500 resize-none border-gray-300 text-gray-800"
          />
        </div>
      )}

      {!readOnly && (
        <button onClick={handleSubmit} className="w-full py-2 bg-primary-600 text-white rounded-lg text-sm font-medium hover:bg-primary-700 transition-colors">
          Submit Answer
        </button>
      )}
    </div>
  )
}
