import { useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import { useQuizStore } from '../store/quizStore'
import { useQuestionBankStore } from '../store/questionBankStore'
import { startQuiz as apiStartQuiz, submitAnswer as apiSubmitAnswer, completeQuiz as apiCompleteQuiz } from '../services/quizApi'
import { generateId } from '../lib/utils'

export function useQuiz() {
  const navigate = useNavigate()
  const store = useQuizStore()
  const qbStore = useQuestionBankStore()

  const start = useCallback(async (contentRegistryId: string, mode: string, topics?: string[]) => {
    const data = await apiStartQuiz({ content_registry_id: contentRegistryId, mode, topics })
    store.startQuiz(data.session_id, data.question, data.total_questions, mode)
    store.addMessage({
      id: generateId(),
      type: 'question',
      content: data.question.text,
      question: data.question,
      timestamp: new Date(),
    })
    if (data.question) {
      qbStore.setQuestions(contentRegistryId, [data.question])
    }
    navigate(`/student/quiz/${data.session_id}`)
  }, [navigate, store, qbStore])

  const answer = useCallback(async (questionId: string, answerText: string, timeTaken: number = 0) => {
    if (!store.sessionId) return

    store.addMessage({ id: generateId(), type: 'answer', content: answerText, timestamp: new Date() })

    const result = await apiSubmitAnswer({
      session_id: store.sessionId,
      question_id: questionId,
      answer: answerText,
      time_taken: timeTaken,
    })

    store.addMessage({
      id: generateId(),
      type: 'feedback',
      content: '',
      score: result.score,
      explanation: result.explanation || '',
      timestamp: new Date(),
    })

    store.updateTheta(result.theta)

    if (result.is_complete) {
      await apiCompleteQuiz(store.sessionId)
      store.completeQuiz()
      navigate(`/student/results/${store.sessionId}`)
    } else if (result.next_question) {
      store.setNextQuestion(result.next_question)
      store.addMessage({
        id: generateId(),
        type: 'question',
        content: result.next_question.text,
        question: result.next_question,
        timestamp: new Date(),
      })
    }
  }, [store, navigate])

  return { start, answer, ...store }
}
