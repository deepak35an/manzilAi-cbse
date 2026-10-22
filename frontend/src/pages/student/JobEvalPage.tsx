import { useState } from 'react'
import { useMutation } from '@tanstack/react-query'
import { useNavigate } from 'react-router-dom'
import toast from 'react-hot-toast'
import JdUploader from '../../components/job/JdUploader'
import SkillExtractor from '../../components/job/SkillExtractor'
import ReadinessReport from '../../components/job/ReadinessReport'
import RoadmapPanel from '../../components/job/RoadmapPanel'
import Button from '../../components/ui/Button'
import Spinner from '../../components/ui/Spinner'
import { parseJd, parseJdPdf, generateJobQuestions, getJobReport } from '../../services/jobApi'
import { startQuiz } from '../../services/quizApi'
import type { JobReport } from '../../types/analytics'

export default function JobEvalPage() {
  const navigate = useNavigate()
  const [step, setStep] = useState<'upload' | 'skills' | 'generating' | 'report'>('upload')
  const [skills, setSkills] = useState<string[]>([])
  const [roleTitle, setRoleTitle] = useState('')
  const [expLevel, setExpLevel] = useState('')
  const [report, setReport] = useState<JobReport | null>(null)

  const handleParseSuccess = (data: { skills: string[]; experience_level: string; role_title: string }) => {
    setSkills(data.skills)
    setRoleTitle(data.role_title)
    setExpLevel(data.experience_level)
    setStep('skills')
  }

  const parseMutation = useMutation({
    mutationFn: parseJd,
    onSuccess: handleParseSuccess,
    onError: () => toast.error('Failed to parse JD'),
  })

  const parsePdfMutation = useMutation({
    mutationFn: ({ file, description }: { file: File; description?: string }) => parseJdPdf(file, description),
    onSuccess: handleParseSuccess,
    onError: () => toast.error('Failed to parse PDF'),
  })

  const generateMutation = useMutation({
    mutationFn: () => generateJobQuestions({ skills, difficulty: 'medium', count: 10 }),
    onSuccess: async (data) => {
      setStep('generating')
      toast.success('Questions generated! Starting assessment...')
      try {
        if (data.content_registry_id) {
          const quizData = await startQuiz({
            content_registry_id: data.content_registry_id,
            mode: 'job',
          })
          navigate(`/student/quiz/${quizData.session_id}`)
        } else {
          const reportData = await getJobReport(data.task_id)
          setReport(reportData)
          setStep('report')
        }
      } catch {
        toast.error('Failed to start assessment')
        setStep('skills')
      }
    },
    onError: () => toast.error('Failed to generate questions'),
  })

  const isLoading = parseMutation.isPending || parsePdfMutation.isPending

  return (
    <div className="max-w-3xl mx-auto space-y-6">
      <h1 className="text-2xl font-bold text-gray-900">Job Readiness Evaluation</h1>

      {step === 'upload' && (
        <JdUploader
          onSubmit={(text) => parseMutation.mutate({ job_description: text })}
          onSubmitPdf={(file, description) => parsePdfMutation.mutate({ file, description })}
          loading={isLoading}
        />
      )}

      {step === 'skills' && (
        <div className="space-y-4">
          <SkillExtractor skills={skills} roleTitle={roleTitle} experienceLevel={expLevel} />
          <Button onClick={() => generateMutation.mutate()} loading={generateMutation.isPending}>
            Start Assessment
          </Button>
        </div>
      )}

      {step === 'generating' && (
        <div className="flex flex-col items-center gap-4 py-12">
          <Spinner />
          <p className="text-gray-600 text-sm">Preparing your assessment...</p>
        </div>
      )}

      {step === 'report' && report && (
        <div className="space-y-6">
          <ReadinessReport report={report} />
          {report.improvement_roadmap && <RoadmapPanel roadmap={report.improvement_roadmap} />}
        </div>
      )}
    </div>
  )
}
