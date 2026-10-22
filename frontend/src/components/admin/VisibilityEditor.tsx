import { useState } from 'react'
import Button from '../ui/Button'
import { Globe, Building2 } from 'lucide-react'
import { cn } from '../../lib/utils'

interface VisibilityEditorProps {
  currentVisibility: string
  organizations: { id: string; name: string }[]
  selectedOrgIds: string[]
  onSave: (visibility: string, orgIds: string[]) => void
}

export default function VisibilityEditor({ currentVisibility, organizations, selectedOrgIds, onSave }: VisibilityEditorProps) {
  const [visibility, setVisibility] = useState(currentVisibility)
  const [orgIds, setOrgIds] = useState<string[]>(selectedOrgIds)

  return (
    <div className="space-y-4">
      <div className="flex gap-3">
        <button onClick={() => setVisibility('global')} className={cn('flex-1 flex items-center gap-2 p-3 rounded-lg border-2 text-sm font-medium transition-colors',
          visibility === 'global' ? 'border-primary-500 bg-primary-50 text-primary-700' : 'border-gray-200 text-gray-600')}>
          <Globe className="w-4 h-4" /> Global
        </button>
        <button onClick={() => setVisibility('org_specific')} className={cn('flex-1 flex items-center gap-2 p-3 rounded-lg border-2 text-sm font-medium transition-colors',
          visibility === 'org_specific' ? 'border-primary-500 bg-primary-50 text-primary-700' : 'border-gray-200 text-gray-600')}>
          <Building2 className="w-4 h-4" /> Org-specific
        </button>
      </div>
      {visibility === 'org_specific' && (
        <div className="space-y-2 max-h-48 overflow-y-auto">
          {organizations.map((org) => (
            <label key={org.id} className="flex items-center gap-2 p-2 hover:bg-gray-50 rounded-lg cursor-pointer">
              <input type="checkbox" checked={orgIds.includes(org.id)} onChange={(e) =>
                setOrgIds(e.target.checked ? [...orgIds, org.id] : orgIds.filter(id => id !== org.id))
              } className="rounded border-gray-300" />
              <span className="text-sm">{org.name}</span>
            </label>
          ))}
        </div>
      )}
      <Button onClick={() => onSave(visibility, orgIds)} size="sm">Save Visibility</Button>
    </div>
  )
}
