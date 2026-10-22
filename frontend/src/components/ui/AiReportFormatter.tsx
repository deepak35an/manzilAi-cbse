import { Sparkles, TrendingUp, TrendingDown, Lightbulb } from 'lucide-react'

interface Props {
  text: string
  className?: string
}

interface Section {
  title: string
  items: string[]
  rawText: string
}

export default function AiReportFormatter({ text, className = '' }: Props) {
  if (!text || !text.trim()) return null

  // Helper to render bold text inside strings (e.g., **Topic Name** - description)
  const renderFormattedText = (str: string) => {
    const parts = str.split(/(\*\*.*?\*\*)/g)
    return parts.map((part, idx) => {
      if (part.startsWith('**') && part.endsWith('**')) {
        return (
          <strong key={idx} className="font-semibold text-gray-900">
            {part.slice(2, -2)}
          </strong>
        )
      }
      return part
    })
  }

  // Parse markdown headers (## Header or **Header**)
  const lines = text.split('\n')
  const sections: Section[] = []
  let currentSection: Section | null = null

  for (const rawLine of lines) {
    const line = rawLine.trim()
    if (!line) continue

    // Check if line is a header like "## Strengths" or "**Overall Reflection**"
    const headerMatch =
      line.match(/^#{1,3}\s+(.*)$/) ||
      line.match(/^\*\*(Overall Reflection|Strengths|Growth Opportunities|Areas for Improvement|Weaknesses|Next Steps|Recommendations|Summary)\*\*:?$/i)

    if (headerMatch) {
      if (currentSection) {
        sections.push(currentSection)
      }
      currentSection = {
        title: headerMatch[1].replace(/\*\*/g, '').trim(),
        items: [],
        rawText: '',
      }
    } else if (currentSection) {
      if (line.startsWith('- ') || line.startsWith('* ') || line.match(/^\d+\.\s+/)) {
        const itemText = line.replace(/^[-*\d.]+\s+/, '').trim()
        currentSection.items.push(itemText)
      } else {
        currentSection.rawText += (currentSection.rawText ? ' ' : '') + line
      }
    } else {
      // Unsectioned header fallback
      currentSection = {
        title: 'Overall Reflection',
        items: [],
        rawText: line,
      }
    }
  }
  if (currentSection) {
    sections.push(currentSection)
  }

  // Fallback if no sections parsed
  if (sections.length === 0) {
    return (
      <div className={`space-y-3 ${className}`}>
        <p className="text-sm text-gray-700 leading-relaxed">{renderFormattedText(text)}</p>
      </div>
    )
  }

  // Section style resolver based on title keywords
  const getSectionTheme = (title: string) => {
    const lower = title.toLowerCase()
    if (lower.includes('strength')) {
      return {
        bg: 'bg-emerald-50/60 border-emerald-100',
        titleColor: 'text-emerald-900',
        icon: <TrendingUp className="w-4 h-4 text-emerald-600 shrink-0" />,
        badgeBg: 'bg-emerald-100/90 text-emerald-800 border-emerald-200',
        bulletDot: 'bg-emerald-500',
      }
    }
    if (lower.includes('growth') || lower.includes('weakness') || lower.includes('improve') || lower.includes('opportunity')) {
      return {
        bg: 'bg-amber-50/60 border-amber-100',
        titleColor: 'text-amber-900',
        icon: <TrendingDown className="w-4 h-4 text-amber-600 shrink-0" />,
        badgeBg: 'bg-amber-100/90 text-amber-800 border-amber-200',
        bulletDot: 'bg-amber-500',
      }
    }
    if (lower.includes('step') || lower.includes('recommend') || lower.includes('action')) {
      return {
        bg: 'bg-blue-50/60 border-blue-100',
        titleColor: 'text-blue-900',
        icon: <Lightbulb className="w-4 h-4 text-blue-600 shrink-0" />,
        badgeBg: 'bg-blue-100/90 text-blue-800 border-blue-200',
        bulletDot: 'bg-blue-500',
      }
    }
    // Default (Overall Reflection / Summary)
    return {
      bg: 'bg-indigo-50/50 border-indigo-100',
      titleColor: 'text-indigo-950',
      icon: <Sparkles className="w-4 h-4 text-indigo-600 shrink-0" />,
      badgeBg: 'bg-indigo-100/90 text-indigo-800 border-indigo-200',
      bulletDot: 'bg-indigo-500',
    }
  }

  return (
    <div className={`space-y-3.5 ${className}`}>
      {sections.map((sec, idx) => {
        const theme = getSectionTheme(sec.title)
        return (
          <div
            key={idx}
            className={`rounded-xl p-4 border transition-all shadow-xs ${theme.bg}`}
          >
            <div className="flex items-center gap-2 mb-2">
              {theme.icon}
              <h3 className={`text-xs font-extrabold uppercase tracking-wider ${theme.titleColor}`}>
                {sec.title}
              </h3>
            </div>

            {sec.rawText && (
              <p className="text-xs sm:text-sm text-gray-700 leading-relaxed mb-2.5">
                {renderFormattedText(sec.rawText)}
              </p>
            )}

            {sec.items.length > 0 && (
              <ul className="space-y-2">
                {sec.items.map((item, itemIdx) => {
                  // Check if item starts with topic pattern like "C Programming – Description" or "Topic: Description"
                  const topicSepMatch = item.match(/^([^–:-]+)\s*[–:-]\s*(.*)$/)
                  return (
                    <li key={itemIdx} className="flex items-start gap-2 text-xs sm:text-sm text-gray-700 leading-relaxed">
                      <span className={`w-1.5 h-1.5 rounded-full shrink-0 mt-2 ${theme.bulletDot}`} />
                      <div className="flex-1 min-w-0">
                        {topicSepMatch ? (
                          <>
                            <span className={`inline-block px-2 py-0.5 rounded-md text-[11px] font-bold border mr-1.5 mb-0.5 ${theme.badgeBg}`}>
                              {topicSepMatch[1].replace(/\*\*/g, '').trim()}
                            </span>
                            <span className="text-gray-700">{renderFormattedText(topicSepMatch[2])}</span>
                          </>
                        ) : (
                          <span>{renderFormattedText(item)}</span>
                        )}
                      </div>
                    </li>
                  )
                })}
              </ul>
            )}
          </div>
        )
      })}
    </div>
  )
}
