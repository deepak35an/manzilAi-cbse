import DataTable from '../ui/DataTable'
import Badge from '../ui/Badge'
import { formatDate } from '../../lib/utils'
import type { ContentRegistryItem } from '../../types/admin'

interface ContentTableProps {
  items: ContentRegistryItem[]
  onPreview: (id: string) => void
  onDelete: (item: ContentRegistryItem) => void
}

export default function ContentTable({ items, onPreview, onDelete }: ContentTableProps) {
  const columns = [
    { key: 'title', header: 'Title' },
    { key: 'question_count', header: 'Questions' },
    {
      key: 'source_type',
      header: 'Source',
      render: (item: ContentRegistryItem) => <Badge variant="info">{item.source_type}</Badge>,
    },
    {
      key: 'visibility',
      header: 'Inherited Visibility',
      render: (item: ContentRegistryItem) => (
        <Badge variant={item.visibility === 'global' ? 'success' : 'warning'}>
          {item.visibility === 'global' ? 'Global' : 'Org-specific'}
        </Badge>
      ),
    },
    { key: 'created_at', header: 'Created', render: (item: ContentRegistryItem) => formatDate(item.created_at) },
    {
      key: 'actions',
      header: '',
      render: (item: ContentRegistryItem) => (
        <div className="flex gap-3 items-center justify-end">
          <button
            onClick={() => onPreview(item.id)}
            className="text-primary-600 text-sm font-medium hover:text-primary-800 hover:underline transition-colors"
          >
            Preview
          </button>
          <button
            onClick={() => onDelete(item)}
            className="text-red-500 text-sm font-medium hover:text-red-700 hover:underline transition-colors"
          >
            Delete
          </button>
        </div>
      ),
    },
  ]

  return <DataTable columns={columns} data={items} emptyMessage="No content files in this folder" />
}
