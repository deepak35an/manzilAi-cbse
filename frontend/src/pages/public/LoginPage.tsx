import { useState, useEffect, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import { GraduationCap, ArrowLeft, RefreshCw, Eye, EyeOff } from 'lucide-react'
import { useAuth } from '@/context/AuthContext'
import { sendOtp, verifyOtp, studentLogin } from '@/services/authApi'
import { ROLE_HOME } from '@/lib/constants'
import { cn } from '@/lib/utils'

const ROLES = [
  { id: 'student', label: 'Student' },
  { id: 'org_admin', label: 'Organization' },
  { id: 'super_admin', label: 'Admin' },
] as const

const OTP_RESEND_DELAY = 30 // seconds

export default function LoginPage() {
  const [role, setRole] = useState<'student' | 'org_admin' | 'super_admin'>('student')
  const [step, setStep] = useState<'phone' | 'otp'>('phone')

  // OTP fields (for org_admin / super_admin)
  const [phone, setPhone] = useState('')
  const [otpDigits, setOtpDigits] = useState(['', '', '', '', '', ''])
  const [resendCountdown, setResendCountdown] = useState(0)
  const inputRefs = useRef<(HTMLInputElement | null)[]>([])

  // Password fields (for students)
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)

  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  const { login, isAuthenticated, user } = useAuth()
  const navigate = useNavigate()

  const isStudent = role === 'student'

  // Already logged in — redirect
  useEffect(() => {
    if (isAuthenticated && user) {
      navigate(ROLE_HOME[user.role] || '/')
    }
  }, [isAuthenticated, user, navigate])

  // Countdown timer for OTP resend
  useEffect(() => {
    if (resendCountdown <= 0) return
    const t = setTimeout(() => setResendCountdown((c) => c - 1), 1000)
    return () => clearTimeout(t)
  }, [resendCountdown])

  const resetForm = () => {
    setError('')
    setPhone('')
    setOtpDigits(['', '', '', '', '', ''])
    setUsername('')
    setPassword('')
    setStep('phone')
  }

  // ── Student: username + password ────────────────────────────────────────
  const handleStudentLogin = async () => {
    if (!username.trim() || !password) {
      setError('Please enter your username and password.')
      return
    }
    setLoading(true)
    setError('')
    try {
      const result = await studentLogin({ username: username.trim(), password })
      login(result.access_token, result.user)
      navigate(ROLE_HOME[result.user.role] || '/')
    } catch (err: any) {
      setError(err.response?.data?.detail || 'Invalid username or password.')
    } finally {
      setLoading(false)
    }
  }

  // ── OTP flow (org_admin / super_admin) ───────────────────────────────────
  const handleSendOtp = async () => {
    if (phone.replace(/\D/g, '').length !== 10) {
      setError('Please enter a valid 10-digit phone number')
      return
    }
    setLoading(true)
    setError('')
    try {
      await sendOtp({ phone: `+91${phone.replace(/\D/g, '')}`, role })
      setStep('otp')
      setResendCountdown(OTP_RESEND_DELAY)
      setOtpDigits(['', '', '', '', '', ''])
      setTimeout(() => inputRefs.current[0]?.focus(), 100)
    } catch (err: any) {
      setError(err.response?.data?.detail || 'Failed to send OTP. Please try again.')
    } finally {
      setLoading(false)
    }
  }

  const handleResend = async () => {
    if (resendCountdown > 0) return
    await handleSendOtp()
  }

  const handleOtpInput = (index: number, value: string) => {
    const clean = value.replace(/\D/g, '')
    if (!clean && value) return
    const newDigits = [...otpDigits]
    newDigits[index] = clean.slice(-1)
    setOtpDigits(newDigits)
    setError('')
    if (clean && index < 5) inputRefs.current[index + 1]?.focus()
    if (newDigits.every((d) => d !== '') && clean) handleVerifyOtp(newDigits.join(''))
  }

  const handleOtpPaste = (e: React.ClipboardEvent<HTMLInputElement>) => {
    e.preventDefault()
    const pasted = e.clipboardData.getData('text').replace(/\D/g, '').slice(0, 6)
    if (!pasted) return
    const newDigits = ['', '', '', '', '', '']
    pasted.split('').forEach((ch, idx) => { newDigits[idx] = ch })
    setOtpDigits(newDigits)
    setError('')
    const nextEmpty = newDigits.findIndex((d) => !d)
    inputRefs.current[nextEmpty === -1 ? 5 : nextEmpty]?.focus()
    if (newDigits.every((d) => d !== '')) handleVerifyOtp(newDigits.join(''))
  }

  const handleOtpKeyDown = (index: number, e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Backspace' && !otpDigits[index] && index > 0) {
      inputRefs.current[index - 1]?.focus()
    }
  }

  const handleVerifyOtp = async (otp: string) => {
    setLoading(true)
    setError('')
    try {
      const result = await verifyOtp({ phone: `+91${phone.replace(/\D/g, '')}`, otp })
      login(result.access_token, result.user)
      navigate(ROLE_HOME[result.user.role] || '/')
    } catch (err: any) {
      const msg = err.response?.data?.detail || 'Invalid or expired OTP'
      setError(msg)
      setOtpDigits(['', '', '', '', '', ''])
      setTimeout(() => inputRefs.current[0]?.focus(), 100)
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-primary-50 via-white to-accent-50 flex items-center justify-center px-4">
      <div className="w-full max-w-md">
        {/* Card */}
        <div className="bg-white rounded-3xl shadow-card-lg border border-gray-100 p-8">
          {/* Logo */}
          <div className="text-center mb-8">
            <div className="w-14 h-14 bg-primary-600 rounded-2xl flex items-center justify-center mx-auto mb-4 shadow-card-md">
              <GraduationCap className="w-8 h-8 text-white" />
            </div>
            <h1 className="text-2xl font-bold text-gray-900">Welcome Back</h1>
            <p className="text-gray-500 text-sm mt-1">Sign in to continue to Manzil AI</p>
          </div>

          {/* Role tabs */}
          <div className="flex gap-1 bg-gray-100 rounded-xl p-1 mb-6">
            {ROLES.map(({ id, label }) => (
              <button
                key={id}
                onClick={() => { setRole(id); resetForm() }}
                className={cn(
                  'flex-1 text-sm font-medium py-2 rounded-lg transition-all',
                  role === id
                    ? 'bg-white text-gray-900 shadow-card'
                    : 'text-gray-500 hover:text-gray-700'
                )}
              >
                {label}
              </button>
            ))}
          </div>

          {/* ── Student: Username + Password ── */}
          {isStudent ? (
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1.5">Username</label>
                <input
                  type="text"
                  autoComplete="username"
                  value={username}
                  onChange={(e) => { setUsername(e.target.value); setError('') }}
                  onKeyDown={(e) => e.key === 'Enter' && handleStudentLogin()}
                  placeholder="e.g. john.smith1234"
                  className="input w-full"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1.5">Password</label>
                <div className="relative">
                  <input
                    type={showPassword ? 'text' : 'password'}
                    autoComplete="current-password"
                    value={password}
                    onChange={(e) => { setPassword(e.target.value); setError('') }}
                    onKeyDown={(e) => e.key === 'Enter' && handleStudentLogin()}
                    placeholder="Your password"
                    className="input w-full pr-10"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword((v) => !v)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
                  >
                    {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                </div>
              </div>

              {error && <p className="text-sm text-danger-600 animate-fade-in">{error}</p>}

              <button
                onClick={handleStudentLogin}
                disabled={loading || !username.trim() || !password}
                className="btn-primary btn-md w-full"
              >
                {loading ? (
                  <span className="flex items-center justify-center gap-2">
                    <span className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                    Signing in…
                  </span>
                ) : 'Sign In'}
              </button>

              <p className="text-center text-xs text-gray-400 mt-2">
                Forgot your credentials? Contact your organization admin.
              </p>
            </div>

          ) : step === 'phone' ? (
            // ── OTP: Phone step ──
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1.5">Mobile Number</label>
                <div className="flex gap-2">
                  <div className="flex items-center px-3 py-2.5 bg-gray-50 border border-gray-200 rounded-xl text-sm text-gray-600 font-medium whitespace-nowrap">
                    🇮🇳 +91
                  </div>
                  <input
                    type="tel"
                    maxLength={10}
                    value={phone}
                    onChange={(e) => { setPhone(e.target.value.replace(/\D/g, '')); setError('') }}
                    onKeyDown={(e) => e.key === 'Enter' && handleSendOtp()}
                    placeholder="10-digit number"
                    className="input"
                  />
                </div>
              </div>

              {error && <p className="text-sm text-danger-600 animate-fade-in">{error}</p>}

              <button
                onClick={handleSendOtp}
                disabled={loading || phone.replace(/\D/g, '').length !== 10}
                className="btn-primary btn-md w-full"
              >
                {loading ? (
                  <span className="flex items-center justify-center gap-2">
                    <span className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                    Sending OTP…
                  </span>
                ) : 'Send OTP'}
              </button>
            </div>

          ) : (
            // ── OTP: Code step ──
            <div className="space-y-5">
              <button
                onClick={() => { setStep('phone'); setError(''); setOtpDigits(['','','','','','']) }}
                className="flex items-center gap-1.5 text-sm text-gray-500 hover:text-gray-700 -mt-1"
              >
                <ArrowLeft className="w-4 h-4" />
                Change number
              </button>

              <p className="text-sm text-gray-600">
                Enter the 6-digit code sent to{' '}
                <span className="font-semibold text-gray-900">+91 {phone}</span>
              </p>

              <div className="flex gap-2 justify-center">
                {otpDigits.map((digit, i) => (
                  <input
                    key={i}
                    ref={(el) => { inputRefs.current[i] = el }}
                    type="text"
                    inputMode="numeric"
                    autoComplete={i === 0 ? 'one-time-code' : 'off'}
                    maxLength={6}
                    value={digit}
                    onChange={(e) => handleOtpInput(i, e.target.value)}
                    onKeyDown={(e) => handleOtpKeyDown(i, e)}
                    onPaste={handleOtpPaste}
                    className={cn(
                      'w-11 h-12 text-center text-lg font-bold rounded-xl border transition-all focus:outline-none focus:ring-2',
                      error
                        ? 'border-danger-400 text-danger-600 focus:ring-danger-400'
                        : 'border-gray-200 text-gray-900 focus:ring-primary-500'
                    )}
                  />
                ))}
              </div>

              {error && <p className="text-sm text-danger-600 text-center animate-fade-in">{error}</p>}

              <button
                onClick={() => handleVerifyOtp(otpDigits.join(''))}
                disabled={loading || otpDigits.some((d) => !d)}
                className="btn-primary btn-md w-full"
              >
                {loading ? (
                  <span className="flex items-center justify-center gap-2">
                    <span className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                    Verifying…
                  </span>
                ) : 'Continue'}
              </button>

              <div className="text-center text-sm text-gray-500">
                Didn't receive the code?{' '}
                {resendCountdown > 0 ? (
                  <span className="text-gray-400">Resend in {resendCountdown}s</span>
                ) : (
                  <button
                    onClick={handleResend}
                    disabled={loading}
                    className="text-primary-600 font-medium hover:underline inline-flex items-center gap-1"
                  >
                    <RefreshCw className="w-3.5 h-3.5" />
                    Resend OTP
                  </button>
                )}
              </div>
            </div>
          )}
        </div>

        <p className="text-center text-xs text-gray-400 mt-6">
          Access is by invitation only. Contact your organization admin to register.
        </p>
      </div>
    </div>
  )
}
