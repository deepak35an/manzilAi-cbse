import { useState, useEffect } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { motion, AnimatePresence } from 'framer-motion'
import { BookOpen, FileText, Briefcase, ArrowLeft, Play, GraduationCap, AlertCircle, Brain, Sparkles, CheckCircle2 } from 'lucide-react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import toast from 'react-hot-toast'
import Card from '../../components/ui/Card'
import Button from '../../components/ui/Button'
import Spinner from '../../components/ui/Spinner'
import { getStudentQuestionBanks } from '../../services/studentApi'
import { startQuiz, getPyqSubtopics, startPyqQuiz, getPyqExams, generateStudyPlan, startWeeklyTest, getMyPlan, completeWeek } from '../../services/quizApi'
import { useQuizStore } from '../../store/quizStore'
import PyqSubtopicSelector from '../../components/student/PyqSubtopicSelector'

const modes = [
  { id: 'subject', icon: BookOpen, title: 'Subject-wise', desc: 'AI-generated questions from your syllabus', color: 'bg-blue-50 text-blue-600' },
  { id: 'pyq', icon: FileText, title: 'PYQ-based', desc: 'GATE / university exam practice with strict grading', color: 'bg-purple-50 text-purple-600' },
  { id: 'job', icon: Briefcase, title: 'Job Readiness', desc: 'Assess your readiness for real-world roles', color: 'bg-green-50 text-green-600' },
]

