import api from './api'
import { ContentRegistryItem } from '../types/admin'

export const requestQuestionBank = (formData: FormData) =>
  api.post('/org/request-question-bank', formData, { headers: { 'Content-Type': 'multipart/form-data' } }).then((r) => r.data)

export const getGeneratedJson = (taskId: string) =>
  api.get(`/org/generated-json/${taskId}`).then((r) => r.data)

export const reviewQuestionBank = (data: { task_id: string; questions: Record<string, unknown>[] }) =>
  api.post('/org/review-question-bank', data).then((r) => r.data)

export const confirmQuestionBank = (data: { task_id: string }) =>
  api.post('/org/confirm-question-bank', data).then((r) => r.data)

export interface OrgStudent {
  id: string
  name: string
  phone: string
  email: string | null
  tests_taken: number
  avg_score: number
  status: string
  duration_months?: number | null
  started_at?: string | null
  all_batches?: number[]
  class_name?: string | null
  section?: string | null
  allocated_exams?: string[]
  username?: string | null
  plain_password?: string | null  // Only present once at creation
}

export interface StudentPlanInfo {
  duration_months: number
  started_at: string | null
  current_week: number | null
}

export interface CuetBatchInfo {
  duration_months: number
  subjects: string[]
  started_at: string | null
  current_week: number | null
}

export interface EnrolledBatchInfo {
  exam: string
  is_cuet: boolean
  subjects: string[]
  duration_months: number
  started_at: string | null
  current_week: number | null
  plan_id?: string | null
  plan_ids?: string[]
}

export interface StudentDetail {
  id: string
  name: string
  phone: string
  email: string | null
  duration_months: number | null
  started_at: string | null
  current_week: number | null
  tests_taken: number
  avg_score: number
  recent_tests: {
    id: string
    total_score: number
    max_score: number
    theta_final: number
    created_at: string
    test_name: string
  }[]
  all_batches: number[]
  exam?: string | null
  plans?: StudentPlanInfo[]
  cuet_batches?: CuetBatchInfo[]   // populated for CUET students
  enrolled_batches?: EnrolledBatchInfo[]  // All enrolled batches (CUET & non-CUET)
  class_name?: string | null
  section?: string | null
  allocated_exams?: string[]
  username?: string | null  // student's login username
}

export const getOrgStudents = () =>
  api.get<OrgStudent[]>('/org/students').then((r) => r.data)

export const getOrgStudentDetail = (studentId: string, params?: { plan_id?: string; duration_months?: number }) =>
  api.get<StudentDetail>(`/org/students/${studentId}`, { params }).then((r) => r.data)

export const addStudent = (data: { phone: string; first_name: string; last_name?: string; email?: string; class_name?: string; section?: string; allocated_exams?: string[] }) =>
  api.post<OrgStudent>('/org/students', data).then((r) => r.data)

export const bulkAddStudents = (data: { students: Record<string, string>[] }) =>
  api.post<OrgStudent[]>('/org/students/bulk', data).then((r) => r.data)

export const removeStudent = (studentId: string) =>
  api.delete(`/org/students/${studentId}`).then((r) => r.data)

export const updateStudent = (studentId: string, data: { phone?: string; email?: string; class_name?: string; section?: string; allocated_exams?: string[] }) =>
  api.patch<OrgStudent>(`/org/students/${studentId}`, data).then((r) => r.data)

export const resetStudentCredentials = (studentId: string) =>
  api.post<{ message: string; username: string; new_password: string }>(`/org/students/${studentId}/reset-credentials`).then((r) => r.data)

export const revealStudentPassword = (studentId: string) =>
  api.post<{ username: string; password: string }>(`/org/students/${studentId}/reveal-password`).then((r) => r.data)



export const getOrgAvailableExams = () =>
  api.get<string[]>('/org/available-exams').then((r) => r.data)



// ── Dashboard types ───────────────────────────────────────────────────────

export interface BatchCount {
  batch: string
  count: number
}

export interface BatchAvgScore {
  batch: string
  avg_score: number
}

export interface ScoreDistBucket {
  marks: string
  '3_months': number
  '6_months': number
  '9_months'?: number
  '12_months': number
}

export interface WeeklyActiveUser {
  week: string
  active_users: number
}

export interface OrgDashboardData {
  total_students: number
  total_tests: number
  completion_rate: number
  available_exams: string[]
  selected_exam: string | null
  students_per_batch: BatchCount[]
  avg_score_per_batch: BatchAvgScore[]
  score_distribution: ScoreDistBucket[]
  weekly_active_users: WeeklyActiveUser[]
}

export const getOrgDashboard = (exam?: string) =>
  api.get<OrgDashboardData>('/org/dashboard', { params: exam ? { exam } : {} }).then((r) => r.data)

export interface QuestionBankFolder {
  root_folder: string
  subfolder: string
  bank_count: number
  total_questions: number
}

export const getOrgQuestionBankFolders = () =>
  api.get<QuestionBankFolder[]>('/org/question-bank-folders').then((r) => r.data)

export const getOrgQuestionBanks = (subfolder?: string) =>
  api.get<ContentRegistryItem[]>('/org/question-banks', { params: subfolder ? { subfolder } : {} }).then((r) => r.data)

export interface SyllabusSubtopic {
  name: string
  count: number
}

export interface SyllabusTopic {
  topic: string
  question_count: number
  subtopics: SyllabusSubtopic[]
  source_papers: string[]
}

export interface SyllabusSubject {
  subject: string
  total_questions: number
  total_topics: number
  topics: SyllabusTopic[]
}

export interface OrgSyllabusData {
  exam_folder: string
  last_updated: string
  processed_files_count: number
  processed_papers: string[]
  total_subjects: number
  subjects: SyllabusSubject[]
}

export const getOrgSyllabus = (subfolder: string) =>
  api.get<OrgSyllabusData>(`/org/syllabus/${subfolder}`).then((r) => r.data)


export interface OrgStudentHistory {
  total: number
  results: any[]
}

export const getOrgStudentHistory = (studentId: string, limit = 20, offset = 0, params?: { plan_id?: string; duration_months?: number }) =>
  api.get<OrgStudentHistory>(`/org/students/${studentId}/history`, { params: { limit, offset, ...params } }).then((r) => r.data)

export interface OrgStudentPerformanceReport {
  top_strengths: string[]
  top_weaknesses: string[]
  strengths: any[]
  weaknesses: any[]
  all_topics: any[]
  ai_summary: string | null
}

export const getOrgStudentPerformanceReport = (studentId: string, params?: { plan_id?: string; duration_months?: number }) =>
  api.get<OrgStudentPerformanceReport>(`/org/students/${studentId}/performance-report`, { params }).then((r) => r.data)

export interface OrgTopicItem {
  topic: string
  subject: string
  avg_score: number
  attempts: number
  student_count: number
  level: 'strong' | 'moderate' | 'weak'
}

export interface OrgTopicBreakdownData {
  strengths: OrgTopicItem[]
  weaknesses: OrgTopicItem[]
  all_topics: OrgTopicItem[]
  total_students_with_data: number
}

export const getOrgTopicBreakdown = (exam?: string) =>
  api.get<OrgTopicBreakdownData>('/org/topic-breakdown', { params: exam ? { exam } : {} }).then((r) => r.data)


