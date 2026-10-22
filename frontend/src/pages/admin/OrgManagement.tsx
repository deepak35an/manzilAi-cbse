import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import toast from 'react-hot-toast'
import { RefreshCw, Calendar, ArrowRight } from 'lucide-react'
import OrgManager from '../../components/admin/OrgManager'
import Modal from '../../components/ui/Modal'
import Input from '../../components/ui/Input'
import Button from '../../components/ui/Button'
import type { Organization } from '../../types/org'
import { getOrganizations, createOrganization, updateOrganization, deleteOrganization } from '../../services/adminApi'
import { formatDate } from '../../lib/utils'

// Duration selector component
function DurationSelector({ value, onChange }: { value: number; onChange: (v: number) => void }) {
  return (
    <div>
      <label className="block text-sm font-medium text-gray-700 mb-2">Subscription Duration</label>
      <div className="grid grid-cols-2 gap-3">
        {[6, 12].map((months) => (
          <button
            key={months}
            type="button"
            onClick={() => onChange(months)}
            className={`flex flex-col items-center justify-center px-4 py-3 rounded-xl border-2 transition-all text-sm font-semibold ${
              value === months
                ? 'border-primary-500 bg-primary-50 text-primary-700 font-bold'
                : 'border-gray-200 bg-white text-gray-600 hover:border-gray-300'
            }`}
          >
            <span className="text-lg font-bold">{months}</span>
            <span className="text-xs font-normal mt-0.5">Months</span>
          </button>
        ))}
      </div>
    </div>
  )
}

