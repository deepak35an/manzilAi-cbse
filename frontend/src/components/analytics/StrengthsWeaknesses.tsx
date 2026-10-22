import { TrendingUp, TrendingDown, BookOpen } from 'lucide-react'
import Card from '../ui/Card'
import type { TopicStat } from '../../services/studentApi'

interface Props {
  strengths: TopicStat[]
  weaknesses: TopicStat[]
  isLoading?: boolean
}

function ScoreBar({ score }: { score: number }) {
  // Score range is -2.5 to 10. Map to 0-100% for the bar.
  const pct = Math.max(0, Math.min(100, ((score + 2.5) / 12.5) * 100))
  const isStrong = score >= 6
  const isMid = score >= 3 && score < 6
  return (
    <div className="w-full bg-gray-100 rounded-full h-1.5 mt-1">
      <div
        className={`h-1.5 rounded-full transition-all duration-500 ${
          isStrong ? 'bg-emerald-500' : isMid ? 'bg-amber-400' : 'bg-rose-500'
        }`}
        style={{ width: `${pct}%` }}
      />
    </div>
  )
}

function TopicRow({ item, variant }: { item: TopicStat; variant: 'strength' | 'weakness' }) {
  const isStrength = variant === 'strength'
  return (
    <div className="flex items-start gap-3 py-2.5 border-b border-gray-50 last:border-0">
      <div
        className={`mt-0.5 flex-shrink-0 w-7 h-7 rounded-lg flex items-center justify-center text-sm font-bold ${
          isStrength
            ? 'bg-emerald-50 text-emerald-600'
            : 'bg-rose-50 text-rose-500'
        }`}
      >
        {isStrength ? '↑' : '↓'}
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-sm font-semibold text-gray-800 truncate">{item.topic}</p>
        <p className="text-xs text-gray-400 truncate">{item.subject} · {item.attempts} attempt{item.attempts !== 1 ? 's' : ''}</p>
        <ScoreBar score={item.avg_score} />
      </div>
      <span
        className={`text-sm font-bold flex-shrink-0 ${
          isStrength ? 'text-emerald-600' : 'text-rose-500'
        }`}
      >
        {item.avg_score.toFixed(1)}
      </span>
    </div>
  )
}

function EmptyState({ label }: { label: string }) {
  return (
    <div className="flex flex-col items-center justify-center py-8 text-center">
      <BookOpen className="w-8 h-8 text-gray-200 mb-2" />
      <p className="text-xs text-gray-400">Complete quizzes to see your {label}</p>
    </div>
  )
}

export default function StrengthsWeaknesses({ strengths, weaknesses, isLoading }: Props) {
  if (isLoading) {
    return (
      <Card className="p-5">
        <div className="animate-pulse space-y-3">
          <div className="h-4 bg-gray-100 rounded w-1/3" />
          <div className="grid grid-cols-2 gap-4">
            {[0, 1, 2, 3, 4, 5].map((i) => (
              <div key={i} className="h-12 bg-gray-100 rounded-lg" />
            ))}
          </div>
        </div>
      </Card>
    )
  }

  return (
    <Card className="p-5">
      {/* Header */}
      <div className="flex items-center gap-2 mb-4">
        <div className="w-8 h-8 rounded-lg bg-violet-50 flex items-center justify-center">
          <TrendingUp className="w-4 h-4 text-violet-600" />
        </div>
        <div>
          <h2 className="text-sm font-bold text-gray-800">Strengths &amp; Weaknesses</h2>
          <p className="text-xs text-gray-400">Based on quiz performance · Top 3 each</p>
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-6">
        {/* Strengths column */}
        <div>
          <div className="flex items-center gap-1.5 mb-2">
            <TrendingUp className="w-3.5 h-3.5 text-emerald-500" />
            <span className="text-xs font-semibold text-emerald-600 uppercase tracking-wide">
              Top Strengths
            </span>
          </div>
          {strengths.length > 0
            ? strengths.map((s) => (
                <TopicRow key={`${s.subject}-${s.topic}`} item={s} variant="strength" />
              ))
            : <EmptyState label="strengths" />}
        </div>

        {/* Divider (vertical on sm+) */}
        <div className="hidden sm:block absolute left-1/2 top-16 bottom-5 w-px bg-gray-100" />

        {/* Weaknesses column */}
        <div className="mt-4 sm:mt-0">
          <div className="flex items-center gap-1.5 mb-2">
            <TrendingDown className="w-3.5 h-3.5 text-rose-500" />
            <span className="text-xs font-semibold text-rose-500 uppercase tracking-wide">
              Areas to Improve
            </span>
          </div>
          {weaknesses.length > 0
            ? weaknesses.map((w) => (
                <TopicRow key={`${w.subject}-${w.topic}`} item={w} variant="weakness" />
              ))
            : <EmptyState label="weak areas" />}
        </div>
      </div>
    </Card>
  )
}
