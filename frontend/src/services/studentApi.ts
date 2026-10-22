import api from './api'
import type { DashboardData, TestResult } from '../types/analytics'
import type { ContentRegistryItem } from '../types/admin'

export const getStudentDashboard = (planId?: string) =>
  api.get<DashboardData>('/student/dashboard', { params: planId ? { plan_id: planId } : {} }).then((r) => r.data)

export const getStudentHistory = (limit = 20, offset = 0, planId?: string) =>
  api.get<{ total: number; results: import('@/types/analytics').TestResultExtended[] }>(
    '/student/history',
    { params: { limit, offset, ...(planId ? { plan_id: planId } : {}) } }
  ).then((r) => r.data)

export const getStudentQuestionBanks = () =>
  api.get<ContentRegistryItem[]>('/student/question-banks').then((r) => r.data)

export interface TopicStat {
  topic: string
  subject: string
  avg_score: number
  attempts: number
}

export interface PerformanceData {
  strengths: TopicStat[]
  weaknesses: TopicStat[]
}

export const getStudentPerformance = (planId?: string) =>
  api.get<PerformanceData>('/student/performance', { params: planId ? { plan_id: planId } : {} }).then((r) => r.data)

export const updateStudentContext = (data: { active_plan_id?: string; active_center?: string }) =>
  api.patch('/student/context', data).then((r) => r.data)

export interface PerformanceReport {
  top_strengths: string[]
  top_weaknesses: string[]
  strengths: { topic: string; subject: string; avg_score: number; attempts: number }[]
  weaknesses: { topic: string; subject: string; avg_score: number; attempts: number }[]
  all_topics: { topic: string; subject: string; avg_score: number; attempts: number; level: 'strong' | 'moderate' | 'weak' }[]
  ai_summary: string
}

export const getPerformanceReport = (planId?: string, subjectOnly = false) =>
  api.get<PerformanceReport>('/student/performance-report', {
    params: {
      ...(planId ? { plan_id: planId } : {}),
      ...(subjectOnly ? { subject_only: true } : {}),
    },
  }).then((r) => r.data)


export const getNotifications = (limit = 20) =>
  api.get<import('@/types/exam').Notification[]>('/student/notifications', { params: { limit } }).then((r) => r.data)

export const markNotificationRead = (id: string) =>
  api.patch(`/student/notifications/${id}/read`).then((r) => r.data)

// ── CUET Performance & Dashboard ─────────────────────────────────────────────

export interface CuetSubjectSummary {
  plan_id: string
  exam: string
  label: string
  current_week: number
  total_weeks: number
  completed_weeks: number
  completion_pct: number
}

export interface CuetDashboardData {
  duration_months: number
  total_tests: number
  avg_score: number
  subjects: CuetSubjectSummary[]
  recent_results: {
    id: string
    session_id: string
    week_number: number | null
    test_number: number | null
    total_score: number
    max_score: number
    score_pct: number
    created_at: string
  }[]
}

export const getCuetDashboard = () =>
  api.get<CuetDashboardData>('/student/cuet-dashboard').then((r) => r.data)

export interface CuetTopicStat {
  topic: string
  subject: string
  avg_score: number
  attempts: number
}

export interface CuetSubjectBreakdown {
  exam: string
  label: string
  strengths: CuetTopicStat[]
  weaknesses: CuetTopicStat[]
}

export interface CuetPerformanceData {
  strengths: CuetTopicStat[]
  weaknesses: CuetTopicStat[]
  subjects_breakdown?: CuetSubjectBreakdown[]
  subject?: string
  ai_summary?: string
}

export const getCuetPerformance = (subject?: string) =>
  api.get<CuetPerformanceData>('/student/cuet-performance', { params: subject ? { subject } : {} }).then((r) => r.data)
