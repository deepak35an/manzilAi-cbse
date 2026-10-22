import { useParams, useLocation, Link } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { getSessionResult } from '@/services/quizApi'
import { STUDENT_ROUTES } from '@/lib/constants'
import { ArrowLeft, CheckCircle2, XCircle, ChevronLeft, ChevronRight, Sparkles } from 'lucide-react'
import { cn } from '@/lib/utils'
import { useState } from 'react'
import RichText from '@/components/quiz/RichText'
import QuestionText from '@/components/quiz/QuestionText'

export default function QuestionReview() {
  const { id: planId, testId } = useParams<{ id: string; testId: string }>()
  const location = useLocation()
  const locationState = location.state as { session_id?: string; returnTo?: string } | null

  // Persist session_id in sessionStorage to handle reloads
  const [sessionId] = useState(() => {
    if (locationState?.session_id) {
      sessionStorage.setItem(`review_session_${planId}_${testId}`, locationState.session_id)
      return locationState.session_id
    }
    return sessionStorage.getItem(`review_session_${planId}_${testId}`) || ''
  })

  const returnTo = locationState?.returnTo || STUDENT_ROUTES.examDashboard(planId!)

  const { data, isLoading, isError } = useQuery({
    queryKey: ['session-result', sessionId],
    queryFn: () => getSessionResult(sessionId),
    enabled: !!sessionId,
  })

  const [currentIdx, setCurrentIdx] = useState(0)

  if (!sessionId) {
    return (
      <div className="max-w-2xl mx-auto card p-10 text-center">
        <p className="text-gray-400 mb-4">No review data available. Please navigate here from a test result or history.</p>
        <Link to={returnTo} className="btn-primary mt-4 inline-block">Go Back</Link>
      </div>
    )
  }

  if (isLoading) {
    return (
      <div className="flex gap-6 animate-pulse">
        <div className="flex-1 skeleton h-[600px] rounded-2xl" />
        <div className="w-64 skeleton h-[400px] rounded-2xl" />
      </div>
    )
  }

  if (isError || !data) {
    return (
      <div className="max-w-2xl mx-auto card p-10 text-center">
        <p className="text-gray-400 mb-4">Could not load review data. The session may have expired.</p>
        <Link to={returnTo} className="btn-primary mt-4 inline-block">Go Back</Link>
      </div>
    )
  }

  const responses = data.responses || []
  const total = responses.length

  if (total === 0) {
    return (
      <div className="max-w-2xl mx-auto card p-10 text-center">
        <p className="text-gray-400 mb-4">No questions found in this test session.</p>
        <Link
          to={STUDENT_ROUTES.testReview(planId!, testId!)}
          state={{ session_id: sessionId, returnTo }}
          className="btn-primary mt-4 inline-block"
        >
          Back to Analysis
        </Link>
      </div>
    )
  }

  const currentQuestion = responses[currentIdx]
  const skipped = !currentQuestion.answer || currentQuestion.answer === ''
  const correct = !skipped && currentQuestion.score > 0
  const wrong = !skipped && !correct

  /**
   * INDEX-BASED OPTION MATCHING
   *
   * The fundamental problem with text-based matching is that CUET questions
   * come in several formats where option text is ambiguous:
   *
   *  1. Combination-type: options prefixed with (A)/(B)/(C)/(D)
   *     e.g. "(D) (A), (B) and (D) only"
   *
   *  2. Match-List type: all options start with "(A)-(...)"
   *     e.g. "(A)-(IV), (B)-(III), (C)-(I), (D)-(II)"
   *     Here every option has the same leading letter 'A', so letter-label
   *     matching creates false positives for ALL options.
   *
   * Solution: resolve any stored answer string to an OPTION INDEX (0-3) in
   * the options array, then compare indices — unambiguous regardless of content.
   */

  /**
   * Helper to clean option text for matching.
   * Strips standalone option prefix like "(A) " or "A. " (only when followed by space, dot, colon).
   * Does NOT strip "(A)-" in match-list items.
   */
  const cleanOptText = (s: string, letter?: string): string => {
    let text = s.trim()
    if (letter) {
      const pat = new RegExp('^\\s*\\(?' + letter + '\\)?[\\.\\:\\s]+\\s*', 'i')
      text = text.replace(pat, '')
    } else {
      text = text.replace(/^\s*\(?[A-Ha-h]\)?[\.\:\s]+\s*/i, '')
    }
    return text.replace(/\s+/g, ' ').trim().toLowerCase()
  }

  /**
   * Given a raw answer string, return the 0-based index of the matching option
   * in `optionsList`. Returns -1 if not found.
   */
  const resolveAnswerIdx = (rawAnswer: string, opts: string[]): number => {
    if (!rawAnswer || !opts.length) return -1
    const rawStr = String(rawAnswer).trim()
    const norm = (s: string) => s.replace(/\s+/g, ' ').trim().toLowerCase()

    // 1. Pure single-letter label (e.g. "B", "(B)", "B.", "b") → convert directly to index
    const singleLabel = rawStr.match(/^\(?([A-Ha-h])\)?[.\]\s]*$/)?.[1]?.toUpperCase()
    if (singleLabel) {
      const letterIdx = singleLabel.charCodeAt(0) - 65 // A=0, B=1, …
      if (letterIdx >= 0 && letterIdx < opts.length) return letterIdx
    }

    // 2. Exact case-insensitive full-text match
    let idx = opts.findIndex(o => norm(o) === norm(rawStr))
    if (idx !== -1) return idx

    // 3. Clean prefix match: compare option text stripped of prefix with answer stripped of prefix
    const cleanedAns = cleanOptText(rawStr)
    if (cleanedAns) {
      idx = opts.findIndex((o, i) => {
        const letter = String.fromCharCode(65 + i)
        const cleanedOpt = cleanOptText(o, letter)
        return cleanedOpt !== '' && cleanedOpt === cleanedAns
      })
      if (idx !== -1) return idx
    }

    // 4. Fallback: answer starts with an option letter prefix matching an option's prefix
    const leadMatch = rawStr.match(/^\s*\(?([A-Ha-h])[\).\:\s]/i)
    if (leadMatch) {
      const leadLetterIdx = leadMatch[1].toUpperCase().charCodeAt(0) - 65
      if (leadLetterIdx >= 0 && leadLetterIdx < opts.length) return leadLetterIdx
    }

    return -1
  }

  /**
   * Resolve a stored answer (any format) to a Set of matched option indices.
   * Works for MCQ (single index), MSQ arrays, and MSQ comma-separated labels.
   */
  const resolveAnswerIdxSet = (rawAnswer: any, opts: string[]): Set<number> => {
    const result = new Set<number>()
    if (!rawAnswer || !opts.length) return result

    // Array format (MSQ correct answers stored as array)
    if (Array.isArray(rawAnswer)) {
      rawAnswer.forEach((a: any) => {
        const i = resolveAnswerIdx(String(a), opts)
        if (i !== -1) result.add(i)
      })
      return result
    }

    const ansStr = String(rawAnswer)

    // Try resolving as a single answer first (most common case)
    const singleIdx = resolveAnswerIdx(ansStr, opts)
    if (singleIdx !== -1) {
      result.add(singleIdx)
      return result
    }

    // Genuine MSQ: every comma-separated token must be a single letter label
    // e.g. "A,C" or "A, B, C" — NOT a long option text that contains commas
    const tokens = ansStr.split(/[\s,]+/).map(t => t.trim()).filter(Boolean)
    if (tokens.length > 1 && tokens.every(t => /^[A-Ha-h]$/i.test(t))) {
      tokens.forEach(t => {
        const letterIdx = t.toUpperCase().charCodeAt(0) - 65
        if (letterIdx >= 0 && letterIdx < opts.length) result.add(letterIdx)
      })
    }

    return result
  }

  const stripOptionPrefix = (opt: string): string => {
    return opt.replace(/^\s*\(?[A-Ha-h]\)?[\.\:\s]+\s*/i, '')
  }

  // Parse options list robustly (can be array, JSON string, or comma-separated string)
  const optionsRaw = currentQuestion.options as any
  let optionsList: string[] = []
  if (Array.isArray(optionsRaw)) {
    optionsList = optionsRaw
  } else if (typeof optionsRaw === 'string' && optionsRaw.trim().length > 0) {
    try {
      const parsed = JSON.parse(optionsRaw)
      if (Array.isArray(parsed)) {
        optionsList = parsed
      } else {
        optionsList = optionsRaw.split(',').map((s: string) => s.trim())
      }
    } catch {
      // If it looks like a JSON array string but failed to parse, or is plain string
      const trimmed = optionsRaw.trim()
      if (trimmed.startsWith('[') && trimmed.endsWith(']')) {
        const cleaned = trimmed.slice(1, -1).replace(/['"]/g, '')
        optionsList = cleaned.split(',').map((s: string) => s.trim())
      } else {
        optionsList = trimmed.split(',').map((s: string) => s.trim())
      }
    }
  }

  const hasOptions = optionsList.length > 0

  // Standardize question type
  // IMPORTANT: Only treat as MSQ if correct_answer is genuinely a list of
  // single-letter labels (e.g. "A,C"). Do NOT infer MSQ just because the
  // correct_answer string contains a comma — match-list and combination-type
  // MCQ options always contain commas as part of their content.
  let inferredType = ''
  if (hasOptions) {
    const isCorrectAnsArray = Array.isArray(currentQuestion.correct_answer)
    const isCorrectAnsComma = (() => {
      if (typeof currentQuestion.correct_answer !== 'string') return false
      const parts = currentQuestion.correct_answer.split(',').map((p: string) => p.trim())
      // Only MSQ if every token after splitting by comma is a SINGLE letter label
      return parts.length > 1 && parts.every((p: string) => /^[A-Ha-h]$/i.test(p))
    })()
    if (isCorrectAnsArray || isCorrectAnsComma) {
      inferredType = 'MSQ'
    } else {
      inferredType = 'MCQ'
    }
  }

  const isMultiChoice = inferredType === 'MCQ' || inferredType === 'MSQ'

  // Pre-resolve student and correct answers to option index sets.
  // This is done ONCE here and reused in renderOptions — no per-option text matching.
  const studentIdxSet = resolveAnswerIdxSet(currentQuestion.answer, optionsList)
  const correctIdxSet = resolveAnswerIdxSet(currentQuestion.correct_answer, optionsList)

  const renderOptions = (type: 'MCQ' | 'MSQ') => {
    if (optionsList.length === 0) return null

    return (
      <div className="space-y-3 max-w-3xl">
        {optionsList.map((opt, idx) => {
          const letter = String.fromCharCode(65 + idx)
          // Index-based: an option is selected/correct if its position in the
          // options array matches the pre-resolved answer index.
          const isSelected = studentIdxSet.has(idx)
          const isCorrectOpt = correctIdxSet.has(idx)

          // Color rules:
          // 1. Badge color: transparent backgrounds with solid borders
          // For user options make it blue, for correct options make it green.
          // Prioritize the user answered style if it is both.
          let badgeClass = 'bg-white text-gray-600 border-gray-300 border'
          if (isSelected) {
            badgeClass = 'bg-indigo-50/70 text-indigo-700 border-indigo-500 border-2 font-bold'
          } else if (isCorrectOpt) {
            badgeClass = 'bg-emerald-50/70 text-emerald-700 border-emerald-500 border-2 font-bold'
          }

          // 2. Container and text color
          let containerClass = 'border-gray-200 bg-white text-gray-700'
          let textClass = 'text-gray-800'
          let tag: React.ReactNode = null

          if (isCorrectOpt) {
            // Correct option -> Green background, green outline, write in green
            containerClass = 'border-emerald-500 bg-emerald-50 shadow-sm'
            textClass = 'text-emerald-700 font-medium'
            tag = (
              <span className="ml-auto shrink-0 text-[11px] font-bold text-emerald-700 uppercase tracking-wide flex items-center gap-1">
                <CheckCircle2 className="w-3.5 h-3.5" />
                {isSelected ? 'Your Answer' : 'Correct'}
              </span>
            )
          } else if (isSelected) {
            // Selected Wrong option -> Red background, red outline, write in red
            containerClass = 'border-rose-500 bg-rose-50 shadow-sm'
            textClass = 'text-rose-700 font-medium'
            tag = (
              <span className="ml-auto shrink-0 text-[11px] font-bold text-rose-600 uppercase tracking-wide flex items-center gap-1">
                <XCircle className="w-3.5 h-3.5" />
                Your Answer
              </span>
            )
          }

          return (
            <div
              key={idx}
              className={cn(
                'flex items-center gap-4 px-5 py-3.5 rounded-xl border transition-all',
                containerClass
              )}
            >
              <span
                className={cn(
                  'flex items-center justify-center text-sm font-bold shrink-0 border transition-all w-8 h-8 rounded-full',
                  badgeClass
                )}
              >
                {letter}
              </span>
              <RichText
                text={stripOptionPrefix(opt)}
                inline
                className={cn('text-sm flex-1 leading-relaxed', textClass)}
              />
              {tag}
            </div>
          )
        })}
      </div>
    )
  }



  return (
    // Use fixed height layout so bottom bar is always visible without scrolling off screen
    <div
      className="flex gap-4 animate-fade-in"
      style={{ height: 'calc(100vh - 112px)' }}
    >
      {/* ── Left: Question Panel ── */}
      <div className="flex-1 flex flex-col bg-white rounded-2xl border border-gray-200 shadow-sm overflow-hidden min-w-0">

        {/* Question meta header */}
        <div className="flex items-center justify-between px-6 py-5 border-b border-gray-100 bg-gray-100/50 shrink-0">
          <div className="flex items-center gap-2 text-sm text-gray-500">
            <span className="font-bold text-gray-900">Question {currentIdx + 1}</span>
            {currentQuestion.topic && (
              <>
                <span className="text-gray-300">·</span>
                <span className="text-gray-500 font-normal">
                  Topic: <span className="text-gray-700 font-medium">{currentQuestion.topic}</span>
                </span>
              </>
            )}
          </div>
          <div className="text-xs font-medium text-gray-400 shrink-0">
            Score:{' '}
            <span
              className={cn(
                'font-bold text-sm',
                correct ? 'text-emerald-600' : wrong ? 'text-rose-600' : 'text-purple-500'
              )}
            >
              {currentQuestion.score}/10
            </span>
          </div>
        </div>

        {/* Scrollable wrapper containing content and bottom bar */}
        <div className="flex-1 overflow-y-auto flex flex-col">
          {/* Scrollable content container with min-height */}
          <div className="flex-grow shrink-0 pt-2 pb-6 px-6 space-y-5 min-h-[400px]">

            {/* Question text */}
            <QuestionText
              text={currentQuestion.question_text}
              className="text-[15px] font-medium text-gray-800 leading-relaxed max-w-4xl"
            />

            {/* MCQ options */}
            {inferredType === 'MCQ' && hasOptions && renderOptions('MCQ')}

            {/* MSQ options */}
            {inferredType === 'MSQ' && hasOptions && renderOptions('MSQ')}

            {/* NAT / Subjective / fallback: show answer boxes */}
            {(!isMultiChoice || !hasOptions) && (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 max-w-4xl">
                <div
                  className={cn(
                    'p-4 rounded-xl border',
                    correct
                      ? 'bg-emerald-50 border-emerald-200'
                      : wrong
                      ? 'bg-rose-50 border-rose-200'
                      : 'bg-purple-50 border-purple-200'
                  )}
                >
                  <p
                    className={cn(
                      'text-[10px] font-bold uppercase tracking-wider mb-2',
                      correct ? 'text-emerald-700' : wrong ? 'text-rose-700' : 'text-purple-700'
                    )}
                  >
                    Your Answer {correct ? '(Correct)' : wrong ? '(Wrong)' : '(Skipped)'}
                  </p>
                  <div className="text-sm font-medium break-words text-gray-800">
                    {skipped ? (
                      <span className="italic text-purple-500 font-normal">Not Answered</span>
                    ) : (
                      <RichText text={(() => {
                        const ans = currentQuestion.answer;
                        return Array.isArray(ans) ? ans.join(', ') : (ans ? String(ans) : '');
                      })()} />
                    )}
                  </div>
                </div>

                {currentQuestion.correct_answer && (
                  <div className="p-4 rounded-xl border bg-emerald-50/60 border-emerald-200">
                    <p className="text-[10px] font-bold text-emerald-700 uppercase tracking-wider mb-2">
                      Correct Answer
                    </p>
                    <div className="text-sm font-medium break-words text-gray-800">
                      <RichText text={(() => {
                        const ans = currentQuestion.correct_answer;
                        return Array.isArray(ans) ? ans.join(', ') : (ans ? String(ans) : '');
                      })()} />
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* Explanation */}
            {currentQuestion.explanation && (
              <div className="bg-indigo-50/40 border border-indigo-100 rounded-xl p-5 max-w-4xl">
                <div className="flex items-center gap-2 mb-2.5">
                  <Sparkles className="w-3.5 h-3.5 text-indigo-500" />
                  <h3 className="text-xs font-bold text-indigo-700 uppercase tracking-wider">
                    Explanation
                  </h3>
                </div>
                <RichText
                  text={currentQuestion.explanation}
                  className="text-sm text-gray-700 leading-relaxed"
                />
              </div>
            )}
          </div>

          {/* ── Bottom bar ── */}
          <div className="flex items-center justify-between px-5 py-4 border-t border-gray-100 shrink-0 mt-auto">
            <Link
              to={STUDENT_ROUTES.testReview(planId!, testId!)}
              state={{ session_id: sessionId, returnTo }}
              className="btn-outline btn-sm flex items-center gap-1.5 font-semibold"
            >
              <ArrowLeft className="w-4 h-4" />
              Back to Analysis
            </Link>

            <div className="flex items-center gap-2">
              <button
                onClick={() => setCurrentIdx((p) => p - 1)}
                disabled={currentIdx === 0}
                className="btn-outline btn-sm flex items-center gap-1 font-semibold disabled:opacity-40 disabled:cursor-not-allowed"
              >
                <ChevronLeft className="w-4 h-4" />
                Prev
              </button>
              <button
                onClick={() => setCurrentIdx((p) => p + 1)}
                disabled={currentIdx === total - 1}
                className="btn-outline btn-sm flex items-center gap-1 font-semibold disabled:opacity-40 disabled:cursor-not-allowed"
              >
                Next
                <ChevronRight className="w-4 h-4" />
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* ── Right: Palette ── */}
      <div className="w-60 shrink-0 bg-white rounded-2xl border border-gray-200 shadow-sm flex flex-col overflow-hidden">
        <div className="px-5 pt-5 pb-3 border-b border-gray-100 shrink-0">
          <h3 className="font-bold text-gray-900 text-sm">Question Palette</h3>

          {/* Legend */}
          <div className="grid grid-cols-2 gap-y-2.5 gap-x-3 mt-3 text-[10px] text-gray-500 font-bold uppercase tracking-wider">
            <div className="flex items-center gap-2">
              <span className="w-2.5 h-2.5 rounded-full bg-indigo-600 shrink-0" />
              Current
            </div>
            <div className="flex items-center gap-2">
              <span className="w-2.5 h-2.5 rounded-full bg-rose-500 shrink-0" />
              Wrong
            </div>
            <div className="flex items-center gap-2">
              <span className="w-2.5 h-2.5 rounded-full bg-emerald-500 shrink-0" />
              Correct
            </div>
            <div className="flex items-center gap-2">
              <span className="w-2.5 h-2.5 rounded-full bg-purple-500 shrink-0" />
              Skipped
            </div>
          </div>
        </div>

        {/* Grid — overflow scrolls inside the panel */}
        <div className="flex-1 overflow-y-auto p-4">
          <div className="grid grid-cols-5 gap-2">
            {responses.map((r, i) => {
              const qSkipped = !r.answer || r.answer === ''
              const qCorrect = !qSkipped && r.score > 0
              const isCurrent = i === currentIdx

              // Selected/current question is highlighted solid blue (indigo)
              const bg = isCurrent
                ? 'bg-indigo-600 hover:bg-indigo-700 text-white shadow-sm ring-2 ring-indigo-500 ring-offset-1'
                : qSkipped
                ? 'bg-purple-500 hover:bg-purple-600 text-white'
                : qCorrect
                ? 'bg-emerald-500 hover:bg-emerald-600 text-white'
                : 'bg-rose-500 hover:bg-rose-600 text-white'

              return (
                <button
                  key={i}
                  onClick={() => setCurrentIdx(i)}
                  className={cn(
                    // fixed square — no scaling so it stays inside the grid box
                    'w-full aspect-square rounded-lg font-bold text-xs transition-all hover:-translate-y-0.5',
                    bg
                  )}
                >
                  {i + 1}
                </button>
              )
            })}
          </div>
        </div>
      </div>
    </div>
  )
}
