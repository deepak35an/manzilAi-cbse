import RichText from './RichText'
import { parseMatchLists } from '@/lib/matchLists'
import { cn } from '@/lib/utils'

interface QuestionTextProps {
  text: string | string[] | unknown
  className?: string
}

function ListColumn({ label, items }: { label: string; items: string[] }) {
  return (
    <div className="min-w-0">
      <p className="text-xs font-semibold tracking-wide text-gray-500 mb-2">
        {label}
      </p>
      <ul className="space-y-1.5">
        {items.map((item, idx) => (
          <li key={`${label}-${idx}`} className="text-[15px] leading-relaxed text-gray-800">
            <RichText text={item} inline />
          </li>
        ))}
      </ul>
    </div>
  )
}

export default function QuestionText({ text, className }: QuestionTextProps) {
  const normalized = Array.isArray(text)
    ? text.join('\n')
    : typeof text === 'string'
      ? text
      : String(text ?? '')

  const parsed = parseMatchLists(normalized)
  if (!parsed) {
    return <RichText text={normalized} className={className} />
  }

  return (
    <div className={cn('space-y-4', className)}>
      {parsed.intro && (
        <RichText text={parsed.intro} className="text-inherit font-medium" />
      )}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6 md:gap-8 items-start">
        <ListColumn label={parsed.listILabel} items={parsed.listIItems} />
        <ListColumn label={parsed.listIILabel} items={parsed.listIIItems} />
      </div>
      {parsed.outro && <RichText text={parsed.outro} className="text-inherit" />}
    </div>
  )
}
