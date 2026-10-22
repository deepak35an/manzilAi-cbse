import { create } from 'zustand'
import type { Question, ChatMessage } from '../types/quiz'

interface QuizState {
  sessionId: string | null
  currentQuestion: Question | null
  questionIndex: number
  totalQuestions: number
  theta: number
  messages: ChatMessage[]
  mode: 'subject' | 'pyq' | 'job'
  isRecording: boolean
  startQuiz: (sessionId: string, firstQuestion: Question, total: number, mode: string) => void
  addMessage: (message: ChatMessage) => void
  setNextQuestion: (question: Question | null) => void
  updateTheta: (theta: number) => void
  setRecording: (recording: boolean) => void
  completeQuiz: () => void
  resetQuiz: () => void
}

export const useQuizStore = create<QuizState>((set) => ({
  sessionId: null,
  currentQuestion: null,
  questionIndex: 0,
  totalQuestions: 0,
  theta: 0,
  messages: [],
  mode: 'subject',
  isRecording: false,
  startQuiz: (sessionId, firstQuestion, total, mode) =>
    set({
      sessionId,
      currentQuestion: firstQuestion,
      questionIndex: 1,
      totalQuestions: total,
      theta: 0,
      messages: [],
      mode: mode as 'subject' | 'pyq' | 'job',
    }),
  addMessage: (message) =>
    set((state) => ({ messages: [...state.messages, message] })),
  setNextQuestion: (question) =>
    set((state) => ({
      currentQuestion: question,
      questionIndex: state.questionIndex + 1,
    })),
  updateTheta: (theta) => set({ theta }),
  setRecording: (recording) => set({ isRecording: recording }),
  completeQuiz: () => set({ currentQuestion: null }),
  resetQuiz: () =>
    set({
      sessionId: null,
      currentQuestion: null,
      questionIndex: 0,
      totalQuestions: 0,
      theta: 0,
      messages: [],
      isRecording: false,
    }),
}))
