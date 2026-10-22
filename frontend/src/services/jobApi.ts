import api from './api'
import type { JobReport } from '../types/analytics'

export const parseJd = (data: { job_description: string }) =>
  api.post<{ skills: string[]; experience_level: string; role_title: string }>('/job/parse', data).then((r) => r.data)

export const parseJdPdf = (file: File, description?: string) => {
  const formData = new FormData()
  formData.append('file', file)
  if (description) formData.append('description', description)
  return api.post<{ skills: string[]; experience_level: string; role_title: string }>(
    '/job/parse-pdf', formData, { headers: { 'Content-Type': 'multipart/form-data' } }
  ).then((r) => r.data)
}

export const generateJobQuestions = (data: { skills: string[]; difficulty: string; count: number }) =>
  api.post<{ task_id: string; question_count: number; content_registry_id?: string }>('/job/generate-questions', data).then((r) => r.data)

export const getJobReport = (sessionId: string) =>
  api.get<JobReport>(`/job/report/${sessionId}`).then((r) => r.data)
