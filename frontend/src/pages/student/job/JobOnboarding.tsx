import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Briefcase, Upload, ChevronRight, Loader2, FileText } from 'lucide-react'
import { useMutation } from '@tanstack/react-query'
import { parseJd, parseJdPdf } from '@/services/jobApi'
import { STUDENT_ROUTES } from '@/lib/constants'

export default function JobOnboarding() {
  const navigate = useNavigate()
  const [tab, setTab] = useState<'text' | 'pdf'>('text')
  const [jdText, setJdText] = useState('')
  const [file, setFile] = useState<File | null>(null)
  const [error, setError] = useState('')

  const parseMutation = useMutation({
    mutationFn: () => tab === 'text' ? parseJd({ job_description: jdText }) : parseJdPdf(file!),
    onSuccess: () => navigate(STUDENT_ROUTES.JOB_DASHBOARD),
    onError: (err: any) => setError(err.response?.data?.detail || 'Failed to process. Please try again.'),
  })

  const handleSubmit = () => {
    setError('')
    if (tab === 'text' && jdText.trim().length < 50) {
      setError('Please paste a full job description (at least 50 characters)')
      return
    }
    if (tab === 'pdf' && !file) {
      setError('Please upload a PDF file')
      return
    }
    parseMutation.mutate()
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-accent-50 via-white to-primary-50 flex items-center justify-center p-6">
      <div className="w-full max-w-xl">
        <div className="card p-8">
          {/* Header */}
          <div className="flex items-center gap-3 mb-6">
            <div className="w-12 h-12 bg-accent-100 rounded-2xl flex items-center justify-center">
              <Briefcase className="w-6 h-6 text-accent-600" />
            </div>
            <div>
              <h1 className="font-bold text-xl text-gray-900">Job Center</h1>
              <p className="text-sm text-gray-500">Tell us about the role you're targeting</p>
            </div>
          </div>

          {/* Tabs */}
          <div className="flex gap-1 bg-gray-100 rounded-xl p-1 mb-5">
            {[{ id: 'text', label: 'Paste JD' }, { id: 'pdf', label: 'Upload PDF' }].map(({ id, label }) => (
              <button
                key={id}
                onClick={() => { setTab(id as 'text' | 'pdf'); setError('') }}
                className={`flex-1 text-sm font-medium py-2 rounded-lg transition-all ${
                  tab === id ? 'bg-white shadow-card text-gray-900' : 'text-gray-500 hover:text-gray-700'
                }`}
              >
                {label}
              </button>
            ))}
          </div>

          {tab === 'text' ? (
            <textarea
              value={jdText}
              onChange={(e) => setJdText(e.target.value)}
              placeholder="Paste the full job description here…"
              rows={8}
              className="input resize-none"
            />
          ) : (
            <label className="flex flex-col items-center justify-center gap-3 w-full h-40 border-2 border-dashed border-gray-300 rounded-2xl cursor-pointer hover:border-accent-400 hover:bg-accent-50 transition">
              <input
                type="file"
                accept=".pdf"
                className="hidden"
                onChange={(e) => setFile(e.target.files?.[0] || null)}
              />
              {file ? (
                <>
                  <FileText className="w-8 h-8 text-accent-600" />
                  <p className="text-sm font-medium text-gray-700">{file.name}</p>
                  <p className="text-xs text-gray-400">Click to change file</p>
                </>
              ) : (
                <>
                  <Upload className="w-8 h-8 text-gray-400" />
                  <p className="text-sm text-gray-500">Click to upload PDF job description</p>
                  <p className="text-xs text-gray-400">PDF files only</p>
                </>
              )}
            </label>
          )}

          {error && <p className="text-sm text-danger-600 mt-3">{error}</p>}

          <button
            onClick={handleSubmit}
            disabled={parseMutation.isPending}
            className="btn-md mt-5 w-full font-semibold rounded-xl flex items-center justify-center gap-2 bg-accent-600 text-white hover:bg-accent-700 disabled:opacity-50 disabled:pointer-events-none transition"
          >
            {parseMutation.isPending ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin" />
                Analyzing…
              </>
            ) : (
              <>
                Analyze Job Description
                <ChevronRight className="w-4 h-4" />
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  )
}
