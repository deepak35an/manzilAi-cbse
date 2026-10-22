import { Link, useNavigate } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { Briefcase, Plus, BookOpen, Target, TrendingUp, Star, ArrowRight } from 'lucide-react'
import { STUDENT_ROUTES } from '@/lib/constants'
import { cn } from '@/lib/utils'

// Placeholder — job readiness data will come from backend once job sessions are recorded
function SkillBar({ skill, pct }: { skill: string; pct: number }) {
  return (
    <div>
      <div className="flex items-center justify-between mb-1">
        <p className="text-sm text-gray-700">{skill}</p>
        <p className="text-xs text-gray-400">{pct}%</p>
      </div>
      <div className="h-2 bg-gray-100 rounded-full overflow-hidden">
        <div
          className={cn(
            'h-full rounded-full',
            pct >= 80 ? 'bg-success-500' : pct >= 50 ? 'bg-warning-500' : 'bg-danger-500'
          )}
          style={{ width: `${pct}%` }}
        />
      </div>
    </div>
  )
}

const PLACEHOLDER_SKILLS = [
  { skill: 'Problem Solving', pct: 78 },
  { skill: 'System Design', pct: 54 },
  { skill: 'Data Structures', pct: 65 },
  { skill: 'Communication', pct: 82 },
  { skill: 'Domain Knowledge', pct: 43 },
]

export default function JobDashboard() {
  const navigate = useNavigate()

  return (
    <div className="space-y-6 animate-fade-in">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-gray-900">Job Center Dashboard</h1>
          <p className="text-sm text-gray-500 mt-0.5">Track your job readiness and skill development</p>
        </div>
        <button
          onClick={() => navigate(STUDENT_ROUTES.JOB)}
          className="btn-primary btn-sm flex items-center gap-1.5"
        >
          <Plus className="w-4 h-4" />
          New JD Analysis
        </button>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        {[
          { label: 'JDs Analyzed', value: '—', icon: <Briefcase className="w-5 h-5" />, color: 'bg-primary-50 text-primary-600' },
          { label: 'Practice Sessions', value: '—', icon: <BookOpen className="w-5 h-5" />, color: 'bg-accent-50 text-accent-600' },
          { label: 'Avg Readiness', value: '—', icon: <Target className="w-5 h-5" />, color: 'bg-success-50 text-success-600' },
        ].map((m) => (
          <div key={m.label} className="card p-5 flex items-start gap-4">
            <div className={cn('w-10 h-10 rounded-xl flex items-center justify-center shrink-0', m.color)}>
              {m.icon}
            </div>
            <div>
              <p className="text-2xl font-bold text-gray-900">{m.value}</p>
              <p className="text-sm text-gray-400">{m.label}</p>
            </div>
          </div>
        ))}
      </div>

      {/* Skill Radar placeholder */}
      <div className="card p-6">
        <div className="flex items-center justify-between mb-5">
          <h2 className="font-semibold text-gray-900 flex items-center gap-2">
            <Star className="w-4 h-4 text-primary-500" />
            Skill Readiness (Demo)
          </h2>
          <span className="badge-gray text-xs">Based on sample data</span>
        </div>
        <div className="space-y-3">
          {PLACEHOLDER_SKILLS.map((s) => (
            <SkillBar key={s.skill} {...s} />
          ))}
        </div>
      </div>

      {/* Roadmap placeholder */}
      <div className="card p-6">
        <div className="flex items-center gap-2 mb-4">
          <TrendingUp className="w-4 h-4 text-primary-500" />
          <h2 className="font-semibold text-gray-900">Recommended Roadmap</h2>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          {['Strengthen Data Structures', 'Practice System Design', 'Mock Interviews'].map((step, i) => (
            <div key={step} className="rounded-xl border-2 border-dashed border-gray-200 p-4 text-center">
              <span className="w-7 h-7 rounded-full bg-primary-100 text-primary-700 text-sm font-bold flex items-center justify-center mx-auto mb-2">
                {i + 1}
              </span>
              <p className="text-sm text-gray-700">{step}</p>
            </div>
          ))}
        </div>
      </div>

      {/* CTA */}
      <div className="card p-5 border-2 border-primary-100 bg-primary-50/30 flex items-center justify-between">
        <div>
          <p className="font-semibold text-gray-900">Analyze a new Job Description</p>
          <p className="text-sm text-gray-500 mt-0.5">Upload a JD to get a personalized skill gap analysis.</p>
        </div>
        <Link
          to={STUDENT_ROUTES.JOB}
          className="btn-primary btn-sm flex items-center gap-1.5 shrink-0"
        >
          Get Started <ArrowRight className="w-4 h-4" />
        </Link>
      </div>
    </div>
  )
}
