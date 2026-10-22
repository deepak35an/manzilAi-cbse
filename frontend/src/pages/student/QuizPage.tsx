import { useEffect, useRef } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { useMutation } from '@tanstack/react-query'
import toast from 'react-hot-toast'
import ChatThread from '../../components/quiz/ChatThread'
import QuestionCard from '../../components/quiz/QuestionCard'
import QuizProgress from '../../components/quiz/QuizProgress'
import { useQuizStore } from '../../store/quizStore'
import { submitAnswer, completeQuiz } from '../../services/quizApi'
import { generateId } from '../../lib/utils'

export default function QuizPage() {
  const { sessionId } = useParams()
  const navigate = useNavigate()
  const { currentQuestion, addMessage, setNextQuestion, updateTheta, messages } = useQuizStore()
  const hasInitialized = useRef(false)

  const answerMutation = useMutation({
    mutationFn: submitAnswer,
    onSuccess: (data) => {
      addMessage({ id: generateId(), type: 'feedback', content: '', score: data.score, explanation: data.explanation || '', timestamp: new Date() })
      updateTheta(data.theta)
      if (data.is_complete) {
        completeQuiz(sessionId!).then(() => navigate(`/student/results/${sessionId}`))
      } else if (data.next_question) {
        setNextQuestion(data.next_question)
        addMessage({ id: generateId(), type: 'question', content: data.next_question.text, question: data.next_question, timestamp: new Date() })
      }
    },
    onError: () => toast.error('Failed to submit answer'),
  })

  useEffect(() => {
    if (currentQuestion && messages.length === 0 && !hasInitialized.current) {
      hasInitialized.current = true
      addMessage({ id: generateId(), type: 'question', content: currentQuestion.text, question: currentQuestion, timestamp: new Date() })
    }
  }, [currentQuestion, messages.length, addMessage])

  const handleAnswer = (answer: string) => {
    if (!sessionId || !currentQuestion) return

    addMessage({ 
      id: generateId(), 
      type: 'answer', 
      content: answer, 
      timestamp: new Date(),
    })
    
    answerMutation.mutate({
      session_id: sessionId,
      question_id: currentQuestion.id,
      answer,
      time_taken: 0,
    })
  }

  return (
    <div className="h-[calc(100vh-8rem)] flex flex-col">
      <div className="px-4 py-3 border-b"><QuizProgress /></div>
      <ChatThread />
      {currentQuestion && (
        <div className="border-t bg-white p-4">
          <QuestionCard 
            question={currentQuestion} 
            onAnswer={handleAnswer} 
          />
        </div>
      )}
    </div>
  )
}