export default function EvaluationSelector() {
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const [searchParams] = useSearchParams()
  const mode = searchParams.get('mode')
  const [selectedExam, setSelectedExam] = useState<string | null>(null)
  const [prepDuration, setPrepDuration] = useState<number | null>(null)
  const [studyPlan, setStudyPlan] = useState<string | null>(null)
  const [planId, setPlanId] = useState<string | null>(null)
  const [completedWeeks, setCompletedWeeks] = useState<number[]>([])
  const [currentWeek, setCurrentWeek] = useState<number>(1)
  const [isChangingStrategy, setIsChangingStrategy] = useState(false)
  const setQuizState = useQuizStore((state) => state.startQuiz)

  const savePlan = (plan: string, id: string, completed?: number[], current?: number, exam?: string, duration?: number | null) => {
    setStudyPlan(plan)
    setPlanId(id)
    if (completed) setCompletedWeeks(completed)
    if (current) setCurrentWeek(current)
    if (exam) setSelectedExam(exam)
    if (duration != null) setPrepDuration(duration)
    localStorage.setItem('studyPlan', plan)
    localStorage.setItem('planId', id)
  }

  const clearPlan = () => {
    setStudyPlan(null)
    setPlanId(null)
    setCompletedWeeks([])
    setCurrentWeek(1)
    localStorage.removeItem('studyPlan')
    localStorage.removeItem('planId')
    setSelectedExam(null)
    setPrepDuration(null)
    setIsChangingStrategy(false)
  }

  const repairJson = (jsonStr: string) => {
    let current = jsonStr.trim();

    // First pass: try to fix common truncation issues like trailing commas
    current = current.replace(/,\s*$/, "");

    try {
      return JSON.parse(current);
    } catch (e) {
      // Second pass: Balanced bracket approach
      const stack: string[] = [];
      for (let i = 0; i < current.length; i++) {
        const char = current[i];
        if (char === '{') stack.push('}');
        else if (char === '[') stack.push(']');
        else if (char === '}' && stack[stack.length - 1] === '}') stack.pop();
        else if (char === ']' && stack[stack.length - 1] === ']') stack.pop();
      }

      let attempt = current;
      // Remove trailing comma before adding brackets
      attempt = attempt.replace(/,\s*$/, "");

      const reverseStack = [...stack].reverse();
      for (const bracket of reverseStack) {
        attempt += bracket;
        try {
          return JSON.parse(attempt);
        } catch (inner) {
          // If adding this bracket didn't fix it, maybe we need more
        }
      }

      // Third pass: if still failing, try removing last comma and closing
      let desperateAttempt = current.substring(0, current.lastIndexOf(','));
      const desperateStack: string[] = [];
      for (let i = 0; i < desperateAttempt.length; i++) {
        const char = desperateAttempt[i];
        if (char === '{') desperateStack.push('}');
        else if (char === '[') desperateStack.push(']');
        else if (char === '}' && desperateStack[desperateStack.length - 1] === '}') desperateStack.pop();
        else if (char === ']' && desperateStack[desperateStack.length - 1] === ']') desperateStack.pop();
      }
      const desperateReverse = [...desperateStack].reverse();
      for (const bracket of desperateReverse) {
        desperateAttempt += bracket;
        try {
          return JSON.parse(desperateAttempt);
        } catch (inner) { }
      }

      throw e;
    }
  };

  const handleBackToDuration = () => {
    setStudyPlan(null)
    setPrepDuration(null)
    setIsChangingStrategy(true)
  }

  const handleSelectDuration = (months: number) => {
    setPrepDuration(months)
    setIsChangingStrategy(false)
  }

  // After exam + duration are selected, silently check if THIS user already has a plan for that combo.
  // If yes, load it directly (skip Generate screen). If no (404), show Generate button.
  // staleTime: 0 and gcTime: 0 prevent cross-user cache leaks when switching accounts.
  const { data: savedPlan, isLoading: isLoadingSavedPlan } = useQuery({
    queryKey: ['my-plan', selectedExam, prepDuration],
    queryFn: () => getMyPlan({
      exam: selectedExam!,
      duration_months: prepDuration!
    }),
    enabled: mode === 'pyq' && !!selectedExam && !!prepDuration && !studyPlan && !isChangingStrategy,
    retry: false,
    staleTime: 0,
    gcTime: 0,
  })

  // Sync DB plan into local state when it arrives
  useEffect(() => {
    if (savedPlan && !isChangingStrategy) {
      savePlan(
        savedPlan.plan,
        savedPlan.plan_id,
        savedPlan.completed_weeks,
        savedPlan.current_week,
        savedPlan.exam as string,
        savedPlan.duration_months as number
      )
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [savedPlan?.plan_id, isChangingStrategy])

  const { data: banks = [], isLoading } = useQuery({
    queryKey: ['student-banks'],
    queryFn: getStudentQuestionBanks,
    enabled: !!mode && mode !== 'pyq',
  })

  const { data: pyqExams = [], isLoading: isLoadingExams } = useQuery({
    queryKey: ['pyq-exams'],
    queryFn: getPyqExams,
    enabled: mode === 'pyq',
  })

  const { isLoading: isLoadingPyq, error: pyqSubtopicsError } = useQuery({
    queryKey: ['pyq-subtopics', selectedExam],
    queryFn: () => getPyqSubtopics(selectedExam || undefined),
    enabled: mode === 'pyq' && !!selectedExam && !!studyPlan,
  })

  const startMutation = useMutation({
    mutationFn: startQuiz,
    onSuccess: (data, variables) => {
      setQuizState(data.session_id, data.question, data.total_questions, variables.mode)
      navigate(`/student/quiz/${data.session_id}`)
      toast.success('Quiz started!')
    },
    onError: () => toast.error('Failed to start quiz'),
  })

  const pyqStartMutation = useMutation({
    mutationFn: startPyqQuiz,
    onSuccess: (data, variables) => {
      setQuizState(data.session_id, data.question, data.total_questions, variables.mode || 'pyq')
      navigate(`/student/quiz/${data.session_id}`)
      toast.success('Practice session started!')
    },
    onError: () => toast.error('Failed to start session'),
  })

  const planMutation = useMutation({
    mutationFn: generateStudyPlan,
    onSuccess: (data, variables) => {
      savePlan(data.plan, data.plan_id, data.completed_weeks, data.current_week, variables.exam, data.duration_months ?? variables.duration_months)
      toast.success('Strategy generated!')
    },
    onError: () => toast.error('Failed to generate strategy'),
  })

  const weeklyTestMutation = useMutation({
    mutationFn: startWeeklyTest,
    onSuccess: (data) => {
      setQuizState(data.session_id, data.question, data.total_questions, 'pyq')
      navigate(`/student/quiz/${data.session_id}`)
      toast.success(`Weekly test started with ${data.total_questions} questions!`)
    },
    onError: () => toast.error('Failed to start weekly test'),
  })

  const completeWeekMutation = useMutation({
    mutationFn: (weekNumber: number) => completeWeek(weekNumber),
    onSuccess: (data) => {
      setCompletedWeeks(data.completed_weeks)
      setCurrentWeek(data.current_week)
      toast.success('Progress saved!')
    },
    onError: () => toast.error('Failed to save progress'),
  })

  const handleSelect = (selectedMode: string) => {
    if (selectedMode === 'job') navigate('/student/job-eval')
    else navigate(`/student/quiz/select?mode=${selectedMode}`)
  }

  const filteredBanks = banks.filter((b) => {
    if (mode === 'subject') return b.root_folder === 'subjectwise'
    return false
  })

  if (mode) {
    const isPyq = mode === 'pyq'
    return (
      <div className="max-w-4xl mx-auto py-8 px-4">
        <button
          onClick={() => {
            if (isPyq && studyPlan) clearPlan()
            else if (isPyq && prepDuration) setPrepDuration(null)
            else if (isPyq && selectedExam) setSelectedExam(null)
            else navigate('/student/evaluate')
          }}
          className="flex items-center text-sm text-gray-500 hover:text-gray-900 mb-6 transition-colors"
        >
          <ArrowLeft className="w-4 h-4 mr-1" />
          {isPyq && studyPlan ? 'Change Exam' : isPyq && prepDuration ? 'Back to categories' : isPyq && selectedExam ? 'Back to categories' : 'Back to types'}
        </button>

        <div className="mb-8 flex items-start justify-between">
          <div>
            <h1 className="text-3xl font-bold text-gray-900 mb-2">
              {isPyq
                ? (selectedExam ? (prepDuration ? (studyPlan ? 'Your Personalized Strategy' : 'Generating Plan') : 'Preparation Duration') : 'Select Exam Category')
                : 'Subject-wise Practice'}
            </h1>
            <p className="text-gray-500">
              {isPyq
                ? (selectedExam
                  ? (prepDuration
                    ? (studyPlan ? 'Follow this roadmap to maximize your score' : 'Wait while we calculate your path...')
                    : 'How long have you been preparing for this exam?')
                  : 'Which exam are you preparing for?')
                : 'Select a question bank to start your assessment'}
            </p>
          </div>

        </div>

        {pyqSubtopicsError ? (
          <div className="text-center py-20 bg-red-50 rounded-3xl border border-red-100">
            <p className="text-red-600 font-medium">Failed to aggregate question pools</p>
            <p className="text-sm text-red-400 mt-1">Please try refreshing or contact support.</p>
          </div>
        ) : (isLoading || isLoadingExams || (isPyq && !!selectedExam && !!prepDuration && !studyPlan && isLoadingPyq)) ? (
          <div className="flex flex-col items-center justify-center py-20 bg-white rounded-3xl border border-gray-100 shadow-sm">
            <Spinner size="lg" />
            <p className="mt-4 text-sm text-gray-400 animate-pulse">
              Loading options...
            </p>
          </div>
        ) : isPyq && !selectedExam ? (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {pyqExams.map((exam, i) => (
              <motion.div
                key={exam}
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: i * 0.1 }}
              >
                <Card
                  hover
                  className="p-8 text-center border-gray-100 bg-white/50 backdrop-blur-sm group hover:border-primary-200"
                  onClick={() => setSelectedExam(exam)}
                >
                  <div className="w-16 h-16 rounded-3xl bg-primary-50 text-primary-600 flex items-center justify-center mx-auto mb-6 group-hover:scale-110 transition-transform">
                    <GraduationCap className="w-8 h-8" />
                  </div>
                  <h3 className="text-xl font-bold text-gray-900 mb-2">
                    {exam.replace(/_/g, ' ')}
                  </h3>
                  <div className="flex items-center justify-center text-primary-600 text-sm font-semibold opacity-0 group-hover:opacity-100 transition-opacity">
                    View Options <ArrowLeft className="w-4 h-4 ml-2 rotate-180" />
                  </div>
                </Card>
              </motion.div>
            ))}
          </div>
        ) : isPyq && selectedExam && !prepDuration ? (
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            {[3, 6, 12].map((months, i) => (
              <motion.div
                key={months}
                initial={{ opacity: 0, scale: 0.9 }}
                animate={{ opacity: 1, scale: 1 }}
                transition={{ delay: i * 0.05 }}
              >
                <Card
                  hover
                  className="p-6 text-center border-gray-100 hover:border-primary-200 cursor-pointer"
                  onClick={() => handleSelectDuration(months)}
                >
                  <div className="text-2xl font-bold text-primary-600 mb-1">{months}</div>
                  <div className="text-gray-500 text-sm">{months === 1 ? 'Month' : 'Months'}</div>
                </Card>
              </motion.div>
            ))}
          </div>
        ) : isPyq && !!selectedExam && !!prepDuration && !studyPlan && !planMutation.isPending && !planMutation.isError ? (
          isLoadingSavedPlan ? (
            <div className="flex flex-col items-center justify-center py-20">
              <div className="relative w-16 h-16 mx-auto mb-6">
                <div className="absolute inset-0 border-4 border-primary-200 rounded-full" />
                <div className="absolute inset-0 border-4 border-primary-600 border-t-transparent rounded-full animate-spin" />
              </div>
              <p className="text-gray-400 text-sm animate-pulse">Checking your plan...</p>
            </div>
          ) : (
          <div className="flex flex-col items-center justify-center py-20 px-4">
            <motion.div
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              className="w-full max-w-lg bg-white rounded-[40px] p-10 shadow-2xl shadow-primary-100 border border-primary-50 text-center relative overflow-hidden"
            >
              <div className="absolute top-0 right-0 w-32 h-32 bg-primary-50 rounded-full -mr-16 -mt-16 opacity-50" />
              <div className="relative z-10">
                <div className="w-20 h-20 bg-primary-600 rounded-3xl flex items-center justify-center mx-auto mb-8 shadow-xl shadow-primary-200">
                  <Sparkles className="w-10 h-10 text-white" />
                </div>
                <h2 className="text-3xl font-black text-gray-900 mb-4 italic">Ready for your roadmap?</h2>
                <p className="text-gray-500 mb-10 text-lg leading-relaxed">
                  We'll analyze the {selectedExam.replace(/_/g, ' ')} syllabus and create a week-by-week strategy tailored to your {prepDuration} months timeline.
                </p>
                <Button
                  size="lg"
                  variant="primary"
                  className="w-full py-4 text-lg shadow-xl shadow-primary-100"
                  loading={planMutation.isPending}
                  onClick={() => {
                    if (selectedExam && prepDuration) {
                      planMutation.mutate({ exam: selectedExam, duration_months: prepDuration })
                    }
                  }}
                >
                  Generate My Study Plan
                </Button>
              </div>
            </motion.div>
          </div>
          )
        ) : planMutation.isError ? (
          <motion.div
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            className="max-w-2xl mx-auto py-20 px-8 bg-red-500/10 border border-red-500/20 rounded-[40px] text-center"
          >
            <div className="w-16 h-16 bg-red-500/20 rounded-2xl flex items-center justify-center mx-auto mb-6">
              <AlertCircle className="w-8 h-8 text-red-500" />
            </div>
            <h2 className="text-2xl font-bold text-white mb-4">Generation Failed</h2>
            <p className="text-red-200/70 mb-8 leading-relaxed">
              We encountered an issue while crafting your personalized study roadmap.
              This can happen during peak AI traffic. Please try again.
            </p>
            <Button
              variant="primary"
              size="lg"
              className="bg-red-600 hover:bg-red-500 border-none px-12"
              onClick={() => planMutation.reset()}
            >
              Try Again
            </Button>
          </motion.div>
        ) : planMutation.isPending ? (
          <div className="py-20 text-center space-y-8">
            <div className="relative w-24 h-24 mx-auto">
              <div className="absolute inset-0 border-4 border-blue-500/20 rounded-full" />
              <div className="absolute inset-0 border-4 border-blue-500 border-t-transparent rounded-full animate-spin" />
              <div className="absolute inset-0 flex items-center justify-center">
                <Brain className="w-10 h-10 text-blue-500 animate-pulse" />
              </div>
            </div>
            <div>
              <h2 className="text-2xl font-black text-white italic mb-2">Analyzing your curriculum...</h2>
              <p className="text-white/60">Our AI is mapping out your path to GATE success.</p>
            </div>
          </div>
        ) : isPyq && selectedExam && prepDuration && studyPlan ? (
          <div className="space-y-8">
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 bg-white p-6 rounded-2xl border border-gray-100 shadow-sm">
              <div>
                <h2 className="text-xl font-bold text-gray-900 flex items-center gap-2">
                  <GraduationCap className="w-5 h-5 text-primary-600" />
                  Your {selectedExam.replace(/_/g, ' ')} Strategy
                </h2>
                <p className="text-sm text-gray-500 mt-1">
                  Customized {prepDuration} months roadmap • {currentWeek > 1 ? `Week ${currentWeek} in progress` : 'Not started yet'}
                </p>
              </div>
              <Button
                variant="outline"
                size="sm"
                className="text-gray-600 border-gray-100 hover:bg-gray-50"
                onClick={handleBackToDuration}
              >
                Change Strategy
              </Button>
            </div>

            <div className="space-y-10">
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                {(() => {
                  try {
                    if (!studyPlan) return null;
                    let cleanJson = studyPlan!.trim();

                    // Regex-based extraction to find the outermost JSON object
                    // This is more robust than splitting by markdown blocks
                    const jsonMatch = cleanJson.match(/\{[\s\S]*\}/);
                    if (jsonMatch) {
                      cleanJson = jsonMatch[0];
                    }

                    const parsed = repairJson(cleanJson);

                    if (parsed.error) {
                      return (
                        <div className="col-span-full p-8 text-center bg-orange-50 rounded-2xl border border-orange-100">
                          <AlertCircle className="w-12 h-12 text-orange-500 mx-auto mb-4" />
                          <h3 className="text-lg font-bold text-orange-900 mb-2">Generation Failed</h3>
                          <p className="text-orange-600 mb-6">{parsed.message || "The AI was unable to generate your plan. This might be due to a temporary service issue."}</p>
                        </div>
                      );
                    }

                    const roadmap = parsed.roadmap || [];

                    if (roadmap.length > 0) {
                      return roadmap.map((week: any, i: number) => {
                        const isCompleted = completedWeeks.includes(week.week);
                        const isCurrent = currentWeek === week.week;
                        const isLocked = week.week > 1 && !completedWeeks.includes(week.week - 1);

                        return (
                          <motion.div
                            key={i}
                            initial={{ opacity: 0, y: 20 }}
                            animate={{ opacity: 1, y: 0 }}
                            transition={{ delay: i * 0.05 }}
                          >
                            <Card className={`h-full flex flex-col overflow-hidden transition-all hover:shadow-lg bg-white group ${isCompleted ? 'border-green-100 opacity-80' :
                              isCurrent ? 'border-primary-300 ring-2 ring-primary-50' :
                                isLocked ? 'border-gray-200 opacity-60' :
                                  'border-gray-100'
                              }`}>
                              <div className={`${isCompleted ? 'bg-green-50' : isLocked ? 'bg-gray-50' : 'bg-primary-50'} p-4 border-b ${isCompleted ? 'border-green-100' : isLocked ? 'border-gray-200' : 'border-primary-100'} flex items-center justify-between group-hover:bg-primary-600 transition-colors`}>
                                <div>
                                  <h3 className={`font-bold ${isCompleted ? 'text-green-700' : isLocked ? 'text-gray-400' : 'text-primary-700'} group-hover:text-white transition-colors flex items-center gap-2`}>
                                    Week {week.week}
                                    {isCompleted && <CheckCircle2 className="w-4 h-4" />}
                                    {isLocked && <Play className="w-3 h-3 opacity-20" />}
                                  </h3>
                                  <p className={`text-[10px] font-bold ${isCompleted ? 'text-green-400' : isLocked ? 'text-gray-300' : 'text-primary-400'} group-hover:text-white/80 uppercase tracking-wider`}>{isLocked ? "LOCKED" : (week.focus_type || "CORE LEARNING")}</p>
                                </div>
                                <div className="w-8 h-8 rounded-lg bg-white/50 flex items-center justify-center">
                                  {isCompleted ? <CheckCircle2 className="w-4 h-4 text-green-600" /> : isLocked ? <Play className="w-4 h-4 text-gray-300" /> : <BookOpen className="w-4 h-4 text-primary-600" />}
                                </div>
                              </div>
                              <div className="p-5 flex-1 bg-gradient-to-b from-white to-gray-50/30 space-y-4">
                                {(week.subjects || []).map((s: any, sIdx: number) => (
                                  <div key={sIdx} className={`border-l-2 ${isCompleted ? 'border-green-100' : 'border-primary-100'} pl-4 py-1`}>
                                    <div className="flex items-center gap-2 mb-1">
                                      <span className="text-sm font-bold text-gray-800">{s.subject}</span>
                                      {s.priority && (
                                        <span className={`text-[9px] px-1.5 py-0.5 rounded uppercase font-black tracking-tighter ${s.priority === 'CRITICAL' ? 'bg-red-100 text-red-600' :
                                          s.priority === 'HIGH' ? 'bg-orange-100 text-orange-600' :
                                            'bg-blue-100 text-blue-600'
                                          }`}>
                                          {s.priority}
                                        </span>
                                      )}
                                    </div>
                                    <p className="text-[11px] text-gray-500 font-medium mb-2 italic">{s.topic}</p>
                                  </div>
                                ))}
                              </div>
                              <div className="p-4 bg-gray-50/50 border-t border-gray-100 space-y-2">
                                <Button
                                  size="sm"
                                  variant={isCompleted ? "outline" : "primary"}
                                  className="w-full"
                                  disabled={isLocked}
                                  loading={weeklyTestMutation.isPending && weeklyTestMutation.variables?.week_number === week.week}
                                  onClick={() => {
                                    if (planId && selectedExam) {
                                      weeklyTestMutation.mutate({ plan_id: planId, week_number: week.week, exam: selectedExam })
                                    }
                                  }}
                                >
                                  {isLocked ? (
                                    <>
                                      <Play className="w-4 h-4 mr-2 opacity-50" />
                                      Prerequisite Required
                                    </>
                                  ) : (
                                    <>
                                      <Play className="w-4 h-4 mr-2" />
                                      {isCompleted ? 'Re-take Test' : `Start Week ${week.week} Test`}
                                    </>
                                  )}
                                </Button>
                                {!isCompleted && !isLocked && (
                                  <Button
                                    size="sm"
                                    variant="outline"
                                    className="w-full border-dashed"
                                    loading={completeWeekMutation.isPending && completeWeekMutation.variables === week.week}
                                    onClick={() => completeWeekMutation.mutate(week.week)}
                                  >
                                    <CheckCircle2 className="w-4 h-4 mr-2" />
                                    Mark as Complete
                                  </Button>
                                )}
                              </div>
                            </Card>
                          </motion.div>
                        );
                      });
                    }
                  } catch (e) {
                    console.error("Roadmap parsing error:", e, studyPlan);
                    return (
                      <div className="col-span-full p-8 text-center bg-red-50 rounded-2xl border border-red-100">
                        <AlertCircle className="w-12 h-12 text-red-500 mx-auto mb-4" />
                        <h3 className="text-lg font-bold text-red-900 mb-2">Roadmap Parsing Error</h3>
                        <p className="text-red-600 mb-6">There was an issue loading your structured roadmap. The saved version might be corrupted or incomplete.</p>
                        <div className="flex flex-col space-y-4">
                          <div className="flex justify-center space-x-4">
                            <Button variant="outline" onClick={handleBackToDuration} className="w-full">Back to Selection</Button>
                          </div>
                          <details className="text-left bg-white p-4 rounded-xl border border-red-100 overflow-hidden">
                            <summary className="text-xs font-bold text-red-400 cursor-pointer hover:text-red-600 transition-colors">
                              Show Raw Plan (Debug)
                            </summary>
                            <pre className="mt-4 text-[10px] text-gray-600 whitespace-pre-wrap max-h-40 overflow-y-auto font-mono">
                              {studyPlan}
                            </pre>
                          </details>
                        </div>
                      </div>
                    )
                  }
                  return null;
                })()}
              </div>
            </div>
          </div>
        ) : filteredBanks.length === 0 ? (
          <div className="text-center py-12 bg-gray-50 rounded-2xl border-2 border-dashed border-gray-200">
            <p className="text-gray-500">No question banks available for this category yet.</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <AnimatePresence>
              {filteredBanks.map((bank, i) => (
                <motion.div
                  key={bank.id}
                  initial={{ opacity: 0, x: -20 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ delay: i * 0.05 }}
                >
                  <Card className="p-5 flex items-center justify-between group hover:border-primary-200 transition-all hover:shadow-md">
                    <div className="flex-1">
                      <h3 className="font-semibold text-gray-900 mb-1">{bank.title}</h3>
                      <div className="flex items-center gap-3 text-xs text-gray-500">
                        <span className="bg-primary-50 text-primary-600 px-2.5 py-0.5 rounded-full font-medium">{bank.subject || 'All Topics'}</span>
                        <span className="flex items-center"><FileText className="w-3 h-3 mr-1" /> {bank.question_count} Questions</span>
                      </div>
                    </div>
                    <Button
                      size="sm"
                      variant="primary"
                      loading={startMutation.isPending && startMutation.variables?.content_registry_id === bank.id}
                      onClick={() => startMutation.mutate({ content_registry_id: bank.id, mode })}
                      className="md:opacity-0 md:group-hover:opacity-100 transition-opacity"
                    >
                      <Play className="w-4 h-4 mr-2" />
                      Start
                    </Button>
                  </Card>
                </motion.div>
              ))}
            </AnimatePresence>
          </div>
        )}
      </div>
    )
  }

  return (
    <div className="max-w-3xl mx-auto py-8">
      <h1 className="text-2xl font-bold text-gray-900 mb-2">Select Evaluation Type</h1>
      <p className="text-gray-500 mb-8">Choose how you want to be assessed</p>
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        {modes.map((m, i) => (
          <motion.div key={m.id} initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.1 }}>
            <Card hover onClick={() => handleSelect(m.id)} className="p-6 text-center">
              <div className={`w-14 h-14 rounded-2xl flex items-center justify-center mx-auto mb-4 ${m.color}`}>
                <m.icon className="w-7 h-7" />
              </div>
              <h3 className="text-lg font-semibold text-gray-900 mb-2">{m.title}</h3>
              <p className="text-sm text-gray-500">{m.desc}</p>
            </Card>
          </motion.div>
        ))}
      </div>
    </div>
  )
}
