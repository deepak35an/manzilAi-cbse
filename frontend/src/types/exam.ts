export interface ExamJourney {
  plan_id: string
  exam: string
  duration_months: number | null
  current_week: number
  total_weeks: number
  completed_weeks: number[]
  created_at?: string
  plan_type?: string | null  // TOPIC_WISE_TESTS when durationless topic plan
}

export interface WeekTest {
  test_number: number           // 1 | 2 | 3
  status: 'locked' | 'current' | 'completed'
  session_id?: string | null
  result_id?: string | null
}

export interface WeekPlan {
  week: number
  subject: string
  topics: string[]
  subtopics?: string[]
  priority: string
  status: 'locked' | 'current' | 'completed'
  session_id?: string
  result_id?: string
  tests_per_week?: number
  tests?: WeekTest[]
}

export interface PlanStatus {
  plan_id: string
  exam: string
  current_week: number
  total_weeks: number
  weeks: WeekPlan[]
  is_cuet?: boolean
  cuet_subjects?: { plan_id: string; exam: string; label: string }[]
  plan_type?: string | null  // TOPIC_WISE_TESTS for topic-wise plans
}


export interface TopicProficiency {
  [topicKey: string]: number // 1–5 rating
}

export interface GeneratePlanRequest {
  exam: string
  duration_months?: number | null
  topic_proficiency?: TopicProficiency
}

export interface Notification {
  id: string
  title: string
  body: string
  read: boolean
  created_at: string
  link?: string
}
