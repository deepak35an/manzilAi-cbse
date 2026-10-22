import { useState, useRef, useEffect } from 'react'
import { LogOut, User as UserIcon, Phone, Mail, ChevronDown } from 'lucide-react'
import { useAuthStore } from '../../store/authStore'
import { useUiStore } from '../../store/uiStore'
import { useNavigate } from 'react-router-dom'
import { ROLE_LABELS } from '../../lib/constants'
import { useQueryClient, useMutation } from '@tanstack/react-query'
import { updateProfile } from '../../services/authApi'
import toast from 'react-hot-toast'
import Modal from '../ui/Modal'
import Input from '../ui/Input'
import Button from '../ui/Button'

export default function TopBar() {
  const user = useAuthStore((s) => s.user)
  const setUser = useAuthStore((s) => s.setUser)
  const logout = useAuthStore((s) => s.logout)
  const toggleSidebar = useUiStore((s) => s.toggleSidebar)
  const navigate = useNavigate()
  const queryClient = useQueryClient()

  const [dropdownOpen, setDropdownOpen] = useState(false)
  const [showModal, setShowModal] = useState(false)
  const [newPhone, setNewPhone] = useState('')
  const [newEmail, setNewEmail] = useState('')
  const dropdownRef = useRef<HTMLDivElement>(null)

  // Close dropdown on outside click
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setDropdownOpen(false)
      }
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [])

  const handleLogout = () => {
    setDropdownOpen(false)
    queryClient.clear() // Wipe all cached data so next user starts fresh
    logout()
    navigate('/login')
  }

  const updateProfileMutation = useMutation({
    mutationFn: (data: { new_phone?: string; new_email?: string }) => updateProfile(data),
    onSuccess: (updatedUser) => {
      setUser(updatedUser)
      queryClient.invalidateQueries({ queryKey: ['me'] })
      setShowModal(false)
      setDropdownOpen(false)
      toast.success('Profile details updated successfully!')
    },
    onError: (error: any) => {
      const msg = error.response?.data?.detail || 'Failed to update profile details'
      toast.error(msg)
    },
  })

  const handleOpenModal = () => {
    setNewPhone(user?.phone || '')
    setNewEmail(user?.email || '')
    setDropdownOpen(false)
    setShowModal(true)
  }

  const handleSaveProfile = () => {
    if (newPhone.length !== 10) {
      toast.error('Mobile number must be exactly 10 digits.')
      return
    }
    if (newEmail.trim() && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(newEmail.trim())) {
      toast.error('Please enter a valid email address.')
      return
    }
    updateProfileMutation.mutate({
      new_phone: newPhone.trim(),
      new_email: newEmail.trim() || undefined,
    })
  }

  return (
    <header className="h-16 bg-white border-b border-gray-200 flex items-center justify-between px-6 relative z-30">
      <div />
      
      <div className="flex items-center gap-3">
        {/* Profile Dropdown Container */}
        <div className="relative" ref={dropdownRef}>
          <button
            onClick={() => setDropdownOpen((prev) => !prev)}
            className="flex items-center gap-3 p-1.5 rounded-xl hover:bg-gray-50 border border-transparent hover:border-gray-200 transition-all text-left focus:outline-none"
          >
            <div className="text-right hidden sm:block">
              <p className="text-sm font-bold text-gray-900 leading-tight">
                {user?.role === 'org_admin'
                  ? (user?.org_name || user?.name || 'Organization')
                  : (user?.name || 'User')}
              </p>
              <div className="flex items-center justify-end gap-2 mt-0.5">
                <p className="text-[10px] text-gray-500 font-medium">{user?.phone}</p>
                <span className="w-1 h-1 bg-gray-300 rounded-full" />
                <p className="text-[10px] text-primary-600 font-bold uppercase tracking-wider">
                  {ROLE_LABELS[user?.role || '']}
                  {user?.role !== 'org_admin' && user?.org_name && ` • ${user.org_name}`}
                </p>
              </div>
            </div>
            <div className="w-9 h-9 bg-primary-100 rounded-full flex items-center justify-center text-primary-700 font-bold text-sm shadow-inner">
              <UserIcon className="w-5 h-5 text-primary-600" />
            </div>
            <ChevronDown className={`w-4 h-4 text-gray-400 transition-transform ${dropdownOpen ? 'rotate-180' : ''}`} />
          </button>

          {/* Dropdown Menu */}
          {dropdownOpen && (
            <div className="absolute right-0 mt-2 w-64 bg-white rounded-2xl shadow-xl border border-gray-100 py-2 z-50 animate-in fade-in slide-in-from-top-2 duration-150">
              {/* Profile Header in Menu */}
              <div className="px-4 py-3 border-b border-gray-100 bg-gray-50/50 rounded-t-2xl">
                <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider">Signed in as</p>
                <p className="text-sm font-bold text-gray-900 truncate mt-0.5">
                  {user?.role === 'org_admin'
                    ? (user?.org_name || user?.name || 'Organization Admin')
                    : (user?.name || (user?.role === 'super_admin' ? 'Super Admin' : 'User'))}
                </p>
                <p className="text-xs text-gray-500 font-mono mt-0.5">{user?.phone}</p>
                {user?.username && <p className="text-xs text-indigo-600 font-mono font-bold mt-0.5">@{user.username}</p>}
                {user?.email && <p className="text-xs text-primary-600 font-mono mt-0.5 truncate">{user.email}</p>}
              </div>


              <div className="p-1.5 space-y-1">
                {/* Change Contact / Email Button — Only shown for Super Admin */}
                {user?.role === 'super_admin' && (
                  <button
                    onClick={handleOpenModal}
                    className="w-full flex items-center gap-3 px-3 py-2.5 text-sm font-semibold text-gray-700 hover:text-primary-600 hover:bg-primary-50/60 rounded-xl transition-all"
                  >
                    <div className="w-7 h-7 rounded-lg bg-primary-100/70 flex items-center justify-center text-primary-600">
                      <Phone className="w-4 h-4" />
                    </div>
                    Update Contact & Email
                  </button>
                )}

                {/* Logout Button */}
                <button
                  onClick={handleLogout}
                  className="w-full flex items-center gap-3 px-3 py-2.5 text-sm font-semibold text-red-600 hover:bg-red-50 rounded-xl transition-all"
                >
                  <div className="w-7 h-7 rounded-lg bg-red-100/70 flex items-center justify-center text-red-600">
                    <LogOut className="w-4 h-4" />
                  </div>
                  Logout
                </button>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Update Contact & Email Modal */}
      <Modal
        isOpen={showModal}
        onClose={() => {
          if (!updateProfileMutation.isPending) setShowModal(false)
        }}
        title="Update Profile Details"
      >
        <div className="space-y-4 pt-2">
          <p className="text-xs text-gray-500">
            Update your primary mobile number and email address. All your profile data, tests, and administrative records will remain completely safe.
          </p>

          <Input
            label="Mobile Number"
            placeholder="10-digit mobile number"
            value={newPhone}
            maxLength={10}
            onChange={(e) => setNewPhone(e.target.value.replace(/\D/g, '').slice(0, 10))}
          />
          {newPhone.length > 0 && newPhone.length !== 10 && (
            <p className="text-xs text-red-500 -mt-2">Mobile number must be exactly 10 digits.</p>
          )}

          <Input
            label="Email Address"
            type="email"
            placeholder="superadmin@example.com"
            value={newEmail}
            onChange={(e) => setNewEmail(e.target.value)}
          />
          {newEmail.length > 0 && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(newEmail.trim()) && (
            <p className="text-xs text-red-500 -mt-2">Please enter a valid email address.</p>
          )}

          <div className="flex items-center justify-end gap-3 pt-2">
            <Button
              variant="outline"
              onClick={() => setShowModal(false)}
              disabled={updateProfileMutation.isPending}
            >
              Cancel
            </Button>
            <Button
              loading={updateProfileMutation.isPending}
              disabled={
                newPhone.length !== 10 ||
                (newEmail.length > 0 && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(newEmail.trim())) ||
                (newPhone === user?.phone && newEmail === (user?.email || ''))
              }
              onClick={handleSaveProfile}
            >
              Save Changes
            </Button>
          </div>
        </div>
      </Modal>
    </header>
  )
}
