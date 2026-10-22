import { useQuery } from '@tanstack/react-query'
import { previewContent } from '../../services/adminApi'
import Badge from '../ui/Badge'
import QuestionText from '../quiz/QuestionText'

interface QuestionBankPreviewProps {
  registryId: string
}

export default function QuestionBankPreview({ registryId }: QuestionBankPreviewProps) {
  const { data: questions, isLoading, error } = useQuery({
    queryKey: ['question-bank-preview', registryId],
    queryFn: () => previewContent(registryId),
  })

  if (isLoading) {
    return (
      <div className="flex items-center justify-center p-12">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary-600"></div>
        <span className="ml-3 text-gray-500">Loading questions...</span>
      </div>
    )
  }

  if (error) {
    return (
      <div className="p-8 text-center text-red-500">
        Failed to load question bank preview.
      </div>
    )
  }

  const questionList = Array.isArray(questions) ? questions : []

  return (
    <div className="space-y-6 max-h-[70vh] overflow-y-auto px-1">
      <div className="flex justify-between items-center text-sm text-gray-500 border-b pb-4">
        <span>Total Questions: {questionList.length}</span>
      </div>
      <div className="space-y-8">
        {questionList.map((q: any, i: number) => (
          <div key={i} className="space-y-3">
            <div className="flex items-start gap-3">
              <span className="flex-shrink-0 flex items-center justify-center w-6 h-6 rounded-full bg-gray-100 text-xs font-semibold text-gray-600">
                {i + 1}
              </span>
              <div className="space-y-2 flex-grow">
                <div className="flex items-center gap-2">
                  <Badge variant="info">{q.type}</Badge>
                  <span className="text-xs text-gray-400">Difficulty: {q.difficulty}</span>
                </div>
                <QuestionText text={q.question} className="text-gray-800 font-medium leading-relaxed" />
                
                <div className="mt-3 p-3 bg-green-50 border border-green-200 rounded-lg text-sm">
                  <span className="text-green-700 font-semibold mr-2">Correct Answer:</span>
                  <span className="text-green-800 font-bold">{q.answer}</span>
                </div>

                {q.explanation && (
                  <div className="mt-2 p-3 bg-blue-50 border border-blue-100 rounded-lg text-sm">
                    <span className="text-blue-700 font-semibold block mb-1">Explanation:</span>
                    <span className="text-blue-900 leading-relaxed">{q.explanation}</span>
                  </div>
                )}

                {q.topic && (
                  <div className="text-xs text-gray-400 italic">
                    Topic: {q.topic}
                  </div>
                )}
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
