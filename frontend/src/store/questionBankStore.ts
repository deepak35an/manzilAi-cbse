import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import type { Question } from '../types/quiz'

interface QuestionBankCache {
  [contentRegistryId: string]: {
    questions: Question[]
    cachedAt: number
  }
}

interface QuestionBankState {
  cache: QuestionBankCache
  setQuestions: (contentRegistryId: string, questions: Question[]) => void
  getQuestions: (contentRegistryId: string) => Question[] | null
  clearCache: (contentRegistryId?: string) => void
}

const CACHE_TTL_MS = 60 * 60 * 1000 // 1 hour

export const useQuestionBankStore = create<QuestionBankState>()(
  persist(
    (set, get) => ({
      cache: {},
      setQuestions: (contentRegistryId, questions) =>
        set((state) => ({
          cache: {
            ...state.cache,
            [contentRegistryId]: { questions, cachedAt: Date.now() },
          },
        })),
      getQuestions: (contentRegistryId) => {
        const entry = get().cache[contentRegistryId]
        if (!entry) return null
        if (Date.now() - entry.cachedAt > CACHE_TTL_MS) return null
        return entry.questions
      },
      clearCache: (contentRegistryId) =>
        set((state) => {
          if (contentRegistryId) {
            const { [contentRegistryId]: _, ...rest } = state.cache
            return { cache: rest }
          }
          return { cache: {} }
        }),
    }),
    { name: 'question-bank-storage' }
  )
)
