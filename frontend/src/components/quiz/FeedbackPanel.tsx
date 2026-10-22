import { CheckCircle2, XCircle, AlertCircle } from 'lucide-react'
import RichText from './RichText'

interface FeedbackPanelProps {
  score: number
  explanation: string
  correctAnswer?: string
}

export default function FeedbackPanel({ score, explanation, correctAnswer }: FeedbackPanelProps) {
  const Icon = score >= 8 ? CheckCircle2 : score >= 4 ? AlertCircle : XCircle
  const color = score >= 8 ? 'text-green-600' : score >= 4 ? 'text-yellow-600' : 'text-red-600'

  return (
    <div className="space-y-2">
      <div className="flex items-center gap-2">
        <Icon className={`w-5 h-5 ${color}`} />
        <span className={`font-semibold ${color}`}>Score: {score}/10</span>
      </div>
      {correctAnswer && (
        <div className="text-xs text-gray-500 flex flex-wrap items-baseline gap-1">
          <span>Correct:</span>
          <span className="font-semibold">
            <RichText text={correctAnswer} inline />
          </span>
        </div>
      )}
      {explanation && <RichText text={explanation} className="text-sm text-gray-700" />}
    </div>
  )
}
