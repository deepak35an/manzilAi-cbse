import { Fragment } from 'react'
import RichText from './RichText'
import { parseMatchLists } from '@/lib/matchLists'
import { cn } from '@/lib/utils'

interface QuestionTextProps {
  text: string | string[] | unknown
  className?: string
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
      <div className="grid grid-cols-2 gap-x-6 gap-y-2 items-start">
        <p className="text-xs font-semibold tracking-wide text-gray-500">
          {parsed.listILabel}
        </p>
        <p className="text-xs font-semibold tracking-wide text-gray-500">
          {parsed.listIILabel}
        </p>
        {Array.from(
          { length: Math.max(parsed.listIItems.length, parsed.listIIItems.length) },
          (_, idx) => (
            <Fragment key={idx}>
              <div className="min-w-0 text-[15px] leading-relaxed text-gray-800">
                {parsed.listIItems[idx] ? (
                  <RichText text={parsed.listIItems[idx]} inline />
                ) : null}
              </div>
              <div className="min-w-0 text-[15px] leading-relaxed text-gray-800">
                {parsed.listIIItems[idx] ? (
                  <RichText text={parsed.listIIItems[idx]} inline />
                ) : null}
              </div>
            </Fragment>
          ),
        )}
      </div>
      {parsed.outro && <RichText text={parsed.outro} className="text-inherit" />}
    </div>
  )
}
