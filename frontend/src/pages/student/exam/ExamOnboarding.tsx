import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { BookOpen, ChevronRight, ChevronLeft, Check, Loader2, CheckSquare, Square } from 'lucide-react'
import { useMutation, useQuery } from '@tanstack/react-query'
import {
  generateStudyPlan,
  enrollCuet,
  getAvailableCuetSubjects,
  getAvailableCbseSubjects,
} from '@/services/quizApi'
import { useExam } from '@/context/ExamContext'
import {
  STUDENT_ROUTES,
  EXAM_TYPES,
  TOPIC_WISE_EXAMS,
  PREP_DURATIONS,
  CUET_PREP_DURATIONS,
  TOPIC_PROFICIENCY_LABELS,
} from '@/lib/constants'
import { cn } from '@/lib/utils'

// Topics by exam type (week-wise exams only; CBSE subjects come from the API)
const EXAM_TOPICS: Record<string, string[]> = {
  GATE: ['Data Structures', 'Algorithms', 'Operating Systems', 'Computer Networks', 'DBMS', 'Computer Architecture', 'Theory of Computation', 'Discrete Mathematics', 'Engineering Mathematics', 'Digital Logic'],
  JEE: ['Physics - Mechanics', 'Physics - Electromagnetism', 'Chemistry - Organic', 'Chemistry - Physical', 'Mathematics - Calculus', 'Mathematics - Algebra', 'Mathematics - Coordinate Geometry'],
  UPSC_CSE: ['General Studies I', 'General Studies II', 'General Studies III', 'General Studies IV', 'Essay'],
  CAT: ['Verbal Ability', 'Reading Comprehension', 'Data Interpretation', 'Logical Reasoning', 'Quantitative Aptitude'],
  Other: ['Subject 1', 'Subject 2', 'Subject 3', 'Mathematics', 'Science'],
}

const GATE_STEPS = ['Select Exam', 'Topic Proficiency', 'Duration', 'Creating Plan']
const CUET_STEPS = ['Select Exam', 'Duration', 'Select Subjects', 'Enrolling']
const TOPIC_WISE_STEPS = ['Select Exam', 'Select Subjects', 'Creating Plan']

