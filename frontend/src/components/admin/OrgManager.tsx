import { Trash2, Calendar, Eye } from 'lucide-react'
import DataTable from '../ui/DataTable'
import Badge from '../ui/Badge'
import Button from '../ui/Button'
import { formatDate } from '../../lib/utils'
import type { Organization } from '../../types/org'

interface OrgManagerProps {
  organizations: Organization[]
  onEdit: (org: Organization) => void
  onDelete: (id: string) => void
  onCreate: () => void
  onView: (org: Organization) => void
}

function ExpiryBadge({ validUntil }: { validUntil?: string | null }) {
  if (!validUntil) {
    return <span className="text-xs text-gray-400">—</span>
  }
  const expiry = new Date(validUntil)
  const now = new Date()
  const daysLeft = Math.ceil((expiry.getTime() - now.getTime()) / (1000 * 60 * 60 * 24))

  let colorClass = 'text-emerald-700 bg-emerald-50 border-emerald-200'
  let dotClass = 'bg-emerald-500'
  if (daysLeft < 0) {
    colorClass = 'text-red-700 bg-red-50 border-red-200'
    dotClass = 'bg-red-500'
  } else if (daysLeft <= 30) {
    colorClass = 'text-amber-700 bg-amber-50 border-amber-200'
    dotClass = 'bg-amber-500'
  }

  return (
    <div className={`inline-flex items-center gap-1.5 px-2 py-1 rounded-lg border text-xs font-medium ${colorClass}`}>
      <span className={`w-1.5 h-1.5 rounded-full ${dotClass}`} />
      <Calendar className="w-3 h-3" />
      {daysLeft < 0
        ? `Expired ${Math.abs(daysLeft)}d ago`
        : daysLeft === 0
        ? 'Expires today'
        : `${formatDate(validUntil)} (${daysLeft}d)`}
    </div>
  )
}

export default function OrgManager({ organizations, onEdit, onDelete, onCreate, onView }: OrgManagerProps) {
  const columns = [
    { key: 'name', header: 'Name' },
    { key: 'admin', header: 'Admin Contact', render: (org: Organization) => (
      <div className="flex flex-col">
        <span className="text-sm font-medium text-gray-900">{org.admin_phone || '—'}</span>
        {org.admin_email && <span className="text-xs text-primary-600 font-mono">{org.admin_email}</span>}
        <span className="text-xs text-gray-400">{org.admin_name || '—'}</span>
      </div>
    )},
    { key: 'valid_until', header: 'Plan Expires', render: (org: Organization) => (
      <ExpiryBadge validUntil={org.valid_until} />
    )},
    { key: 'is_active', header: 'Status', render: (org: Organization) =>
      <Badge variant={org.is_active ? 'success' : 'error'}>{org.is_active ? 'Active' : 'Inactive'}</Badge> },
    { key: 'created_at', header: 'Created', render: (org: Organization) => formatDate(org.created_at) },
    { key: 'actions', header: '', render: (org: Organization) => (
      <div className="flex items-center gap-2">
        <Button
          size="sm"
          variant="ghost"
          className="text-primary-600 hover:text-primary-700 hover:bg-primary-50"
          onClick={() => onView(org)}
        >
          <Eye className="w-4 h-4 mr-1" />
          View
        </Button>
        <Button size="sm" variant="ghost" onClick={() => onEdit(org)}>Edit</Button>
        <Button
          size="sm"
          variant="ghost"
          className="text-red-600 hover:text-red-700 hover:bg-red-50"
          onClick={() => {
            if (window.confirm(`Are you sure you want to delete ${org.name}? This will remove all associated subscriptions and admins.`)) {
              onDelete(org.id)
            }
          }}
        >
          <Trash2 className="w-4 h-4" />
        </Button>
      </div>
    )},
  ]

  return (
    <div>
      <div className="flex justify-between items-center mb-4">
        <h2 className="text-lg font-semibold">Organizations</h2>
        <Button onClick={onCreate} size="sm">Add Organization</Button>
      </div>
      <DataTable columns={columns} data={organizations} />
    </div>
  )
}
