import { cn } from '../../lib/utils'

interface Column<T> {
  key: string
  header: string
  render?: (item: T) => React.ReactNode
  className?: string
}

interface DataTableProps<T> {
  columns: Column<T>[]
  data: T[]
  onRowClick?: (item: T) => void
  emptyMessage?: string
}

export default function DataTable<T extends Record<string, any>>({ columns, data, onRowClick, emptyMessage = 'No data' }: DataTableProps<T>) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-gray-200">
            {columns.map((col) => (
              <th key={col.key} className={cn('px-4 py-3 text-left font-medium text-gray-500 uppercase tracking-wider text-xs', col.className)}>
                {col.header}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {data.length === 0 ? (
            <tr><td colSpan={columns.length} className="px-4 py-8 text-center text-gray-400">{emptyMessage}</td></tr>
          ) : (
            data.map((item, i) => (
              <tr
                key={i}
                className={cn('border-b border-gray-100 hover:bg-gray-50 transition-colors', onRowClick && 'cursor-pointer')}
                onClick={() => onRowClick?.(item)}
              >
                {columns.map((col) => (
                  <td key={col.key} className={cn('px-4 py-3 text-gray-700', col.className)}>
                    {col.render ? col.render(item) : String(item[col.key] ?? '')}
                  </td>
                ))}
              </tr>
            ))
          )}
        </tbody>
      </table>
    </div>
  )
}
