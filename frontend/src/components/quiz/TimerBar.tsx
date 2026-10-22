import { useEffect, useState } from 'react'

interface TimerBarProps {
  seconds: number
  onExpire?: () => void
}

export default function TimerBar({ seconds, onExpire }: TimerBarProps) {
  const [remaining, setRemaining] = useState(seconds)

  useEffect(() => {
    setRemaining(seconds)
    const interval = setInterval(() => {
      setRemaining((prev) => {
        if (prev <= 1) { clearInterval(interval); onExpire?.(); return 0 }
        return prev - 1
      })
    }, 1000)
    return () => clearInterval(interval)
  }, [seconds, onExpire])

  const pct = (remaining / seconds) * 100
  const color = pct > 50 ? 'bg-green-500' : pct > 20 ? 'bg-yellow-500' : 'bg-red-500'

  return (
    <div className="w-full h-1.5 bg-gray-200 rounded-full overflow-hidden">
      <div className={`h-full ${color} transition-all duration-1000 ease-linear rounded-full`} style={{ width: `${pct}%` }} />
    </div>
  )
}
