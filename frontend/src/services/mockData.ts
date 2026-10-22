/**
 * Mock data layer — used when VITE_USE_MOCK=true.
 * Each function mirrors the shape of the corresponding real API response.
 */

import type { ExamJourney } from '@/types/exam'
import type { User } from '@/types/auth'

export const USE_MOCK = import.meta.env.VITE_USE_MOCK === 'true'

// ─── Auth ─────────────────────────────────────────────────────────────────────

export const mockUser: User = {
  id: 'mock-user-1',
  phone: '9876543210',
  email: 'student@manzil.ai',
  name: 'Rahul Sharma',
  role: 'student',
  org_id: 'mock-org-1',
  org_name: 'Demo Institute',
}

export const mockToken = 'mock-jwt-token'

// ─── Exam journeys ────────────────────────────────────────────────────────────

export const mockJourneys: ExamJourney[] = [
  {
    plan_id: 'plan-gate-2024',
    exam: 'GATE',
    duration_months: 6,
    current_week: 4,
    total_weeks: 24,
    completed_weeks: [1, 2, 3],
  },
  {
    plan_id: 'plan-cuet-2024',
    exam: 'CUET',
    duration_months: 3,
    current_week: 2,
    total_weeks: 12,
    completed_weeks: [1],
  },
]

// ─── Dashboard ────────────────────────────────────────────────────────────────

export const mockDashboard = {
  exam_name: 'GATE',
  current_week: 4,
  total_weeks: 24,
  total_tests: 12,
  avg_score: 72.4,
  current_theta: 0.82,
  upcoming_test: { week_number: 4, test_number: 1, topics: ['Data Structures', 'Algorithms'], label: 'W-4 Test 1' },
  recent_results: [
    { id: 'r1', session_id: 's1', total_score: 75, max_score: 100, theta_final: 0.9, created_at: '2026-06-22T10:00:00Z', exam_title: 'GATE Week 3' },
    { id: 'r2', session_id: 's2', total_score: 68, max_score: 100, theta_final: 0.75, created_at: '2026-06-15T10:00:00Z', exam_title: 'GATE Week 2' },
    { id: 'r3', session_id: 's3', total_score: 82, max_score: 100, theta_final: 1.1, created_at: '2026-06-08T10:00:00Z', exam_title: 'GATE Week 1' },
  ],
  topic_performance: [
    { subject: 'Data Structures', avg_theta: 0.9, total_attempts: 45, weak_topics: ['Graphs'] },
    { subject: 'Algorithms', avg_theta: 0.7, total_attempts: 38, weak_topics: ['Dynamic Programming'] },
    { subject: 'Operating Systems', avg_theta: 0.5, total_attempts: 22, weak_topics: ['Memory Management', 'Scheduling'] },
    { subject: 'Computer Networks', avg_theta: 0.3, total_attempts: 18, weak_topics: ['TCP/IP', 'Routing'] },
  ],
}

// ─── Performance ─────────────────────────────────────────────────────────────

export const mockPerformance = {
  strengths: [
    { topic: 'Binary Trees', subject: 'Data Structures', avg_score: 8.4, attempts: 12 },
    { topic: 'Sorting Algorithms', subject: 'Algorithms', avg_score: 7.9, attempts: 15 },
    { topic: 'Process Synchronization', subject: 'Operating Systems', avg_score: 7.5, attempts: 8 },
  ],
  weaknesses: [
    { topic: 'Dynamic Programming', subject: 'Algorithms', avg_score: 3.2, attempts: 10 },
    { topic: 'Network Routing', subject: 'Computer Networks', avg_score: 2.8, attempts: 7 },
    { topic: 'Memory Management', subject: 'Operating Systems', avg_score: 3.5, attempts: 9 },
  ],
}

export const mockPerformanceReport = {
  top_strengths: ['Binary Trees and Tree Traversals', 'Sorting and Searching Algorithms', 'CPU Scheduling'],
  top_weaknesses: ['Dynamic Programming approaches', 'Network Layer Protocols', 'Virtual Memory'],
  ai_summary: 'You have a strong foundation in data structures and classical algorithms. Your performance in tree-based problems is excellent. To improve, focus on dynamic programming problem-solving patterns and network layer concepts. Dedicate at least 2 hours daily to DP practice.',
}

// ─── Plan ─────────────────────────────────────────────────────────────────────

export const mockPlanStatus = {
  plan_id: 'plan-gate-2024',
  exam: 'GATE',
  current_week: 4,
  total_weeks: 24,
  weeks: Array.from({ length: 24 }, (_, i) => ({
    week: i + 1,
    topics: i < 4 ? ['Topic A', 'Topic B'] : [`Subject ${Math.ceil((i + 1) / 4)}`, `Chapter ${i + 1}`],
    weightage: 15 + Math.floor(Math.random() * 20),
    status: (i + 1 < 4 ? 'completed' : i + 1 === 4 ? 'current' : 'locked') as 'completed' | 'current' | 'locked',
    session_id: i + 1 < 4 ? `session-w${i + 1}` : undefined,
    result_id: i + 1 < 4 ? `result-w${i + 1}` : undefined,
  })),
}

