import { useState } from 'react'
import { Building2, Users, Database, Calendar, Award, Zap, ArrowUpRight } from 'lucide-react'
import { useQuery } from '@tanstack/react-query'
import api from '@/services/api'
import { Link } from 'react-router-dom'
import { cn } from '@/lib/utils'
import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from 'recharts'
import Card from '@/components/ui/Card'

interface ChartItem {
  label: string
  count: number
}

interface PlatformStats {
  total_organizations: number
  total_students: number
  total_exams_uploaded: number
  monthly_active_users: number
  weekly_active_users: number
  tests_today: number
  active_students_chart: {
    daily: ChartItem[]
    weekly: ChartItem[]
    monthly: ChartItem[]
  }
  most_attempted_exams: {
    exam: string
    attempts: number
  }[]
  most_opted_batches: {
    batch: string
    students: number
  }[]
}

const fetchPlatformStats = () =>
  api.get<PlatformStats>('/admin/platform-stats').then((r) => r.data)

function StatCard({
  icon,
  label,
  value,
  headingColor,
  iconBg,
  iconColor,
}: {
  icon: React.ReactNode
  label: string
  value: string | number
  headingColor: string
  iconBg: string
  iconColor: string
}) {
  return (
    <Card className="p-5 bg-white border border-gray-100 shadow-sm hover:shadow-md transition-all duration-300">
      <div className="flex items-start justify-between">
        <div>
          <p className={cn("text-xs font-bold uppercase tracking-wider", headingColor)}>{label}</p>
          <p className="text-3xl font-extrabold text-gray-900 mt-2 tracking-tight">{value}</p>
        </div>
        <div className={cn("p-2.5 rounded-xl shrink-0", iconBg, iconColor)}>
          {icon}
        </div>
      </div>
    </Card>
  )
}

const CustomTooltip = ({ active, payload, label }: any) => {
  if (active && payload && payload.length) {
    return (
      <div className="bg-white border border-gray-200 p-3 rounded-lg shadow-md">
        <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-1">{label}</p>
        <p className="text-sm font-bold text-indigo-600">
          {payload[0].value} Active Students
        </p>
      </div>
    )
  }
  return null
}

