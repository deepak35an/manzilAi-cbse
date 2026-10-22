export interface Question {
  id: string
  text: string
  type: 'MCQ' | 'MSQ' | 'NAT' | 'subjective'
  options: string[] | null
  difficulty: number
  topic: string | null
  subtopic?: string | null
  source_file?: string | null
}

export interface QuizStartResponse {
  session_id: string
  question: Question
  total_questions: number
}

export interface AnswerResponse {
  score: number
  correct_answer: string | null
  explanation: string | null
  next_question: Question | null
  is_complete: boolean
  theta: number
}

export interface QuizCompleteResponse {
  session_id: string
  total_score: number
  max_score: number
  theta_final: number
  ai_summary: string | null
  details: Record<string, unknown> | null
}

export type ChatMessageType = 'question' | 'answer' | 'feedback' | 'system'

export interface ChatMessage {
  id: string
  type: ChatMessageType
  content: string
  question?: Question
  score?: number
  explanation?: string
  voice_confidence?: number
  timestamp: Date
}
