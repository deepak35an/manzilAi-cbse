export const API_BASE_URL = '/api'

export const ROLES = {
  STUDENT: 'student',
  ORG_ADMIN: 'org_admin',
  SUPER_ADMIN: 'super_admin',
} as const

export const ROLE_LABELS: Record<string, string> = {
  student: 'Student',
  org_admin: 'Organization',
  super_admin: 'Admin',
}

// Post-login redirect by role
export const ROLE_HOME: Record<string, string> = {
  student: '/student/home',
  org_admin: '/org/dashboard',
  super_admin: '/admin/dashboard',
}

// Legacy: kept for any code still referencing ROLE_DASHBOARDS
export const ROLE_DASHBOARDS: Record<string, string> = ROLE_HOME

export const QUIZ_MODES = {
  SUBJECT: 'subject',
  PYQ: 'pyq',
  JOB: 'job',
} as const

export const FIXED_ROOT_FOLDERS = [
  'Subjectwise Content',
  'Examination Content',
  'Job Description-Based',
]

// Student routes
export const STUDENT_ROUTES = {
  HOME: '/student/home',
  EXAM_ONBOARDING: '/student/exam',
  examDashboard: (id: string) => `/student/exam/${id}/dashboard`,
  examPlan: (id: string) => `/student/exam/${id}/plan`,
  examHistory: (id: string) => `/student/exam/${id}/history`,
  strengthWeakness: (id: string) => `/student/exam/${id}/strength-weakness`,
  topicBreakdown: (id: string) => `/student/exam/${id}/topic-breakdown`,
  testQuiz: (id: string, testId: string | number) => `/student/exam/${id}/${testId}/quiz`,
  testAttempt: (id: string, testId: string | number) => `/student/exam/${id}/${testId}/attempt`,
  testResult: (id: string, testId: string | number) => `/student/exam/${id}/${testId}/result`,
  testReview: (id: string, testId: string | number) => `/student/exam/${id}/${testId}/review/ai-analysis`,
  testQuestionReview: (id: string, testId: string | number) => `/student/exam/${id}/${testId}/review/question-review`,
  // CUET
  CUET_HUB: '/student/cuet-hub',
  cuetAnalysis: (durationMonths: number) => `/student/cuet-hub/analysis?duration=${durationMonths}`,
  JOB: '/student/job',
  JOB_DASHBOARD: '/student/job/dashboard',
}

export const EXAM_TYPES = ['GATE', 'CUET', 'CBSE Class 10', 'JEE', 'UPSC_CSE', 'CAT', 'Other']

/** Exams that use durationless topic-wise study plans (one test per topic). */
export const TOPIC_WISE_EXAMS = ['CBSE Class 10', 'CBSE', 'CBSE_10']

export const PREP_DURATIONS = [
  { months: 3, label: '3 Months', description: 'Intensive crash course' },
  { months: 6, label: '6 Months', description: 'Balanced preparation' },
  { months: 12, label: '12 Months', description: 'Comprehensive plan' },
]

// CUET has different available durations (3, 6, 9 months)
export const CUET_PREP_DURATIONS = [
  { months: 3, label: '3 Months', description: 'Intensive crash course' },
  { months: 6, label: '6 Months', description: 'Balanced preparation' },
  { months: 9, label: '9 Months', description: 'Thorough preparation' },
]

export const TOPIC_PROFICIENCY_LABELS: Record<number, string> = {
  1: 'Beginner',
  2: 'Basic',
  3: 'Intermediate',
  4: 'Advanced',
  5: 'Expert',
}

