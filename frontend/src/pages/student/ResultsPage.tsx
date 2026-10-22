import { useEffect } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { Award, ArrowLeft, Download } from 'lucide-react'
import { getStudentHistory } from '../../services/studentApi'
import Button from '../../components/ui/Button'
import Card from '../../components/ui/Card'
import Badge from '../../components/ui/Badge'
import Spinner from '../../components/ui/Spinner'
import QuestionText from '../../components/quiz/QuestionText'

export default function ResultsPage() {
  const { sessionId } = useParams()
  const navigate = useNavigate()
  const queryClient = useQueryClient()

  useEffect(() => {
    queryClient.invalidateQueries({ queryKey: ['student-performance'] })
    queryClient.invalidateQueries({ queryKey: ['student-dashboard'] })
    queryClient.invalidateQueries({ queryKey: ['student-history'] })
  }, [queryClient])

  const { data, isLoading } = useQuery({ queryKey: ['student-history'], queryFn: () => getStudentHistory() })

  const result = data?.results.find((r) => r.session_id === sessionId)

  if (isLoading) return <div className="flex justify-center py-20"><Spinner size="lg" /></div>
  if (!result) return <div className="text-center py-20 text-gray-500">Result not found</div>

  const pct = result.max_score > 0 ? (result.total_score / result.max_score) * 100 : 0

  return (
    <div className="max-w-3xl mx-auto space-y-6">
      <Button variant="ghost" onClick={() => navigate('/student/dashboard')}><ArrowLeft className="w-4 h-4 mr-2" /> Back</Button>
      <Card className="p-8 text-center">
        <Award className="w-12 h-12 text-primary-600 mx-auto mb-4" />
        <h1 className="text-4xl font-extrabold text-gray-900">{result.total_score.toFixed(1)}<span className="text-xl text-gray-400">/{result.max_score.toFixed(0)}</span></h1>
        <Badge variant={pct >= 60 ? 'success' : 'error'} className="mt-2">{pct >= 60 ? 'Pass' : 'Needs Improvement'}</Badge>
        <p className="mt-3 text-sm text-gray-500">Final ability: {result.theta_final.toFixed(3)}</p>
      </Card>
      {result.ai_summary && (
        <Card className="p-6">
          <h3 className="font-semibold text-gray-900 mb-3">AI Performance Summary</h3>
          <p className="text-sm text-gray-700 whitespace-pre-wrap leading-relaxed">{result.ai_summary}</p>
        </Card>
      )}

      <div className="space-y-4">
        <h3 className="text-lg font-bold text-gray-900 px-1">Detailed Review</h3>
        {result.details?.responses ? (
          (result.details.responses as any[]).map((resp, idx) => {
            const isCorrect = resp.score > 0
            const hasCorrectAnswer = resp.correct_answer != null && resp.correct_answer !== ''
            return (
              <Card key={idx} className={`p-5 border-l-4 ${isCorrect ? 'border-l-green-500' : 'border-l-red-400'}`}>
                <div className="flex justify-between items-start gap-4">
                  <div className="flex-1 space-y-2">
                    <p className="text-xs font-bold text-primary-600 uppercase tracking-wider">Question {idx + 1}</p>
                    <QuestionText text={resp.question_text} className="text-sm font-medium text-gray-800" />

                    {/* Student answer */}
                    <div className={`p-3 rounded-lg border ${isCorrect ? 'bg-green-50 border-green-100' : 'bg-red-50 border-red-100'}`}>
                      <p className="text-xs text-gray-400 mb-1 font-semibold uppercase">Your Answer</p>
                      <p className={`text-sm italic ${isCorrect ? 'text-green-700' : 'text-red-700'}`}>"{resp.answer}"</p>
                    </div>

                    {/* Correct answer — shown for wrong answers or always */}
                    {hasCorrectAnswer && (
                      <div className="bg-green-50 p-3 rounded-lg border border-green-200">
                        <p className="text-xs text-green-600 mb-1 font-semibold uppercase tracking-wider">✓ Correct Answer</p>
                        <p className="text-sm font-medium text-green-800">{resp.correct_answer}</p>
                      </div>
                    )}
                  </div>

                  <div className="flex flex-col items-end gap-2 shrink-0">
                    <Badge variant={isCorrect ? 'success' : 'error'}>
                      Score: {resp.score.toFixed(1)}
                    </Badge>
                    {resp.voice_confidence !== null && resp.voice_confidence !== undefined && (
                      <div className={`px-2 py-1 rounded text-[10px] font-black uppercase text-white ${
                        resp.voice_confidence > 0.7 ? 'bg-green-500' : resp.voice_confidence > 0.4 ? 'bg-amber-500' : 'bg-red-500'
                      }`}>
                        {Math.round(resp.voice_confidence * 100)}% Confidence
                      </div>
                    )}
                  </div>
                </div>
              </Card>
            )
          })
        ) : (
          <div className="text-center py-10 bg-gray-50 rounded-xl border border-dashed border-gray-200">
            <p className="text-sm text-gray-500">Full response details are only available for new evaluations.</p>
          </div>
        )}
      </div>

      <div className="flex gap-3 pt-4">
        <Button onClick={() => navigate('/student/evaluate')}>Retake Evaluation</Button>
        <Button variant="outline"><Download className="w-4 h-4 mr-2" /> Download Report</Button>
      </div>
    </div>
  )
}
