import { useState } from 'react'
import FileUpload from '../ui/FileUpload'
import Button from '../ui/Button'
import DataTable from '../ui/DataTable'

interface QuestionBankUploaderProps {
  rootFolder: string
  subfolder: string
  onUpload: (file: File) => void
  loading?: boolean
}

export default function QuestionBankUploader({ rootFolder, subfolder, onUpload, loading }: QuestionBankUploaderProps) {
  const [file, setFile] = useState<File | null>(null)
  const [preview, setPreview] = useState<any[]>([])

  const handleSelect = async (f: File) => {
    setFile(f)
    try {
      const text = await f.text()
      const data = JSON.parse(text)
      const questions = Array.isArray(data) ? data : data.questions ?? []
      setPreview(questions.slice(0, 5))
    } catch { setPreview([]) }
  }

  const columns = [
    { key: 'question', header: 'Question', render: (item: any) => <span className="line-clamp-1">{item.question || item.text}</span> },
    { key: 'type', header: 'Type' },
    { key: 'difficulty', header: 'Difficulty', render: (item: any) => typeof item.difficulty === 'number' ? item.difficulty.toFixed(2) : String(item.difficulty || '') },
    { key: 'topic', header: 'Topic' },
    { key: 'subtopic', header: 'Subtopic' },
    { key: 'subject', header: 'Subject' },
  ]

  return (
    <div className="space-y-4">
      <FileUpload onFileSelect={handleSelect} accept=".json" label="Upload Question Bank JSON" />
      {file && (
        <div className="space-y-3">
          <p className="text-sm text-gray-600">File: <strong>{file.name}</strong> ({preview.length}+ questions)</p>
          {preview.length > 0 && <DataTable columns={columns} data={preview} />}
          <div className="flex gap-2">
            <Button onClick={() => onUpload(file)} loading={loading}>Upload to {rootFolder}/{subfolder}</Button>
            <Button variant="ghost" onClick={() => { setFile(null); setPreview([]) }}>Cancel</Button>
          </div>
        </div>
      )}
    </div>
  )
}
