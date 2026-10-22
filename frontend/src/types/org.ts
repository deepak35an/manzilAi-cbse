export interface Organization {
  id: string
  name: string
  slug: string
  is_active: boolean
  created_at: string
  admin_phone?: string
  admin_email?: string
  admin_name?: string
  valid_until?: string | null
}

export interface StudentRecord {
  id: string
  name: string
  email: string | null
  phone: string
  tests_taken: number
  avg_score: number
  last_active: string
  status: string
}