export default function AdminDashboard() {
  const { data, isLoading } = useQuery({
    queryKey: ['platform-stats'],
    queryFn: fetchPlatformStats,
  })

  const [timeframe, setTimeframe] = useState<'daily' | 'weekly' | 'monthly'>('daily')

  const chartData = data?.active_students_chart?.[timeframe] ?? []

  return (
    <div className="space-y-8 animate-fade-in pb-8">
      {/* Title block */}
      <div>
        <h1 className="text-2xl font-bold text-gray-900 tracking-tight">Admin Dashboard</h1>
      </div>

      {/* Grid of 6 Metrics */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
        <StatCard
          icon={<Building2 className="w-5 h-5" />}
          label="Total Org"
          value={isLoading ? '…' : (data?.total_organizations ?? 0)}
          headingColor="text-indigo-600"
          iconBg="bg-indigo-50"
          iconColor="text-indigo-600"
        />
        <StatCard
          icon={<Users className="w-5 h-5" />}
          label="Total Students"
          value={isLoading ? '…' : (data?.total_students ?? 0)}
          headingColor="text-violet-600"
          iconBg="bg-violet-50"
          iconColor="text-violet-600"
        />
        <StatCard
          icon={<Database className="w-5 h-5" />}
          label="Total exam uploaded"
          value={isLoading ? '…' : (data?.total_exams_uploaded ?? 0)}
          headingColor="text-pink-600"
          iconBg="bg-pink-50"
          iconColor="text-pink-600"
        />
        <StatCard
          icon={<Calendar className="w-5 h-5" />}
          label="Monthly Active Users"
          value={isLoading ? '…' : (data?.monthly_active_users ?? 0)}
          headingColor="text-sky-600"
          iconBg="bg-sky-50"
          iconColor="text-sky-600"
        />
        <StatCard
          icon={<Zap className="w-5 h-5" />}
          label="Weekly active users"
          value={isLoading ? '…' : (data?.weekly_active_users ?? 0)}
          headingColor="text-amber-600"
          iconBg="bg-amber-50"
          iconColor="text-amber-600"
        />
        <StatCard
          icon={<Award className="w-5 h-5" />}
          label="Tests/Day"
          value={isLoading ? '…' : (data?.tests_today ?? 0)}
          headingColor="text-emerald-600"
          iconBg="bg-emerald-50"
          iconColor="text-emerald-600"
        />
      </div>

      {/* Active Students Chart */}
      <Card className="p-6">
        <div className="flex items-center justify-between mb-6">
          <div>
            <h3 className="text-base font-bold text-gray-900 tracking-tight">
              Number of active students
            </h3>
            <p className="text-xs text-gray-400 mt-1">
              Active students refers to unique users who have attempted at least one test in the selected timeframe (daily, weekly, or monthly).
            </p>
          </div>

          {/* Clean Flat Timeframe Switcher */}
          <div className="flex gap-4">
            {(['daily', 'weekly', 'monthly'] as const).map((t) => (
              <button
                key={t}
                onClick={() => setTimeframe(t)}
                className={cn(
                  'pb-1 text-xs font-semibold uppercase tracking-wider transition-all border-b-2 focus:outline-none',
                  timeframe === t
                    ? 'border-indigo-600 text-indigo-600'
                    : 'border-transparent text-gray-400 hover:text-gray-600'
                )}
              >
                {t}
              </button>
            ))}
          </div>
        </div>

        {/* Recharts Area Chart */}
        <div className="h-72 w-full">
          {isLoading ? (
            <div className="h-full w-full flex items-center justify-center text-gray-400 text-sm">
              Loading active student chart...
            </div>
          ) : chartData.length === 0 ? (
            <div className="h-full w-full flex items-center justify-center text-gray-400 text-sm">
              No active student data recorded for this timeframe.
            </div>
          ) : (
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={chartData} margin={{ top: 10, right: 10, left: -25, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" vertical={false} />
                <XAxis
                  dataKey="label"
                  tick={{ fontSize: 10, fill: '#94a3b8', fontWeight: 500 }}
                  axisLine={{ stroke: '#e2e8f0' }}
                  tickLine={false}
                  dy={10}
                />
                <YAxis
                  tick={{ fontSize: 10, fill: '#94a3b8', fontWeight: 500 }}
                  axisLine={false}
                  tickLine={false}
                  allowDecimals={false}
                  dx={-10}
                />
                <Tooltip content={<CustomTooltip />} />
                <Area
                  type="monotone"
                  dataKey="count"
                  stroke="#4f46e5"
                  strokeWidth={2}
                  fillOpacity={0.05}
                  fill="#4f46e5"
                  dot={{ r: 3, fill: '#4f46e5', strokeWidth: 1, stroke: '#fff' }}
                  activeDot={{ r: 5, strokeWidth: 1, fill: '#fff', stroke: '#4f46e5' }}
                />
              </AreaChart>
            </ResponsiveContainer>
          )}
        </div>
      </Card>

      {/* Bottom Simple Lists */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {/* Most Attempted Exams */}
        <Card className="p-6">
          <h3 className="text-base font-bold text-gray-900 tracking-tight mb-4">Most Attempted Exams</h3>
          <div className="divide-y divide-gray-100">
            {isLoading ? (
              <div className="py-4 text-center text-gray-400 text-sm">Loading...</div>
            ) : !data?.most_attempted_exams || data.most_attempted_exams.length === 0 ? (
              <div className="py-4 text-center text-gray-400 text-sm">No exam attempts recorded yet.</div>
            ) : (
              data.most_attempted_exams.map((item) => (
                <div key={item.exam} className="flex items-center justify-between py-3 text-sm text-gray-700">
                  <span className="font-medium text-gray-900">{item.exam}</span>
                  <span className="text-gray-500 font-semibold">{item.attempts} Attempts</span>
                </div>
              ))
            )}
          </div>
        </Card>

        {/* Most Opted Batches */}
        <Card className="p-6">
          <h3 className="text-base font-bold text-gray-900 tracking-tight mb-4">Most Opted Batch</h3>
          <div className="divide-y divide-gray-100">
            {isLoading ? (
              <div className="py-4 text-center text-gray-400 text-sm">Loading...</div>
            ) : !data?.most_opted_batches || data.most_opted_batches.length === 0 ? (
              <div className="py-4 text-center text-gray-400 text-sm">No opted batches recorded.</div>
            ) : (
              data.most_opted_batches.map((item) => (
                <div key={item.batch} className="flex items-center justify-between py-3 text-sm text-gray-700">
                  <span className="font-medium text-gray-900">{item.batch}</span>
                  <span className="text-gray-500 font-semibold">{item.students} Students</span>
                </div>
              ))
            )}
          </div>
        </Card>
      </div>

      {/* Quick links / Actions section */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {[
          {
            label: 'Manage Organizations',
            to: '/admin/organizations',
            desc: 'Configure organizations, add new admins, assign subscription licenses, and renew plans.',
            icon: <Building2 className="w-5 h-5 text-indigo-500" />,
          },
          {
            label: 'Content Management',
            to: '/admin/content',
            desc: 'Upload question banks, preview uploaded content, delete files, and manage global/local visibility.',
            icon: <Database className="w-5 h-5 text-pink-500" />,
          },
        ].map((a) => (
          <Link
            key={a.label}
            to={a.to}
            className="flex items-start gap-4 p-5 rounded-xl border border-gray-100 hover:border-indigo-100 hover:bg-indigo-50/5 transition-all duration-300 group shadow-sm bg-white"
          >
            <div className="p-3 bg-gray-50 rounded-lg group-hover:bg-indigo-50 transition-colors duration-300">
              {a.icon}
            </div>
            <div className="space-y-1">
              <div className="flex items-center gap-1.5">
                <span className="text-sm font-bold text-gray-900 group-hover:text-primary-700 transition-colors">
                  {a.label}
                </span>
                <ArrowUpRight className="w-4 h-4 text-gray-400 group-hover:translate-x-0.5 group-hover:-translate-y-0.5 transition-transform" />
              </div>
              <p className="text-xs text-gray-500 leading-relaxed">{a.desc}</p>
            </div>
          </Link>
        ))}
      </div>
    </div>
  )
}
