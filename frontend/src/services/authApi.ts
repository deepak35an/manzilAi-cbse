import api from './api'
import type { SendOtpRequest, VerifyOtpRequest, TokenResponse, User } from '../types/auth'

export const sendOtp = (data: SendOtpRequest) =>
  api.post<{ message: string; expires_in: number }>('/auth/send-otp', data).then((r) => r.data)

export const verifyOtp = (data: VerifyOtpRequest) =>
  api.post<TokenResponse>('/auth/verify-otp', data).then((r) => r.data)

export const studentLogin = (data: { username: string; password: string }) =>
  api.post<TokenResponse>('/auth/student-login', data).then((r) => r.data)

export const getMe = () =>
  api.get<User>('/auth/me').then((r) => r.data)

export const updateProfile = (data: { new_phone?: string; new_email?: string }) =>
  api.patch<User>('/auth/change-phone', data).then((r) => r.data)

export const changePhone = (new_phone: string) =>
  updateProfile({ new_phone })


