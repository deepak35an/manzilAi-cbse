import { useState, useRef } from 'react'
import Button from '../ui/Button'

interface JdUploaderProps {
  onSubmit: (text: string) => void
  onSubmitPdf?: (file: File, description?: string) => void
  loading?: boolean
}

export default function JdUploader({ onSubmit, onSubmitPdf, loading }: JdUploaderProps) {
  const [text, setText] = useState('')
  const [pdfFile, setPdfFile] = useState<File | null>(null)
  const [mode, setMode] = useState<'text' | 'pdf'>('text')
  const fileRef = useRef<HTMLInputElement>(null)

  const handlePdfSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (file && file.type === 'application/pdf') {
      setPdfFile(file)
    }
  }

  const handleSubmit = () => {
    if (mode === 'pdf' && pdfFile && onSubmitPdf) {
      onSubmitPdf(pdfFile, text.trim() || undefined)
    } else if (mode === 'text' && text.trim()) {
      onSubmit(text)
    }
  }

  const canSubmit = mode === 'pdf' ? !!pdfFile : !!text.trim()

  return (
    <div className="space-y-4">
      <div className="flex gap-2">
        <button
          onClick={() => setMode('text')}
          className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
            mode === 'text' ? 'bg-primary-600 text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
          }`}
        >
          Paste Text
        </button>
        <button
          onClick={() => setMode('pdf')}
          className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
            mode === 'pdf' ? 'bg-primary-600 text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
          }`}
        >
          Upload PDF
        </button>
      </div>

      {mode === 'pdf' && (
        <div className="space-y-3">
          <div
            onClick={() => fileRef.current?.click()}
            className="border-2 border-dashed border-gray-300 rounded-xl p-6 text-center cursor-pointer hover:border-primary-400 transition-colors"
          >
            <input ref={fileRef} type="file" accept=".pdf" onChange={handlePdfSelect} className="hidden" />
            {pdfFile ? (
              <p className="text-sm text-gray-700 font-medium">{pdfFile.name}</p>
            ) : (
              <p className="text-sm text-gray-500">Click to select a PDF file</p>
            )}
          </div>
          <textarea
            value={text}
            onChange={(e) => setText(e.target.value)}
            placeholder="Optional: add a description or context..."
            rows={3}
            className="w-full px-4 py-3 border border-gray-300 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-primary-500 resize-none"
          />
        </div>
      )}

      {mode === 'text' && (
        <textarea
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder="Paste the job description here..."
          rows={8}
          className="w-full px-4 py-3 border border-gray-300 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-primary-500 resize-none"
        />
      )}

      <Button onClick={handleSubmit} loading={loading} disabled={!canSubmit}>
        Analyze Job Description
      </Button>
    </div>
  )
}