// ─── History ─────────────────────────────────────────────────────────────────

export const mockHistory = {
  total: 12,
  results: Array.from({ length: 12 }, (_, i) => ({
    id: `r${i + 1}`,
    session_id: `s${i + 1}`,
    total_score: 55 + Math.floor(Math.random() * 40),
    max_score: 100,
    theta_final: 0.5 + Math.random() * 0.8,
    created_at: new Date(Date.now() - i * 7 * 24 * 60 * 60 * 1000).toISOString(),
    exam_title: `GATE Week ${12 - i}`,
    test_name: `W-${12 - i} Test 1`,
    topic: 'Mixed Topics',
    question_count: 20,
    accuracy: 0.5 + Math.random() * 0.4,
    time_taken_total: 1200 + Math.floor(Math.random() * 800),
  })),
}

// ─── Notifications ────────────────────────────────────────────────────────────

export const mockNotifications = [
  { id: 'n1', title: 'Week 4 Evaluation Ready', body: 'Your Week 4 evaluation is unlocked and ready to start.', read: false, created_at: new Date().toISOString(), link: '' },
  { id: 'n2', title: 'Great Progress!', body: 'You completed Week 3 with 75%. Keep it up!', read: false, created_at: new Date(Date.now() - 86400000).toISOString() },
  { id: 'n3', title: 'Performance Tip', body: 'Focus on Dynamic Programming this week — it carries 20% weightage.', read: true, created_at: new Date(Date.now() - 2 * 86400000).toISOString() },
]

// ─── PYQ Exams ────────────────────────────────────────────────────────────────

export const mockPyqExams = ['GATE', 'CUET', 'JEE', 'UPSC_CSE', 'CAT']

export const mockPyqSubtopics = [
  {
    subject: 'Data Structures',
    topics: [
      { name: 'Arrays & Strings', subtopics: ['1D Arrays', '2D Arrays', 'String Manipulation'] },
      { name: 'Linked Lists', subtopics: ['Singly Linked', 'Doubly Linked', 'Circular'] },
      { name: 'Trees', subtopics: ['Binary Trees', 'BST', 'AVL Trees', 'Heaps'] },
      { name: 'Graphs', subtopics: ['BFS', 'DFS', 'Shortest Path', 'MST'] },
    ],
  },
  {
    subject: 'Algorithms',
    topics: [
      { name: 'Sorting', subtopics: ['Comparison-based', 'Non-comparison'] },
      { name: 'Dynamic Programming', subtopics: ['1D DP', '2D DP', 'Interval DP'] },
      { name: 'Greedy', subtopics: ['Activity Selection', 'Huffman Coding'] },
    ],
  },
]

// ─── Quiz ─────────────────────────────────────────────────────────────────────

export const mockQuestion = {
  id: 'q1',
  text: 'What is the time complexity of binary search?',
  type: 'MCQ' as const,
  options: ['O(1)', 'O(log n)', 'O(n)', 'O(n log n)'],
  difficulty: 0.5,
  topic: 'Algorithms',
  subject: 'Data Structures',
  subtopic: 'Searching',
}

export const mockSessionStart = {
  session_id: 'mock-session-1',
  question: mockQuestion,
  total_questions: 20,
  topics_covered: ['Data Structures', 'Algorithms'],
  week_number: 4,
  plan_id: 'plan-gate-2024',
}

export const mockAnswerResponse = {
  score: 10,
  correct_answer: 'O(log n)',
  explanation: 'Binary search divides the search space in half each iteration, giving O(log n) time complexity.',
  is_complete: false,
  theta: 0.85,
  next_question: {
    id: 'q2',
    text: 'Which data structure uses LIFO principle?',
    type: 'MCQ' as const,
    options: ['Queue', 'Stack', 'Heap', 'Tree'],
    difficulty: 0.3,
    topic: 'Data Structures',
    subject: 'Data Structures',
    subtopic: 'Stack',
  },
}

export const mockQuizComplete = {
  session_id: 'mock-session-1',
  total_score: 75,
  max_score: 100,
  theta_final: 0.95,
  ai_summary: 'Strong performance overall. You handled medium-difficulty questions well. Work on high-difficulty graph problems.',
  time_taken_total: 1240,
  avg_time_per_question: 62,
  questions_attempted: 20,
  questions_correct: 15,
  questions_skipped: 2,
  details: {
    responses: [
      { question_text: 'Binary search complexity?', answer: 'O(log n)', correct_answer: 'O(log n)', score: 10, explanation: 'Correct! Divides search space in half each time.' },
    ],
  },
}
