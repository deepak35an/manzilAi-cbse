import { useNavigate } from 'react-router-dom'
import { useAuth } from '@/context/AuthContext'
import { useEffect } from 'react'
import { GraduationCap, BrainCircuit, BarChart3, ArrowRight, Sparkles, BookOpen, Briefcase } from 'lucide-react'

export default function LandingPage() {
  const { isAuthenticated, redirectByRole } = useAuth()
  const navigate = useNavigate()

  useEffect(() => {
    if (isAuthenticated) redirectByRole()
  }, [isAuthenticated]) // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <div className="min-h-screen bg-white">
      {/* Nav */}
      <header className="border-b border-gray-100">
        <div className="max-w-6xl mx-auto px-6 h-16 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 bg-primary-600 rounded-lg flex items-center justify-center">
              <GraduationCap className="w-5 h-5 text-white" />
            </div>
            <span className="font-bold text-gray-900 text-lg">Manzil AI</span>
          </div>
          <button
            onClick={() => navigate('/login')}
            className="btn-primary btn-md"
          >
            Sign In
          </button>
        </div>
      </header>

      {/* Hero */}
      <section className="max-w-6xl mx-auto px-6 pt-20 pb-16 text-center">
        <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-primary-50 text-primary-700 text-sm font-medium mb-6">
          <Sparkles className="w-4 h-4" />
          AI-Powered Adaptive Learning
        </div>
        <h1 className="text-5xl font-bold text-gray-900 mb-6 leading-tight">
          Your intelligent path to<br />
          <span className="text-primary-600">exam success</span>
        </h1>
        <p className="text-xl text-gray-500 mb-10 max-w-2xl mx-auto leading-relaxed">
          Manzil AI adapts to your knowledge level, builds a personalized study plan, and guides you
          week-by-week toward your exam and career goals.
        </p>
        <button
          onClick={() => navigate('/login')}
          className="btn-primary btn-lg gap-2"
        >
          Get Started Free
          <ArrowRight className="w-5 h-5" />
        </button>
      </section>

      {/* Features */}
      <section className="max-w-6xl mx-auto px-6 py-16">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          {[
            {
              icon: BrainCircuit,
              color: 'bg-primary-50 text-primary-600',
              title: 'Adaptive Exams',
              desc: 'Our IRT-based engine adjusts question difficulty in real time to your ability level, giving you the most efficient assessment possible.',
            },
            {
              icon: BarChart3,
              color: 'bg-success-50 text-success-600',
              title: 'Deep Analytics',
              desc: 'Track topic-wise strengths, see your performance trends over time, and get AI-generated insights on exactly where to focus next.',
            },
            {
              icon: Briefcase,
              color: 'bg-accent-50 text-accent-600',
              title: 'Job Readiness',
              desc: 'Upload a job description and get a skill-gap analysis with a targeted learning roadmap to land your dream role.',
            },
          ].map(({ icon: Icon, color, title, desc }) => (
            <div key={title} className="card p-6">
              <div className={`w-11 h-11 rounded-xl flex items-center justify-center mb-4 ${color}`}>
                <Icon className="w-6 h-6" />
              </div>
              <h3 className="font-semibold text-gray-900 mb-2">{title}</h3>
              <p className="text-sm text-gray-500 leading-relaxed">{desc}</p>
            </div>
          ))}
        </div>
      </section>

      {/* Centers */}
      <section className="bg-surface-secondary py-16">
        <div className="max-w-6xl mx-auto px-6">
          <h2 className="text-center text-2xl font-bold text-gray-900 mb-10">Two centers, one platform</h2>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div className="card p-8 border-2 border-primary-100">
              <div className="flex items-center gap-3 mb-4">
                <div className="w-10 h-10 bg-primary-100 rounded-xl flex items-center justify-center">
                  <BookOpen className="w-6 h-6 text-primary-600" />
                </div>
                <h3 className="text-lg font-semibold text-gray-900">Exam Center</h3>
              </div>
              <p className="text-gray-500 text-sm leading-relaxed mb-4">
                Prepare for GATE, CUET, JEE, and more with a fully personalized weekly study plan.
                Weekly evaluations track your readiness as your exam date approaches.
              </p>
              <ul className="space-y-1.5 text-sm text-gray-600">
                {['Personalized 3–12 month plans', 'Weekly adaptive tests', 'Topic strength analysis', 'AI performance reports'].map((f) => (
                  <li key={f} className="flex items-center gap-2">
                    <span className="w-1.5 h-1.5 rounded-full bg-primary-500 shrink-0" />
                    {f}
                  </li>
                ))}
              </ul>
            </div>

            <div className="card p-8 border-2 border-accent-100">
              <div className="flex items-center gap-3 mb-4">
                <div className="w-10 h-10 bg-accent-100 rounded-xl flex items-center justify-center">
                  <Briefcase className="w-6 h-6 text-accent-600" />
                </div>
                <h3 className="text-lg font-semibold text-gray-900">Job Center</h3>
              </div>
              <p className="text-gray-500 text-sm leading-relaxed mb-4">
                Upload your resume and the job description. Get instant skill-gap feedback
                and a practice roadmap built around the role you want.
              </p>
              <ul className="space-y-1.5 text-sm text-gray-600">
                {['AI-powered JD parsing', 'Skill-gap identification', 'Role-specific question bank', 'Readiness score'].map((f) => (
                  <li key={f} className="flex items-center gap-2">
                    <span className="w-1.5 h-1.5 rounded-full bg-accent-500 shrink-0" />
                    {f}
                  </li>
                ))}
              </ul>
            </div>
          </div>
        </div>
      </section>

      {/* CTA */}
      <section className="max-w-6xl mx-auto px-6 py-20 text-center">
        <h2 className="text-3xl font-bold text-gray-900 mb-4">Ready to start your journey?</h2>
        <p className="text-gray-500 mb-8">Join thousands of students who have found their manzil with AI.</p>
        <button
          onClick={() => navigate('/login')}
          className="btn-primary btn-lg"
        >
          Sign In Now
        </button>
      </section>

      {/* Footer */}
      <footer className="border-t border-gray-100 py-6 text-center text-sm text-gray-400">
        © {new Date().getFullYear()} Manzil AI. All rights reserved.
      </footer>
    </div>
  )
}
