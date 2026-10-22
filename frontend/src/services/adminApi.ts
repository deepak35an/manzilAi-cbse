import api from './api'
import type { FolderTree, ContentRegistryItem } from '../types/admin'
import type { Organization } from '../types/org'
import type { ScoreDistBucket } from './orgApi'

export const getContentTree = () =>
  api.get<FolderTree[]>('/admin/content').then((r) => r.data)

export const createSubfolder = (data: { root_folder: string; subfolder_name: string }) =>
  api.post('/admin/create-subfolder', data).then((r) => r.data)

export const deleteSubfolder = (rootFolder: string, subfolderName: string) =>
  api.delete(`/admin/delete-subfolder?root_folder=${encodeURIComponent(rootFolder)}&subfolder_name=${encodeURIComponent(subfolderName)}`).then((r) => r.data)

export const uploadQuestionBank = (formData: FormData) =>
  api.post<ContentRegistryItem>('/admin/upload-question-bank', formData, { headers: { 'Content-Type': 'multipart/form-data' } }).then((r) => r.data)

export const setVisibility = (data: { registry_id: string; visibility: string; org_ids?: string[] }) =>
  api.post('/admin/set-visibility', data).then((r) => r.data)

export const setSubfolderVisibility = (data: { root_folder: string; subfolder: string; visibility: string; org_ids?: string[] }) =>
  api.post('/admin/set-subfolder-visibility', data).then((r) => r.data)


export const previewContent = (registryId: string) =>
  api.get(`/admin/content/${registryId}/preview`).then((r) => r.data)

export const deleteQuestionBank = (registryId: string) =>
  api.delete(`/admin/question-bank/${registryId}`).then((r) => r.data)

export const getOrganizations = () =>
  api.get<Organization[]>('/admin/organizations').then((r) => r.data)

export const createOrganization = (data: { name: string; admin_phone?: string; admin_email?: string; duration_months?: number }) =>
  api.post<Organization>('/admin/organizations', data).then((r) => r.data)

export const updateOrganization = (orgId: string, data: { name?: string; is_active?: boolean; config?: Record<string, unknown>; admin_phone?: string; admin_email?: string; renew_months?: number }) =>
  api.put<Organization>(`/admin/organizations/${orgId}`, data).then((r) => r.data)

export const toggleOrganization = (orgId: string) =>
  api.patch<Organization>(`/admin/organizations/${orgId}/toggle`).then((r) => r.data)

export const assignOrgAdmin = (orgId: string, phone: string) =>
  api.post(`/admin/organizations/${orgId}/assign-admin`, { phone }).then((r) => r.data)

export const deleteOrganization = (orgId: string) =>
  api.delete(`/admin/organizations/${orgId}`).then((r) => r.data)

export interface AdminOrgDashboardData {
  total_students: number
  total_tests: number
  completion_rate: number
  most_attempted_exam: string | null
  available_exams: string[]
  selected_exam: string | null
  students_per_batch: { batch: string; count: number }[]
  avg_score_per_batch: { batch: string; avg_score: number }[]
  score_distribution: ScoreDistBucket[]
  weekly_active_users: { week: string; active_users: number }[]
}

export const getAdminOrgDashboard = (orgId: string, exam?: string) =>
  api.get<AdminOrgDashboardData>(`/org/admin-view/${orgId}/dashboard`, { params: exam ? { exam } : {} }).then((r) => r.data)

export interface AdminOrgTopicItem {
  topic: string
  subject: string
  avg_score: number
  attempts: number
  student_count: number
  level: 'strong' | 'moderate' | 'weak'
}

export interface AdminOrgTopicBreakdownData {
  strengths: AdminOrgTopicItem[]
  weaknesses: AdminOrgTopicItem[]
  all_topics: AdminOrgTopicItem[]
  total_students_with_data: number
}

export const getAdminOrgTopicBreakdown = (orgId: string, exam?: string) =>
  api.get<AdminOrgTopicBreakdownData>(`/org/admin-view/${orgId}/topic-breakdown`, { params: exam ? { exam } : {} }).then((r) => r.data)
