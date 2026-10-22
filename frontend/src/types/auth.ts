export interface User {
  id: string
  phone: string
  email: string | null
  name: string
  role: 'student' | 'org_admin' | 'super_admin'
  org_id: string | null
  org_name: string | null
  username?: string | null
}


export interface TokenResponse {
  access_token: string
  refresh_token: string
  token_type: string
  user: User
}

export interface SendOtpRequest {
  phone: string
  role: string
}

export interface VerifyOtpRequest {
  phone: string
  otp: string
}
