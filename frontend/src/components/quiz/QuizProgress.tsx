import { useQuizStore } from '../../store/quizStore'

export default function QuizProgress() {
  const { questionIndex, totalQuestions, theta } = useQuizStore()
  const pct = (questionIndex / totalQuestions) * 100

  return (
    <div className="flex items-center gap-4">
      <div className="flex-1">
        <div className="flex justify-between text-xs text-gray-500 mb-1">
          <span>Question {questionIndex}/{totalQuestions}</span>
          <span>Ability: {theta.toFixed(2)}</span>
        </div>
        <div className="h-2 bg-gray-200 rounded-full overflow-hidden">
          <div className="h-full bg-primary-600 rounded-full transition-all duration-500" style={{ width: `${pct}%` }} />
        </div>
      </div>
    </div>
  )
}
