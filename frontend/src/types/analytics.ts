export interface TestResult {
  id: string
  session_id: string
  total_score: number
  max_score: number
  theta_final: number
  ai_summary: string | null
  details: Record<string, unknown> | null
  created_at: string
  // Weekly plan test fields (present when test was part of a study plan)
  week_number?: number
  test_number?: number
  plan_id?: string
  exam_title?: string
  test_name?: string
}

export interface UpcomingTest {
  week_number: number
  test_number?: number
  topics: string[]
  label: string
}

export interface DashboardData {
  total_tests: number
  avg_score: number
  current_theta: number
  recent_results: TestResult[]
  topic_performance: TopicPerformance[]
  // Plan-scoped fields (present when plan_id query param used)
  exam_name?: string
  current_week?: number
  total_weeks?: number
  upcoming_test?: UpcomingTest
  is_cuet?: boolean
  cuet_subjects?: { plan_id: string; exam: string; label: string }[]
  plan_type?: string | null
}


export interface TestResultExtended extends TestResult {
  exam_title?: string
  test_name?: string
  topic?: string
  question_count?: number
  accuracy?: number
  time_taken_total?: number
  week_number?: number
}

export interface TopicPerformance {
  subject: string
  avg_theta: number
  total_attempts: number
  weak_topics: Record<string, unknown> | null
}

export interface JobReport {
  overall_score: number
  skill_scores: Record<string, number>
  readiness_percentage: number
  ai_summary: string | null
  improvement_roadmap: RoadmapItem[] | null
}

export interface RoadmapItem {
  skill: string
  current_score: number
  priority: string
  suggestion: string
}
