import { createContext, useContext, useState, useEffect, useCallback, type ReactNode } from 'react'
import type { ExamJourney } from '@/types/exam'
import { useAuth } from './AuthContext'

interface ExamContextValue {
  journeys: ExamJourney[]
  activeJourney: ExamJourney | null
  setJourneys: (journeys: ExamJourney[]) => void
  setActiveJourney: (journey: ExamJourney | null) => void
  addOrUpdateJourney: (journey: ExamJourney) => void
}

const ExamContext = createContext<ExamContextValue | null>(null)

export function ExamProvider({ children }: { children: ReactNode }) {
  const { user } = useAuth()
  const [journeys, setJourneys] = useState<ExamJourney[]>([])
  const [activeJourney, setActiveJourney] = useState<ExamJourney | null>(null)

  // Reset context state whenever user changes or logs out
  useEffect(() => {
    setJourneys([])
    setActiveJourney(null)
  }, [user?.id])

  const addOrUpdateJourney = useCallback((journey: ExamJourney) => {
    setJourneys((prev) => {
      const idx = prev.findIndex((j) => j.plan_id === journey.plan_id)
      if (idx === -1) return [...prev, journey]
      const updated = [...prev]
      updated[idx] = journey
      return updated
    })
  }, [])


  return (
    <ExamContext.Provider value={{ journeys, activeJourney, setJourneys, setActiveJourney, addOrUpdateJourney }}>
      {children}
    </ExamContext.Provider>
  )
}

export function useExam() {
  const ctx = useContext(ExamContext)
  if (!ctx) throw new Error('useExam must be used inside ExamProvider')
  return ctx
}
