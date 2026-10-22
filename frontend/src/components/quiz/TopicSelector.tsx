import { cn } from '../../lib/utils'

interface TopicSelectorProps {
  topics: string[]
  selected: string[]
  onChange: (selected: string[]) => void
}

export default function TopicSelector({ topics, selected, onChange }: TopicSelectorProps) {
  const toggle = (topic: string) => {
    onChange(selected.includes(topic) ? selected.filter((t) => t !== topic) : [...selected, topic])
  }

  return (
    <div className="flex flex-wrap gap-2">
      {topics.map((topic) => (
        <button
          key={topic}
          onClick={() => toggle(topic)}
          className={cn(
            'px-3 py-1.5 rounded-full text-sm font-medium transition-colors border',
            selected.includes(topic)
              ? 'bg-primary-100 border-primary-300 text-primary-700'
              : 'bg-white border-gray-300 text-gray-600 hover:bg-gray-50'
          )}
        >
          {topic}
        </button>
      ))}
    </div>
  )
}