export default function OrgManagement() {
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const { data: orgs = [] } = useQuery({ queryKey: ['organizations'], queryFn: getOrganizations })

  // ── Create modal state
  const [showCreate, setShowCreate] = useState(false)
  const [formName, setFormName] = useState('')
  const [formAdminPhone, setFormAdminPhone] = useState('')
  const [formAdminEmail, setFormAdminEmail] = useState('')
  const [formDuration, setFormDuration] = useState<number>(12)

  // ── Edit modal state
  const [editOrg, setEditOrg] = useState<Organization | null>(null)
  const [editName, setEditName] = useState('')
  const [editAdminPhone, setEditAdminPhone] = useState('')
  const [editAdminEmail, setEditAdminEmail] = useState('')
  const [editIsActive, setEditIsActive] = useState<boolean>(true)
  const [editRenewMonths, setEditRenewMonths] = useState<number | null>(null)

  // ── Mutations
  const createMutation = useMutation({
    mutationFn: createOrganization,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['organizations'] })
      setShowCreate(false)
      resetCreateForm()
      toast.success('Organization created')
    },
    onError: (err: any) => toast.error(err.response?.data?.detail || 'Failed to create organization'),
  })

  const updateMutation = useMutation({
    mutationFn: ({ id, data }: { id: string; data: Parameters<typeof updateOrganization>[1] }) =>
      updateOrganization(id, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['organizations'] })
      toast.success('Organization updated successfully')
      setEditOrg(null)
      setEditRenewMonths(null)
    },
    onError: (err: any) => toast.error(err.response?.data?.detail || 'Failed to update organization'),
  })

  const deleteMutation = useMutation({
    mutationFn: deleteOrganization,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['organizations'] })
      toast.success('Organization removed successfully')
    },
    onError: () => toast.error('Failed to remove organization'),
  })

  const resetCreateForm = () => {
    setFormName('')
    setFormAdminPhone('')
    setFormAdminEmail('')
    setFormDuration(12)
  }

  const openEdit = (org: Organization) => {
    setEditOrg(org)
    setEditName(org.name)
    setEditAdminPhone(org.admin_phone && org.admin_phone !== 'Not Assigned' ? org.admin_phone : '')
    setEditAdminEmail(org.admin_email || '')
    setEditIsActive(org.is_active)
    setEditRenewMonths(null) // Reset selection when opening modal
  }

  const handleCreate = () => {
    if (!formName.trim() || !formAdminEmail.trim()) return
    createMutation.mutate({
      name: formName.trim(),
      admin_phone: formAdminPhone.trim() || undefined,
      admin_email: formAdminEmail.trim() || undefined,
      duration_months: formDuration,
    })
  }

  const handleSaveEdit = () => {
    if (!editOrg) return
    updateMutation.mutate({
      id: editOrg.id,
      data: {
        name: editName.trim() || undefined,
        admin_phone: editAdminPhone.trim() || undefined,
        admin_email: editAdminEmail.trim() || undefined,
        is_active: editIsActive,
        renew_months: editRenewMonths || undefined,
      },
    })
  }

  const toggleRenewSelection = (months: number) => {
    setEditRenewMonths((prev) => (prev === months ? null : months))
  }

  // Expiry display values
  const expiryDate = editOrg?.valid_until ? new Date(editOrg.valid_until) : null
  const isExpired = expiryDate ? expiryDate < new Date() : false
  const daysLeft = expiryDate
    ? Math.ceil((expiryDate.getTime() - Date.now()) / (1000 * 60 * 60 * 24))
    : null

  // Calculate new expiry date preview
  const getNewExpiryDatePreview = () => {
    if (!editRenewMonths || !editOrg) return null
    const base = expiryDate && expiryDate > new Date() ? expiryDate : new Date()
    const newDate = new Date(base)
    newDate.setDate(newDate.getDate() + editRenewMonths * 30)
    return newDate.toISOString()
  }
  const newExpiryPreview = getNewExpiryDatePreview()

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold text-gray-900">Organization Management</h1>
      <OrgManager
        organizations={orgs}
        onEdit={openEdit}
        onDelete={(id) => deleteMutation.mutate(id)}
        onCreate={() => setShowCreate(true)}
        onView={(org) => navigate(`/admin/org/${org.id}`)}
      />

      {/* ── Create Modal ── */}
      <Modal isOpen={showCreate} onClose={() => { setShowCreate(false); resetCreateForm() }} title="Add Organization">
        <div className="space-y-4">
          <Input
            label="Organization Name"
            placeholder="e.g. Sunrise Academy"
            value={formName}
            onChange={(e) => setFormName(e.target.value)}
          />
          <Input
            label="Admin Phone Number"
            placeholder="10-digit phone number"
            value={formAdminPhone}
            maxLength={10}
            onChange={(e) => setFormAdminPhone(e.target.value.replace(/\D/g, '').slice(0, 10))}
          />
          {formAdminPhone.length > 0 && formAdminPhone.length !== 10 && (
            <p className="text-xs text-red-500 -mt-2">Phone must be exactly 10 digits.</p>
          )}
          <Input
            label="Admin Email (required)"
            type="email"
            placeholder="admin@example.com"
            value={formAdminEmail}
            onChange={(e) => setFormAdminEmail(e.target.value)}
          />
          {formAdminEmail.length > 0 && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(formAdminEmail.trim()) && (
            <p className="text-xs text-red-500 -mt-2">Please enter a valid email address.</p>
          )}
          <DurationSelector value={formDuration} onChange={setFormDuration} />
          <Button
            className="w-full"
            loading={createMutation.isPending}
            disabled={!formName.trim() || !formAdminEmail.trim() || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(formAdminEmail.trim()) || (formAdminPhone.length > 0 && formAdminPhone.length !== 10)}
            onClick={handleCreate}
          >
            Create Organization
          </Button>
        </div>
      </Modal>

      {/* ── Edit Modal ── */}
      <Modal
        isOpen={!!editOrg}
        onClose={() => { setEditOrg(null) }}
        title={`Edit — ${editOrg?.name ?? ''}`}
      >
        {editOrg && (
          <div className="space-y-5">
            {/* Basic info */}
            <div className="space-y-3">
              <Input
                label="Organization Name"
                value={editName}
                onChange={(e) => setEditName(e.target.value)}
              />
              <Input
                label="Admin Phone Number"
                placeholder="10-digit phone number"
                value={editAdminPhone}
                maxLength={10}
                onChange={(e) => setEditAdminPhone(e.target.value.replace(/\D/g, '').slice(0, 10))}
              />
              {editAdminPhone.length > 0 && editAdminPhone.length !== 10 && (
                <p className="text-xs text-red-500 -mt-1">Phone must be exactly 10 digits.</p>
              )}
              <Input
                label="Admin Email"
                type="email"
                placeholder="admin@example.com"
                value={editAdminEmail}
                onChange={(e) => setEditAdminEmail(e.target.value)}
              />
              {editAdminEmail.length > 0 && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(editAdminEmail.trim()) && (
                <p className="text-xs text-red-500 -mt-1">Please enter a valid email address.</p>
              )}
              {/* Active toggle */}
              <div className="flex items-center justify-between py-2 px-3 bg-gray-50 rounded-xl border border-gray-100">
                <span className="text-sm font-medium text-gray-700">
                  Status: <span className={editIsActive ? 'text-emerald-600' : 'text-red-600'}>{editIsActive ? 'Active' : 'Inactive'}</span>
                </span>
                <Button
                  size="sm"
                  variant={editIsActive ? 'ghost' : 'primary'}
                  onClick={() => setEditIsActive(!editIsActive)}
                >
                  {editIsActive ? 'Deactivate' : 'Activate'}
                </Button>
              </div>
            </div>

            {/* ── Subscription Renewal Section ── */}
            <div className="pt-4 border-t border-gray-100">
              <h3 className="text-sm font-semibold text-gray-900 mb-1">Subscription Renewal</h3>

              {/* Current expiry */}
              <div className={`flex items-center gap-2 mb-3 px-3 py-2 rounded-lg text-sm border ${
                isExpired
                  ? 'bg-red-50 border-red-200 text-red-700'
                  : daysLeft !== null && daysLeft <= 30
                  ? 'bg-amber-50 border-amber-200 text-amber-700'
                  : 'bg-emerald-50 border-emerald-200 text-emerald-700'
              }`}>
                <Calendar className="w-4 h-4 shrink-0" />
                {expiryDate ? (
                  <span>
                    {isExpired
                      ? `Expired on ${formatDate(editOrg.valid_until!)}`
                      : daysLeft === 0
                      ? 'Expires today'
                      : `Expires ${formatDate(editOrg.valid_until!)} (${daysLeft} days left)`}
                  </span>
                ) : (
                  <span className="text-gray-400">No subscription on record</span>
                )}
              </div>

              <div className="grid grid-cols-2 gap-3 mb-4">
                {[6, 12].map((months) => (
                  <button
                    key={months}
                    type="button"
                    onClick={() => toggleRenewSelection(months)}
                    className={`flex items-center justify-center gap-2 py-2.5 rounded-xl border-2 transition-all text-sm font-semibold ${
                      editRenewMonths === months
                        ? 'border-primary-500 bg-primary-50 text-primary-700 font-bold'
                        : 'border-gray-200 bg-white text-gray-600 hover:border-gray-300'
                    }`}
                  >
                    <RefreshCw className={`w-3.5 h-3.5 ${editRenewMonths === months ? 'animate-spin-slow' : ''}`} />
                    +{months} Months
                  </button>
                ))}
              </div>

              {/* Expiry extension preview */}
              {newExpiryPreview && (
                <div className="flex items-center justify-between gap-2 px-3.5 py-3 mb-4 rounded-xl bg-primary-50 border border-primary-100 text-xs font-semibold text-primary-700">
                  <div className="flex flex-col">
                    <span className="text-gray-400 font-normal">Current Expiry</span>
                    <span>{expiryDate ? formatDate(editOrg.valid_until!) : 'Today'}</span>
                  </div>
                  <ArrowRight className="w-4 h-4 shrink-0 text-primary-400" />
                  <div className="flex flex-col text-right">
                    <span className="text-gray-400 font-normal">New Expiry</span>
                    <span className="text-primary-800 font-bold">{formatDate(newExpiryPreview)}</span>
                  </div>
                </div>
              )}
            </div>

            <Button
              className="w-full"
              loading={updateMutation.isPending}
              disabled={!editName.trim() || (editAdminPhone.length > 0 && editAdminPhone.length !== 10) || (editAdminEmail.length > 0 && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(editAdminEmail.trim()))}
              onClick={handleSaveEdit}
            >
              Save Changes
            </Button>
          </div>
        )}
      </Modal>
    </div>
  )
}
