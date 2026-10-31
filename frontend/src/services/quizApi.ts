import api from './api'
import type { QuizStartResponse, AnswerResponse, QuizCompleteResponse } from '../types/quiz'

export const startQuiz = (data: { content_registry_id: string; mode: string; topics?: string[] }) =>
  api.post<QuizStartResponse>('/quiz/start', data).then((r) => r.data)

export const submitAnswer = (data: { session_id: string; question_id: string; answer: string; time_taken: number; voice_confidence?: number }) =>
  api.post<AnswerResponse>('/quiz/answer', data).then((r) => r.data)

export const completeQuiz = (sessionId: string) =>
  api.post<QuizCompleteResponse>(`/quiz/complete?session_id=${sessionId}`).then((r) => r.data)

export interface PyqSubtopicHierarchy {
  subject: string
  topics: { name: string; subtopics: string[] }[]
}

export const getPyqExams = () =>
  api.get<string[]>('/student/pyq-exams').then((r) => r.data)

export const getPyqSubtopics = (exam?: string) =>
  api.get<PyqSubtopicHierarchy[]>('/student/pyq-subtopics', { params: { exam } }).then((r) => r.data)

export const startPyqQuiz = (data: { subtopics: string[]; mode?: string; prep_duration?: number }) =>
  api.post<QuizStartResponse>('/quiz/start-pyq', data).then((r) => r.data)

export interface StudyPlanData {
  plan: string;
  plan_id: string;
  exam: string;
  duration_months: number | null;
  completed_weeks: number[];
  current_week: number;
  plan_type?: string | null;
  total_weeks?: number | null;
}

export const generateStudyPlan = (data: { exam: string; duration_months?: number | null; topic_proficiency?: Record<string, number> }) =>
  api.post<StudyPlanData>('/quiz/generate-plan', data).then((r) => r.data)

export const startWeeklyTest = (data: { plan_id: string; week_number: number; exam: string; test_number?: number }) =>
  api.post<QuizStartResponse>('/quiz/start-weekly-test', data).then((r) => r.data)

export const getMyPlan = (params?: { exam?: string; duration_months?: number }) =>
  api.get<StudyPlanData>('/quiz/my-plan', { params }).then((r) => r.data)

export const completeWeek = (weekNumber: number, planId?: string) =>
  api.post<{ status: string; completed_weeks: number[]; current_week: number }>(
    `/quiz/complete-week?week_number=${weekNumber}${planId ? `&plan_id=${planId}` : ''}`
  ).then((r) => r.data)

export const getMyPlans = () =>
  api.get<import('@/types/exam').ExamJourney[]>('/quiz/my-plans').then((r) => r.data)

export const getPlanStatus = (planId: string) =>
  api.get<import('@/types/exam').PlanStatus>(`/quiz/plan-status?plan_id=${planId}`).then((r) => r.data)

export interface SessionMeta {
  plan_id: string
  week_number: number
  exam: string
  topics: string[]
  weightage: number
  question_count: number
  marks_per_question: number
  negative_marking: boolean
  plan_type?: string | null
  tests_per_week?: number
  label?: string
}

export const getSessionMeta = (planId: string, weekNumber: number, testNumber?: number) =>
  api.get<SessionMeta>('/quiz/session-meta', { params: { plan_id: planId, week_number: weekNumber, test_number: testNumber ?? 1 } }).then((r) => r.data)

export interface SessionResult {
  session_id: string
  plan_id: string | null
  week_number: number | null
  test_number?: number | null
  plan_type?: string | null
  label?: string | null
  total_score: number
  max_score: number
  theta_final: number
  ai_summary: string | null
  answered: number
  total_questions: number
  correct_count: number       // questions with score > 0
  time_seconds: number
  accuracy: number            // correct_count / total_questions
  responses: {
    question_text: string
    answer: string
    correct_answer: any
    score: number
    topic: string
    explanation?: string
    options?: string[]
  }[]
}

export const getSessionResult = (sessionId: string) =>
  api.get<SessionResult>(`/quiz/session-result?session_id=${sessionId}`).then((r) => r.data)

export const getSummaryStatus = (sessionId: string) =>
  api.get<{ status: 'generating' | 'ready'; ai_summary: string | null }>(
    `/quiz/summary-status?session_id=${sessionId}`
  ).then((r) => r.data)

// ── CUET Multi-Subject API ────────────────────────────────────────────────────

export interface CuetSubject {
  key: string
  label: string
  plan_id: string
}

export interface CuetSubjectProgress {
  plan_id: string
  exam: string
  label: string
  current_week: number
  total_weeks: number
  completed_weeks: number[]
}

export interface CuetPlanGroup {
  duration_months: number
  subjects: CuetSubjectProgress[]
}

export const getAvailableCuetSubjects = (durationMonths: number) =>
  api.get<CuetSubject[]>('/quiz/available-cuet-subjects', { params: { duration_months: durationMonths } }).then((r) => r.data)

export const getAvailableCbseSubjects = () =>
  api.get<CuetSubject[]>('/quiz/available-cbse-subjects').then((r) => r.data)

export const enrollCuet = (data: { duration_months: number; subjects: string[] }) =>
  api.post<{ status: string; duration_months: number; subjects: CuetSubjectProgress[] }>('/quiz/enroll-cuet', data).then((r) => r.data)

export const getMyCuetPlans = () =>
  api.get<CuetPlanGroup[]>('/quiz/my-cuet-plans').then((r) => r.data)

export const startCuetWeeklyTest = (data: { duration_months: number; week_number: number; test_number?: number }) =>
  api.post<import('../types/quiz').QuizStartResponse>('/quiz/start-cuet-weekly-test', data).then((r) => r.data)

