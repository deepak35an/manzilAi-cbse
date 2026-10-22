import { useParams, useNavigate, useLocation } from 'react-router-dom'
import { useState, useEffect, useRef, useCallback } from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { submitAnswer, completeQuiz } from '@/services/quizApi'
import type { Question } from '@/types/quiz'
import { STUDENT_ROUTES } from '@/lib/constants'
import { cn } from '@/lib/utils'
import { Clock, AlertTriangle } from 'lucide-react'
import RichText from '@/components/quiz/RichText'
import QuestionText from '@/components/quiz/QuestionText'

export default function TestAttempt() {
  const { id: planId, testId } = useParams<{ id: string; testId: string }>()
  const navigate = useNavigate()
  const location = useLocation()
  const routeState = location.state as { session_id: string; first_question: Question; total: number; test_number?: number } | null

  const weekNumber = parseInt(testId || '1', 10)
  const queryClient = useQueryClient()
  const testNumberFromRoute = routeState?.test_number || 1

  // Persist session so it survives refresh. Include test_number so Test 1/2/3 of the
  // same week do not overwrite each other.
  const STORAGE_KEY = `quiz_session_${planId}_${testId}_${testNumberFromRoute}`
  const LEGACY_STORAGE_KEY = `quiz_session_${planId}_${testId}`

  type SavedSession = { sessionId: string; question: Question | null; total: number; answered: number; startTime: number; statuses: string[]; testNumber?: number }

  const restoreSession = (): SavedSession | null => {
    try {
      const raw = sessionStorage.getItem(STORAGE_KEY) || sessionStorage.getItem(LEGACY_STORAGE_KEY)
      if (raw) return JSON.parse(raw)
    } catch { /* ignore */ }
    return null
  }

  const saved = restoreSession()
  // A newly started test (different session_id in navigation state) always wins over
  // a leftover sessionStorage entry. Same session_id keeps in-progress answers on refresh.
  const initial = (() => {
    if (routeState?.session_id && (!saved || saved.sessionId !== routeState.session_id)) {
      return {
        sessionId: routeState.session_id,
        question: routeState.first_question,
        total: routeState.total,
        answered: 0,
        startTime: Date.now(),
        statuses: Array(routeState.total).fill('none'),
        testNumber: routeState.test_number || 1,
      }
    }
    return saved || null
  })()

  const [sessionId] = useState(() => initial?.sessionId || '')
  const [question, setQuestion] = useState<Question | null>(initial?.question || null)
  const [total] = useState(() => initial?.total || 0)
  const [answered, setAnswered] = useState(initial?.answered || 0)
  const [selectedAnswer, setSelectedAnswer] = useState<string | string[] | null>(null)
  const [natInput, setNatInput] = useState('')
  const [startTime] = useState(() => initial?.startTime || Date.now())
  const [testNumber] = useState(() => initial?.testNumber || 1)
  const [questionStart, setQuestionStart] = useState(() => Date.now())
  const [elapsedSeconds, setElapsedSeconds] = useState(0)
  const [isCompleting, setIsCompleting] = useState(false)
  const [showSubmitConfirm, setShowSubmitConfirm] = useState(false)
  const [submitError, setSubmitError] = useState<string | null>(null)

  type QuestionStatus = 'correct' | 'wrong' | 'skipped' | 'none'
  const [statuses, setStatuses] = useState<QuestionStatus[]>((initial?.statuses as QuestionStatus[]) || Array(total).fill('none'))
  const [showWarning, setShowWarning] = useState(false)
  const [warningKey, setWarningKey] = useState(0)
  const warningTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

  // Persist session to sessionStorage on every meaningful state change
  useEffect(() => {
    if (!sessionId) return
    const data = { sessionId, question, total, answered, startTime, statuses, testNumber }
    try { sessionStorage.setItem(STORAGE_KEY, JSON.stringify(data)) } catch { /* ignore */ }
  }, [sessionId, question, total, answered, startTime, statuses, STORAGE_KEY, testNumber])

  const handlePaletteClick = (idx: number) => {
    if (idx === answered) return
    // Always restart the warning: bump key to force re-render, reset timer
    setShowWarning(true)
    setWarningKey((k) => k + 1)
    if (warningTimer.current) clearTimeout(warningTimer.current)
    warningTimer.current = setTimeout(() => setShowWarning(false), 3000)
  }

  // Timer
  useEffect(() => {
    const interval = setInterval(() => setElapsedSeconds(Math.floor((Date.now() - startTime) / 1000)), 1000)
    return () => clearInterval(interval)
  }, [startTime])

  const doComplete = useCallback(async () => {
    setIsCompleting(true)
    try { sessionStorage.removeItem(STORAGE_KEY) } catch { /* ignore */ }
    // Invalidate before navigation so cached data is cleared immediately
    queryClient.invalidateQueries({ queryKey: ['dashboard', planId] })
    queryClient.invalidateQueries({ queryKey: ['performance', planId] })
    queryClient.invalidateQueries({ queryKey: ['performance-report'] })
    queryClient.invalidateQueries({ queryKey: ['history', planId] })
    queryClient.invalidateQueries({ queryKey: ['plan-status', planId] })
    queryClient.invalidateQueries({ queryKey: ['student-dashboard'] })
    queryClient.invalidateQueries({ queryKey: ['student-performance'] })
    queryClient.invalidateQueries({ queryKey: ['student-history'] })
    try {
      const result = await completeQuiz(sessionId)
      navigate(STUDENT_ROUTES.testResult(planId!, testId!), {
        state: { session_id: sessionId, result },
      })
    } catch {
      navigate(STUDENT_ROUTES.examDashboard(planId!))
    }
  }, [sessionId, planId, testId, navigate, STORAGE_KEY, queryClient])

  const answerMutation = useMutation({
    mutationFn: (payload: { answer: string; thenComplete?: boolean }) =>
      submitAnswer({
        session_id: sessionId,
        question_id: question?.id || '',
        answer: payload.answer,
        time_taken: Math.floor((Date.now() - questionStart) / 1000),
      }),
    onSuccess: (data, variables) => {
      setSubmitError(null)
      setStatuses((prev) => {
        const next = [...prev]
        if (variables.answer === '') {
          next[answered] = 'skipped'
        } else if (data.score > 0) {
          next[answered] = 'correct'
        } else {
          next[answered] = 'wrong'
        }
        return next
      })

      setAnswered((c) => c + 1)
      setSelectedAnswer(null)
      setNatInput('')

      // If caller explicitly requested completion (last question "Save & Submit"),
      // trigger doComplete regardless of what the backend says.
      if (variables.thenComplete) {
        doComplete()
        return
      }

      // For mid-test questions, just advance to the next question.
      // We intentionally do NOT auto-complete here anymore — the student
      // must use the Submit button once they have answered all questions.
      if (data.next_question) {
        setQuestion(data.next_question)
        setQuestionStart(Date.now())
      }
    },
    onError: () => {
      setSubmitError('Failed to save your answer. Please check your connection and try again.')
    },
  })

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

  // True when the student is on the very last unanswered question
  const isLastQuestion = answered === total - 1

  const getAnswer = () => {
    if (effectiveType === 'MCQ' || effectiveType === 'subjective') return selectedAnswer as string || ''
    if (effectiveType === 'MSQ') return (selectedAnswer as string[] || []).join(',')
    if (effectiveType === 'NAT') return natInput
    return ''
  }

  const handleSaveAndNext = () => {
    if (!question) return
    answerMutation.mutate({ answer: getAnswer() })
  }

  // Called only from the "Save & Submit Test" button on the final question.
  // Saves the answer then immediately triggers test completion — no auto-fire.
  const handleSaveAndSubmit = () => {
    if (!question) return
    answerMutation.mutate({ answer: getAnswer(), thenComplete: true })
  }

  const handleSkip = () => {
    // On the last question a skip still requires explicit confirmation via
    // the top-right Submit button — the test will not auto-complete.
    answerMutation.mutate({ answer: '' })
  }

  const handleSubmitTest = () => {
    setShowSubmitConfirm(true)
  }

  const confirmSubmitTest = () => {
    setShowSubmitConfirm(false)
    doComplete()
  }

  const canSubmit = (() => {
    if (effectiveType === 'NAT') return natInput.trim() !== ''
    if (effectiveType === 'MSQ') return (selectedAnswer as string[] || []).length > 0
    return selectedAnswer !== null && selectedAnswer !== ''
  })()

  const formatTime = (s: number) => {
    const hrs = Math.floor(s / 3600)
    const mins = Math.floor((s % 3600) / 60)
    const secs = s % 60
    return `${hrs.toString().padStart(2, '0')}:${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`
  }

  const pendingCount = total - answered

  if (!sessionId || !question) {
    return (
      <div className="max-w-2xl mx-auto card p-10 text-center mt-10">
        <p className="text-gray-400 mb-4">No active test session found.</p>
        <button onClick={() => navigate(STUDENT_ROUTES.examPlan(planId!))} className="btn-primary btn-sm">
          Back to Plan
        </button>
      </div>
    )
  }

  return (
    <div className="flex flex-col h-screen bg-gray-50 font-sans text-gray-900 animate-fade-in overflow-hidden">
      <style>{`
        @keyframes shrink {
          from { width: 100%; }
          to { width: 0%; }
        }
      `}</style>
      
      {/* Top Header */}
      <header className="flex items-center justify-between px-6 py-3 bg-white border-b border-gray-200 shrink-0 shadow-sm z-10">
        <div className="flex items-center gap-4">
          <h1 className="text-xl font-bold tracking-tight">Manzil AI</h1>
          <div className="w-px h-5 bg-gray-300"></div>
          <h2 className="text-sm font-medium text-gray-600">W-{weekNumber} Test {testNumber}</h2>
        </div>
        <div className="flex items-center gap-4">
          <div className="flex items-center gap-2 bg-red-100 text-red-600 px-4 py-1.5 rounded-md font-bold text-sm border border-red-200 shadow-sm">
            <Clock className="w-4 h-4" />
            <span className="font-mono tracking-wider">{formatTime(elapsedSeconds)}</span>
          </div>
          <button
            onClick={handleSubmitTest}
            disabled={isCompleting}
            className="px-5 py-1.5 bg-gray-900 text-white rounded-md font-bold text-sm hover:bg-gray-800 transition-colors disabled:opacity-50"
          >
            Submit
          </button>
        </div>
      </header>

      {/* Main Content Area */}
      <main className="flex flex-1 overflow-hidden">
        
        {/* Left Column (Question + Actions) */}
        <div className="flex-1 flex flex-col border-r border-gray-200 bg-white relative">
          
          {/* Question Meta Header */}
          <div className="flex items-center justify-between px-8 py-4 border-b border-gray-100 shrink-0">
            <div className="flex items-center gap-3">
              <div className="bg-gray-900 text-white text-xs font-bold px-3 py-1 rounded">
                Question {answered + 1}
              </div>
              <span className="text-xs font-bold text-gray-500 uppercase tracking-wider">
                {effectiveType === 'MCQ' ? 'SINGLE CORRECT CHOICE' : effectiveType === 'MSQ' ? 'MULTIPLE CORRECT CHOICE' : effectiveType === 'NAT' ? 'NUMERICAL ANSWER TYPE' : 'SUBJECTIVE'}
              </span>
            </div>
            <div className="text-xs font-medium text-gray-500 flex items-center gap-3">
              <span>Marks: <span className="text-gray-900 font-bold">+1</span></span>
              <span>Negative: <span className="text-red-500 font-bold">0</span></span>
            </div>
          </div>

          {/* Question Body */}
          <div className="flex-1 overflow-y-auto p-8">
            <QuestionText
              text={question.text}
              className="text-[15px] font-medium text-gray-800 mb-8 leading-relaxed max-w-4xl"
            />

            {/* MCQ options (single select only) */}
            {effectiveType === 'MCQ' && question.options && (
              <div className="space-y-4 max-w-3xl">
                {question.options.map((opt, idx) => {
                  const letter = String.fromCharCode(65 + idx)
                  const selected = selectedAnswer === opt
                  const optDisplay = /^\s*[\(\[]?[A-Da-d][\.\)\]]?\s*/.test(opt) ? opt.replace(/^\s*[\(\[]?[A-Da-d][\.\)\]]?\s*/, '') : opt

                  return (
                    <button
                      key={idx}
                      onClick={() => setSelectedAnswer(opt)}
                      className={cn(
                        'w-full flex items-center gap-4 px-5 py-4 rounded-xl border transition-all text-left group',
                        selected
                          ? 'border-indigo-600 bg-indigo-50 shadow-sm'
                          : 'border-gray-200 hover:border-gray-300 bg-white hover:bg-gray-50'
                      )}
                    >
                      <span className={cn(
                        'w-8 h-8 rounded-full flex items-center justify-center text-sm font-bold shrink-0 border transition-all',
                        selected 
                          ? 'bg-indigo-600 text-white border-indigo-600' 
                          : 'bg-white text-gray-600 border-gray-300 group-hover:border-gray-400'
                      )}>{letter}</span>
                      <RichText
                        text={optDisplay}
                        inline
                        className={cn(
                          "text-[15px] w-full",
                          selected ? 'text-indigo-900 font-medium' : 'text-gray-700'
                        )}
                      />
                    </button>
                  )
                })}
              </div>
            )}

            {/* MSQ options (multi select) */}
            {effectiveType === 'MSQ' && question.options && (
              <div className="space-y-4 max-w-3xl">
                {question.options.map((opt, idx) => {
                  const letter = String.fromCharCode(65 + idx)
                  const selected = ((selectedAnswer as string[] || []).includes(opt))
                  const optDisplay = /^\s*[\(\[]?[A-Da-d][\.\)\]]?\s*/.test(opt) ? opt.replace(/^\s*[\(\[]?[A-Da-d][\.\)\]]?\s*/, '') : opt

                  return (
                    <button
                      key={idx}
                      onClick={() => {
                        setSelectedAnswer((prev) => {
                          const arr = (prev as string[] || [])
                          return arr.includes(opt) ? arr.filter((v) => v !== opt) : [...arr, opt]
                        })
                      }}
                      className={cn(
                        'w-full flex items-center gap-4 px-5 py-4 rounded-xl border transition-all text-left group',
                        selected
                          ? 'border-indigo-600 bg-indigo-50 shadow-sm'
                          : 'border-gray-200 hover:border-gray-300 bg-white hover:bg-gray-50'
                      )}
                    >
                      <span className={cn(
                        'w-8 h-8 rounded flex items-center justify-center text-sm font-bold shrink-0 border transition-all',
                        selected 
                          ? 'bg-indigo-600 text-white border-indigo-600' 
                          : 'bg-white text-gray-600 border-gray-300 group-hover:border-gray-400'
                      )}>{letter}</span>
                      <RichText
                        text={optDisplay}
                        inline
                        className={cn(
                          "text-[15px] w-full",
                          selected ? 'text-indigo-900 font-medium' : 'text-gray-700'
                        )}
                      />
                    </button>
                  )
                })}
              </div>
            )}

            {/* NAT input */}
            {effectiveType === 'NAT' && (
              <div className="max-w-md">
                <input
                  type="number"
                  className="w-full px-5 py-4 text-lg border-2 border-gray-200 rounded-xl focus:border-indigo-600 focus:ring-4 focus:ring-indigo-100 outline-none transition-all"
                  placeholder="Enter numerical answer..."
                  value={natInput}
                  onChange={(e) => setNatInput(e.target.value)}
                />
              </div>
            )}

            {/* Subjective input */}
            {effectiveType === 'subjective' && (
              <div className="max-w-3xl">
                <textarea
                  className="w-full px-5 py-4 text-[15px] h-48 border-2 border-gray-200 rounded-xl focus:border-indigo-600 focus:ring-4 focus:ring-indigo-100 outline-none transition-all resize-none"
                  placeholder="Type your detailed answer here..."
                  value={selectedAnswer as string || ''}
                  onChange={(e) => setSelectedAnswer(e.target.value)}
                />
              </div>
            )}
          </div>


          {/* Submit error toast */}
          {submitError && (
            <div className="mx-5 mt-3 flex items-start gap-2 bg-red-50 border border-red-200 text-red-700 text-sm font-medium px-4 py-3 rounded-xl">
              <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
              <span>{submitError}</span>
              <button onClick={() => setSubmitError(null)} className="ml-auto text-red-400 hover:text-red-600 font-bold text-lg leading-none">&times;</button>
            </div>
          )}

          {/* Action Footer */}
          <div className="flex items-center justify-between p-5 border-t border-gray-200 bg-white shrink-0">
            <button
              onClick={() => { setSelectedAnswer(null); setNatInput(''); }}
              className="px-6 py-2.5 border border-gray-300 rounded-lg text-gray-600 font-bold text-sm hover:bg-gray-50 transition-colors focus:ring-2 focus:ring-gray-200 outline-none"
            >
              Clear Response
            </button>

            <div className="flex items-center gap-3">
              {/* Skip is hidden on the last question — student should use Submit */}
              {!isLastQuestion && (
                <button
                  onClick={handleSkip}
                  disabled={answerMutation.isPending || isCompleting}
                  className="px-8 py-2.5 border border-gray-300 rounded-lg text-gray-700 font-bold text-sm hover:bg-gray-50 transition-colors disabled:opacity-50"
                >
                  Skip
                </button>
              )}

              {isLastQuestion ? (
                /* Last question: primary action saves answer AND submits test */
                <button
                  onClick={handleSaveAndSubmit}
                  disabled={!canSubmit || answerMutation.isPending || isCompleting}
                  className={cn(
                    "px-8 py-2.5 bg-green-600 text-white rounded-lg font-bold text-sm transition-colors hover:bg-green-700 focus:ring-4 focus:ring-green-200 outline-none",
                    (!canSubmit || answerMutation.isPending || isCompleting) && "opacity-50 cursor-not-allowed hover:bg-green-600"
                  )}
                >
                  {answerMutation.isPending || isCompleting ? 'Submitting...' : '✓ Save & Submit Test'}
                </button>
              ) : (
                /* All other questions: just advance to next */
                <button
                  onClick={handleSaveAndNext}
                  disabled={!canSubmit || answerMutation.isPending || isCompleting}
                  className={cn(
                    "px-8 py-2.5 bg-indigo-600 text-white rounded-lg font-bold text-sm transition-colors hover:bg-indigo-700 focus:ring-4 focus:ring-indigo-200 outline-none",
                    (!canSubmit || answerMutation.isPending || isCompleting) && "opacity-50 cursor-not-allowed hover:bg-indigo-600"
                  )}
                >
                  {answerMutation.isPending ? 'Saving...' : 'Save & Next'}
                </button>
              )}
            </div>
          </div>
        </div>

        {/* Right Column (Palette) */}
        <div className="w-[320px] flex flex-col bg-slate-50 shrink-0 shadow-[-4px_0_15px_-3px_rgba(0,0,0,0.05)] z-10">
          
          <div className="p-6 flex-1 overflow-y-auto">
            <h3 className="font-bold text-gray-900 mb-4 text-sm">Question Palette</h3>
            
            <div className="grid grid-cols-2 gap-y-3 gap-x-2 mb-8 text-[10px] text-gray-600 font-bold uppercase tracking-wider">
              <div className="flex items-center gap-2"><span className="w-2.5 h-2.5 rounded-full bg-emerald-500 shrink-0"></span> CORRECT</div>
              <div className="flex items-center gap-2"><span className="w-2.5 h-2.5 rounded-full bg-rose-500 shrink-0"></span> WRONG</div>
              <div className="flex items-center gap-2"><span className="w-2.5 h-2.5 rounded-full bg-purple-500 shrink-0"></span> NOT ANSWERED</div>
              <div className="flex items-center gap-2"><span className="w-2.5 h-2.5 rounded-full bg-gray-300 shrink-0"></span> NOT UNLOCKED</div>
            </div>
            
            <div className="grid grid-cols-5 gap-2.5">
              {Array.from({ length: total }).map((_, i) => {
                const status = statuses[i]
                const isCurrent = i === answered
                
                let bgClass = 'bg-gray-200 text-gray-400' // Locked
                if (status === 'correct') bgClass = 'bg-emerald-500 text-white shadow-sm'
                else if (status === 'wrong') bgClass = 'bg-rose-500 text-white shadow-sm'
                else if (status === 'skipped') bgClass = 'bg-purple-500 text-white shadow-sm'
                else if (isCurrent) bgClass = 'bg-white text-indigo-600 border-2 border-indigo-500 shadow-sm'

                return (
                  <button
                    key={i}
                    type="button"
                    onClick={() => handlePaletteClick(i)}
                    className={cn(
                      'w-full aspect-square rounded-lg font-bold flex items-center justify-center text-xs transition-all hover:-translate-y-0.5',
                      bgClass
                    )}
                  >
                    {i + 1}
                  </button>
                )
              })}
            </div>

            {showWarning && (
              <div key={warningKey} className="mt-6 bg-rose-50 border border-rose-200 text-rose-600 px-4 py-3 rounded-xl relative overflow-hidden shadow-sm">
                <div className="flex items-start gap-2 relative z-10">
                  <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
                  <span className="text-[11px] font-bold leading-relaxed uppercase tracking-wide">You cannot jump. Answer or skip the current question.</span>
                </div>
                <div className="absolute bottom-0 left-0 h-1 bg-rose-200 w-full">
                  <div className="h-full bg-rose-500" style={{ animation: 'shrink 3s linear forwards' }} />
                </div>
              </div>
            )}
          </div>

          {/* Progress Footer */}
          <div className="p-6 border-t border-gray-200 bg-white shrink-0">
            <div className="flex justify-between items-end mb-3 text-xs font-bold text-gray-700">
              <span className="uppercase tracking-wider">Overall Progress</span>
              <span className="text-sm">{answered}/{total}</span>
            </div>
            <div className="w-full h-2 bg-gray-100 rounded-full overflow-hidden">
              <div 
                className="h-full bg-indigo-500 transition-all duration-500 ease-out" 
                style={{ width: total > 0 ? `${(answered/total)*100}%` : '0%' }}
              ></div>
            </div>
          </div>

        </div>

      </main>

      {/* Submit Confirmation Modal */}
      {showSubmitConfirm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm">
          <div className="bg-white rounded-2xl shadow-2xl p-8 max-w-md w-full mx-4 space-y-5">
            <div className="flex items-center gap-3">
              <div className="w-12 h-12 bg-amber-100 rounded-full flex items-center justify-center">
                <AlertTriangle className="w-6 h-6 text-amber-600" />
              </div>
              <div>
                <h3 className="text-lg font-bold text-gray-900">Submit Test?</h3>
                <p className="text-sm text-gray-500">This action cannot be undone.</p>
              </div>
            </div>
            
            {pendingCount > 0 && (
              <div className="bg-amber-50 border border-amber-200 rounded-xl px-4 py-3 text-sm text-amber-800 font-medium">
                You have <span className="font-bold">{pendingCount}</span> question{pendingCount > 1 ? 's' : ''} remaining that will be marked as skipped.
              </div>
            )}

            <div className="flex gap-3 pt-2">
              <button
                onClick={() => setShowSubmitConfirm(false)}
                className="flex-1 px-6 py-2.5 border border-gray-300 rounded-lg text-gray-700 font-bold text-sm hover:bg-gray-50 transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={confirmSubmitTest}
                className="flex-1 px-6 py-2.5 bg-red-600 text-white rounded-lg font-bold text-sm hover:bg-red-700 transition-colors"
              >
                Yes, Submit
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
