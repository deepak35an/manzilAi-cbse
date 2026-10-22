export type QuestionType = 'MCQ' | 'MSQ' | 'NAT' | 'subjective'

export interface Question {
  id: string
  text: string
  type: QuestionType
  options?: string[]
  difficulty: number
  topic?: string
  subject?: string
  subtopic?: string
  source_file?: string
}

export interface SessionMetadata {
  session_id: string
  question_count: number
  topics_covered: string[]
  week_number?: number
  plan_id?: string
  exam?: string
}
