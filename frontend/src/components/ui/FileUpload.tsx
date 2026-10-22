import { useCallback, useState, type DragEvent } from 'react'
import { Upload } from 'lucide-react'
import { cn } from '../../lib/utils'

interface FileUploadProps {
  onFileSelect: (file: File) => void
  accept?: string
  label?: string
  className?: string
}

export default function FileUpload({ onFileSelect, accept, label = 'Upload file', className }: FileUploadProps) {
  const [dragging, setDragging] = useState(false)

  const handleDrop = useCallback((e: DragEvent) => {
    e.preventDefault()
    setDragging(false)
    const file = e.dataTransfer.files[0]
    if (file) onFileSelect(file)
  }, [onFileSelect])

  return (
    <div
      onDragOver={(e) => { e.preventDefault(); setDragging(true) }}
      onDragLeave={() => setDragging(false)}
      onDrop={handleDrop}
      className={cn(
        'border-2 border-dashed rounded-xl p-8 text-center transition-colors cursor-pointer',
        dragging ? 'border-primary-400 bg-primary-50' : 'border-gray-300 hover:border-gray-400',
        className
      )}
      onClick={() => {
        const input = document.createElement('input')
        input.type = 'file'
        if (accept) input.accept = accept
        input.onchange = (e) => {
          const file = (e.target as HTMLInputElement).files?.[0]
          if (file) onFileSelect(file)
        }
        input.click()
      }}
    >
      <Upload className="w-8 h-8 text-gray-400 mx-auto mb-3" />
      <p className="text-sm text-gray-600">{label}</p>
      <p className="text-xs text-gray-400 mt-1">Drag and drop or click to browse</p>
    </div>
  )
}