export default function ExamOnboarding() {
  const navigate = useNavigate()
  const { addOrUpdateJourney, setActiveJourney } = useExam()

  const [step, setStep] = useState(0)
  const [selectedExam, setSelectedExam] = useState('')
  const [proficiency, setProficiency] = useState<Record<string, number>>({})
  const [duration, setDuration] = useState(6)
  const [selectedSubjects, setSelectedSubjects] = useState<string[]>([])
  const [error, setError] = useState('')

  const isCuet = selectedExam === 'CUET'
  const isTopicWise = TOPIC_WISE_EXAMS.includes(selectedExam)
  const STEPS = isCuet ? CUET_STEPS : isTopicWise ? TOPIC_WISE_STEPS : GATE_STEPS
  const topics = EXAM_TOPICS[selectedExam] || []
  const durations = isCuet ? CUET_PREP_DURATIONS : PREP_DURATIONS

  const { data: availableSubjects = [], isLoading: subjectsLoading } = useQuery({
    queryKey: ['cuet-subjects', duration],
    queryFn: () => getAvailableCuetSubjects(duration),
    enabled: isCuet && step === 2,
  })

  const { data: availableCbseSubjects = [], isLoading: cbseSubjectsLoading } = useQuery({
    queryKey: ['cbse-subjects'],
    queryFn: getAvailableCbseSubjects,
    enabled: isTopicWise && step === 1,
  })

  const formatApiError = (err: any, fallback: string) => {
    const detail = err?.response?.data?.detail
    if (typeof detail === 'string') return detail
    if (Array.isArray(detail)) {
      return detail.map((d) => d?.msg || JSON.stringify(d)).join('; ')
    }
    return fallback
  }

  const generateMutation = useMutation({
    mutationFn: async () => {
      // CBSE Class 10: enroll each selected subject plan (e.g. Mathematics, Science)
      if (isTopicWise) {
        if (selectedSubjects.length === 0) {
          throw new Error('Select at least one subject')
        }
        const results = []
        for (const subjectKey of selectedSubjects) {
          const data = await generateStudyPlan({ exam: subjectKey })
          results.push(data)
        }
        return { multi: true as const, results }
      }

      const payload: {
        exam: string
        duration_months?: number | null
        topic_proficiency?: Record<string, number>
      } = {
        exam: selectedExam,
        topic_proficiency: Object.keys(proficiency).length ? proficiency : undefined,
        duration_months: duration,
      }
      const data = await generateStudyPlan(payload)
      return { multi: false as const, results: [data] }
    },
    onSuccess: (payload) => {
      const results = payload.results
      if (!results.length) {
        setError('No plans were created.')
        return
      }
      let firstJourney: ReturnType<typeof addOrUpdateJourney> extends void ? any : any = null
      for (const data of results) {
        const journey = {
          plan_id: data.plan_id,
          exam: data.exam,
          duration_months: data.duration_months ?? null,
          current_week: data.current_week || 1,
          total_weeks: data.total_weeks ?? (data.duration_months ? data.duration_months * 4 : 0),
          completed_weeks: data.completed_weeks || [],
          plan_type: data.plan_type ?? null,
        }
        addOrUpdateJourney(journey)
        if (!firstJourney) firstJourney = journey
      }
      setActiveJourney(firstJourney)
      navigate(STUDENT_ROUTES.examDashboard(firstJourney.plan_id))
    },
    onError: (err: any) => {
      setError(formatApiError(err, err?.message || 'Failed to generate plan. Please try again.'))
    },
  })

  const enrollMutation = useMutation({
    mutationFn: () => enrollCuet({ duration_months: duration, subjects: selectedSubjects }),
    onSuccess: (data) => {
      const primaryPlanId = data.subjects && data.subjects.length > 0 ? data.subjects[0].plan_id : null
      if (primaryPlanId) {
        const journey = {
          plan_id: primaryPlanId,
          exam: 'CUET',
          duration_months: data.duration_months,
          current_week: 1,
          total_weeks: data.duration_months * 4,
          completed_weeks: [],
        }
        addOrUpdateJourney(journey)
        setActiveJourney(journey)
        navigate(STUDENT_ROUTES.examDashboard(primaryPlanId))
      } else {
        navigate(STUDENT_ROUTES.HOME)
      }
    },
    onError: (err: any) => {
      setError(err.response?.data?.detail || 'Enrollment failed. Please try again.')
      setStep(2)
    },
  })

  const handleNext = () => {
    if (step === 0 && !selectedExam) { setError('Please select an exam'); return }
    if (isCuet && step === 2 && selectedSubjects.length === 0) { setError('Select at least one subject'); return }
    if (isTopicWise && step === 1 && selectedSubjects.length === 0) { setError('Select at least one subject'); return }
    setError('')

    if (isCuet) {
      if (step < 2) {
        setStep((s) => s + 1)
      } else {
        setStep(3)
        enrollMutation.mutate()
      }
    } else if (isTopicWise) {
      if (step < 1) {
        setStep((s) => s + 1)
      } else {
        setStep(2)
        setTimeout(() => generateMutation.mutate(), 0)
      }
    } else {
      if (step < 2) {
        setStep((s) => s + 1)
      } else {
        setStep(3)
        setTimeout(() => generateMutation.mutate(), 0)
      }
    }
  }

  const handleBack = () => {
    setError('')
    setStep((s) => Math.max(0, s - 1))
  }

  const toggleSubject = (key: string) => {
    setSelectedSubjects((prev) =>
      prev.includes(key) ? prev.filter((k) => k !== key) : [...prev, key]
    )
  }

  const showProficiency = !isCuet && !isTopicWise && step === 1
  const showDuration = (isCuet && step === 1) || (!isCuet && !isTopicWise && step === 2)
  const subjectList = isTopicWise ? availableCbseSubjects : availableSubjects
  const subjectListLoading = isTopicWise ? cbseSubjectsLoading : subjectsLoading
  const showSubjectPicker =
    (isCuet && step === 2) || (isTopicWise && step === 1)

  return (
    <div className="min-h-screen bg-gradient-to-br from-primary-50 via-white to-accent-50 flex items-center justify-center p-6">
      <div className="w-full max-w-2xl">
        <div className="mb-8">
          <div className="flex items-center justify-between mb-3">
            {STEPS.map((s, i) => (
              <div key={s} className="flex items-center gap-2">
                <div className={cn(
                  'w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold transition-all',
                  i < step ? 'bg-primary-600 text-white' :
                  i === step ? 'bg-primary-600 text-white ring-4 ring-primary-100' :
                  'bg-gray-200 text-gray-400'
                )}>
                  {i < step ? <Check className="w-4 h-4" /> : i + 1}
                </div>
                {i < STEPS.length - 1 && (
                  <div className={cn('hidden sm:block h-0.5 w-12 transition-all', i < step ? 'bg-primary-500' : 'bg-gray-200')} />
                )}
              </div>
            ))}
          </div>
          <p className="text-sm text-gray-400 text-center">{STEPS[step]}</p>
        </div>

        <div className="card p-8">
          {step === 0 && (
            <div>
              <div className="flex items-center gap-3 mb-6">
                <div className="w-10 h-10 bg-primary-100 rounded-xl flex items-center justify-center">
                  <BookOpen className="w-5 h-5 text-primary-600" />
                </div>
                <div>
                  <h2 className="font-bold text-gray-900">Select Your Exam</h2>
                  <p className="text-sm text-gray-500">Which exam are you preparing for?</p>
                </div>
              </div>
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                {EXAM_TYPES.map((exam) => (
                  <button
                    key={exam}
                    onClick={() => { setSelectedExam(exam); setError(''); setProficiency({}); setSelectedSubjects([]) }}
                    className={cn(
                      'p-4 rounded-2xl border-2 text-sm font-semibold transition-all text-left',
                      selectedExam === exam
                        ? 'border-primary-500 bg-primary-50 text-primary-700'
                        : 'border-gray-200 bg-white text-gray-700 hover:border-primary-300 hover:bg-primary-50'
                    )}
                  >
                    {exam}
                    {exam === 'CUET' && (
                      <span className="block text-xs font-normal text-gray-400 mt-1">Multi-subject</span>
                    )}
                    {TOPIC_WISE_EXAMS.includes(exam) && (
                      <span className="block text-xs font-normal text-gray-400 mt-1">Topic-wise tests</span>
                    )}
                  </button>
                ))}
              </div>
              {error && <p className="text-sm text-danger-600 mt-3">{error}</p>}
            </div>
          )}

          {showProficiency && (
            <div>
              <div className="mb-6">
                <h2 className="font-bold text-gray-900 mb-1">Rate Your Topic Proficiency</h2>
                <p className="text-sm text-gray-500">
                  This helps us prioritize weaker topics in your early weeks.
                </p>
              </div>
              <div className="space-y-4 max-h-80 overflow-y-auto pr-1">
                {topics.map((topic) => {
                  const val = proficiency[topic] ?? 3
                  return (
                    <div key={topic}>
                      <div className="flex items-center justify-between mb-1.5">
                        <label className="text-sm font-medium text-gray-700">{topic}</label>
                        <span className={cn(
                          'text-xs font-semibold px-2 py-0.5 rounded-full',
                          val <= 2 ? 'bg-danger-100 text-danger-600' :
                          val === 3 ? 'bg-warning-100 text-warning-600' :
                          'bg-success-100 text-success-700'
                        )}>
                          {TOPIC_PROFICIENCY_LABELS[val]}
                        </span>
                      </div>
                      <input
                        type="range"
                        min={1} max={5} step={1}
                        value={val}
                        onChange={(e) => setProficiency((p) => ({ ...p, [topic]: Number(e.target.value) }))}
                        className="w-full accent-primary-600"
                      />
                      <div className="flex justify-between text-[10px] text-gray-400 mt-0.5">
                        <span>Beginner</span><span>Intermediate</span><span>Expert</span>
                      </div>
                    </div>
                  )
                })}
              </div>
            </div>
          )}

          {showDuration && (
            <div>
              <div className="mb-6">
                <h2 className="font-bold text-gray-900 mb-1">Choose Preparation Duration</h2>
                <p className="text-sm text-gray-500">How much time do you have before your exam?</p>
              </div>
              <div className="space-y-3">
                {durations.map(({ months, label, description }) => (
                  <button
                    key={months}
                    onClick={() => setDuration(months)}
                    className={cn(
                      'w-full p-4 rounded-2xl border-2 text-left transition-all',
                      duration === months
                        ? 'border-primary-500 bg-primary-50'
                        : 'border-gray-200 hover:border-primary-300'
                    )}
                  >
                    <p className={cn('font-semibold', duration === months ? 'text-primary-700' : 'text-gray-900')}>{label}</p>
                    <p className="text-sm text-gray-500 mt-0.5">{description}</p>
                  </button>
                ))}
              </div>
              {error && <p className="text-sm text-danger-600 mt-3">{error}</p>}
            </div>
          )}

          {showSubjectPicker && (
            <div>
              <div className="mb-6">
                <h2 className="font-bold text-gray-900 mb-1">Select Your Subjects</h2>
                <p className="text-sm text-gray-500">
                  {isTopicWise
                    ? 'Choose one or more CBSE Class 10 subjects. Each subject gets its own topic-wise test plan.'
                    : "Choose the subjects you'll prepare for CUET. These cannot be changed after enrollment."}
                </p>
              </div>
              {subjectListLoading ? (
                <div className="flex items-center justify-center py-10">
                  <Loader2 className="w-6 h-6 text-primary-600 animate-spin" />
                </div>
              ) : subjectList.length === 0 ? (
                <div className="p-4 bg-warning-50 rounded-xl text-sm text-warning-700">
                  {isTopicWise
                    ? 'No CBSE Class 10 subject plans are available yet. Ask your administrator to generate and seed them.'
                    : `No subject plans are available for a ${duration}-month duration yet. Please contact your administrator.`}
                </div>
              ) : (
                <div className="grid grid-cols-2 gap-3 max-h-72 overflow-y-auto pr-1">
                  {subjectList.map((subj) => {
                    const selected = selectedSubjects.includes(subj.key)
                    return (
                      <button
                        key={subj.key}
                        onClick={() => toggleSubject(subj.key)}
                        className={cn(
                          'p-3 rounded-2xl border-2 text-left flex items-center gap-3 transition-all',
                          selected
                            ? 'border-primary-500 bg-primary-50'
                            : 'border-gray-200 hover:border-primary-300 bg-white'
                        )}
                      >
                        {selected
                          ? <CheckSquare className="w-4 h-4 text-primary-600 shrink-0" />
                          : <Square className="w-4 h-4 text-gray-400 shrink-0" />
                        }
                        <span className={cn('text-sm font-semibold', selected ? 'text-primary-700' : 'text-gray-700')}>
                          {subj.label}
                        </span>
                      </button>
                    )
                  })}
                </div>
              )}
              {selectedSubjects.length > 0 && (
                <p className="text-xs text-primary-600 mt-3 font-medium">
                  {selectedSubjects.length} subject{selectedSubjects.length > 1 ? 's' : ''} selected
                </p>
              )}
              {error && <p className="text-sm text-danger-600 mt-3">{error}</p>}
            </div>
          )}

          {step === STEPS.length - 1 && (
            <div className="text-center py-8">
              {(enrollMutation.isPending || generateMutation.isPending) ? (
                <>
                  <div className="w-16 h-16 bg-primary-100 rounded-2xl flex items-center justify-center mx-auto mb-5">
                    <Loader2 className="w-9 h-9 text-primary-600 animate-spin" />
                  </div>
                  <h2 className="text-xl font-bold text-gray-900 mb-2">
                    {isCuet
                      ? 'Setting up your CUET plan…'
                      : isTopicWise
                        ? 'Loading your topic-wise plan…'
                        : 'Creating your personalized roadmap…'}
                  </h2>
                  <p className="text-sm text-gray-500 max-w-sm mx-auto">
                    {isCuet
                      ? `Enrolling you in ${selectedSubjects.length} subject${selectedSubjects.length > 1 ? 's' : ''} for your ${duration}-month CUET preparation.`
                      : isTopicWise
                        ? `Linking topic-wise test plans for ${selectedSubjects.length} subject${selectedSubjects.length > 1 ? 's' : ''}. One full test per topic.`
                        : `Our AI is building a week-by-week plan for ${selectedExam}, optimized for your ${duration}-month timeline.`
                    }
                  </p>
                </>
              ) : error ? (
                <>
                  <h2 className="text-xl font-bold text-gray-900 mb-2">Couldn’t start your plan</h2>
                  <div className="mt-4 p-4 bg-danger-50 rounded-xl text-sm text-danger-700 text-left max-w-md mx-auto">
                    <p>{error}</p>
                  </div>
                  <div className="flex items-center justify-center gap-3 mt-6">
                    <button
                      onClick={() => { setError(''); setStep(Math.max(0, STEPS.length - 2)) }}
                      className="btn-outline btn-md"
                    >
                      Back
                    </button>
                    <button
                      onClick={() => {
                        setError('')
                        if (isCuet) enrollMutation.mutate()
                        else generateMutation.mutate()
                      }}
                      className="btn-primary btn-md"
                    >
                      Retry
                    </button>
                  </div>
                </>
              ) : (
                <>
                  <div className="w-16 h-16 bg-primary-100 rounded-2xl flex items-center justify-center mx-auto mb-5">
                    <Loader2 className="w-9 h-9 text-primary-600 animate-spin" />
                  </div>
                  <h2 className="text-xl font-bold text-gray-900 mb-2">Starting…</h2>
                </>
              )}
            </div>
          )}

          {step < STEPS.length - 1 && (
            <div className="flex items-center justify-between mt-8">
              {step > 0 ? (
                <button onClick={handleBack} className="btn-outline btn-md flex items-center gap-2">
                  <ChevronLeft className="w-4 h-4" />
                  Back
                </button>
              ) : (
                <div />
              )}
              <button
                onClick={handleNext}
                disabled={generateMutation.isPending || enrollMutation.isPending}
                className="btn-primary btn-md flex items-center gap-2"
              >
                {isCuet && step === 2
                  ? 'Enroll'
                  : isTopicWise && step === 1
                    ? 'Start Topic Plan'
                    : step === STEPS.length - 2
                      ? (isCuet ? 'Enroll' : 'Generate Plan')
                      : 'Continue'}
                <ChevronRight className="w-4 h-4" />
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
