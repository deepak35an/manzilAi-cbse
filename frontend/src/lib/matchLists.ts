export interface ParsedMatchLists {
  intro: string
  listILabel: string
  listIItems: string[]
  listIILabel: string
  listIIItems: string[]
  outro: string
}

const MATCH_INTRO =
  /^(.*?Match\s+List[\s-]*I(?!I)(?:\s*\([^)]+\))?\s+with\s+List[\s-]*II(?:\s*\([^)]+\))?:?)\s*/i
// Require a colon so "List-I (Title) with List-II (Title)" is not treated as columns.
const LIST_I_HEADING = /(List[\s-]*I(?!I)(?:\s*\([^)]+\))?)\s*:\s*/i
const LIST_II_HEADING = /(List[\s-]*II(?:\s*\([^)]+\))?)\s*:\s*/i
const ITEM_START =
  /^(?:\([A-Da-d]\)|[A-Da-d][.)]|\([ivx]+\)|\([IVX]+\)|[ivx]+[.)]|[IVX]+[.)])/i
const OUTRO_RE =
  /\n*(Choose the correct answer[\s\S]*|Select the correct (?:answer|option)[\s\S]*)$/i
// True option markers only: (A)-(D) or roman (I)-(IV). Does not match (Px/Py).
const PAREN_ITEM_SPLIT =
  /(?=(?:^|,\s+|\s+)(?:\([A-Da-d]\)|\((?:I{1,3}|IV|IX|VI{0,3}|i{1,3}|iv|ix|vi{0,3})\))(?:\s|,|$))/

function findHeading(
  text: string,
  re: RegExp,
): { label: string; index: number; end: number } | null {
  const match = re.exec(text)
  if (!match || match.index === undefined) return null
  return {
    label: match[1].replace(/\s+/g, ' ').trim().replace(/:$/, ''),
    index: match.index,
    end: match.index + match[0].length,
  }
}

function splitListItems(body: string): string[] {
  const raw = body.trim()
  if (!raw) return []

  const lines = raw.split(/\n+/).map((line) => line.trim()).filter(Boolean)
  if (lines.length >= 2 && lines.filter((line) => ITEM_START.test(line)).length >= 2) {
    return lines.map(cleanItem)
  }

  const parenSplit = raw
    .split(PAREN_ITEM_SPLIT)
    .map(cleanItem)
    .filter(Boolean)
  if (parenSplit.length >= 2) return parenSplit

  const dottedSplit = raw
    .split(/(?=\s*[A-Da-d][.)]\s)/)
    .map(cleanItem)
    .filter(Boolean)
  if (dottedSplit.length >= 2) return dottedSplit

  return lines.length ? lines.map(cleanItem) : [raw]
}

function cleanItem(part: string): string {
  return part.trim().replace(/^,\s*/, '').replace(/,$/, '').trim()
}

function peelOutro(body: string): { itemsBody: string; outro: string } {
  const match = body.match(OUTRO_RE)
  if (!match || match.index === undefined) {
    return { itemsBody: body.trim(), outro: '' }
  }
  return {
    itemsBody: body.slice(0, match.index).trim(),
    outro: match[1].trim(),
  }
}

function parseFromHeadings(text: string, introPrefix = ''): ParsedMatchLists | null {
  const listII = findHeading(text, LIST_II_HEADING)
  if (!listII) return null

  const beforeII = text.slice(0, listII.index)
  const listI = findHeading(beforeII, LIST_I_HEADING)
  if (!listI) return null

  const prefix = text.slice(0, listI.index).trim()
  const listIBody = text.slice(listI.end, listII.index)
  const { itemsBody: listIIBody, outro } = peelOutro(text.slice(listII.end))

  const listIItems = splitListItems(listIBody)
  const listIIItems = splitListItems(listIIBody)
  if (listIItems.length === 0 || listIIItems.length === 0) return null

  return {
    intro: [introPrefix, prefix].filter(Boolean).join(' ').trim(),
    listILabel: listI.label,
    listIItems,
    listIILabel: listII.label,
    listIIItems,
    outro,
  }
}

function parseLabeledPair(text: string): ParsedMatchLists | null {
  const header = text.match(MATCH_INTRO)
  if (!header) return null

  const { itemsBody, outro } = peelOutro(text.slice(header[0].length))
  const blocks = itemsBody.split(
    /\s+(?=List[\s-]*II(?:\s*\([^)]+\))?\s*:)|(?:\n+(?=[A-Z][^:\n]{0,80}:\s))/,
  )
  if (blocks.length !== 2) return null

  const parseBlock = (block: string) => {
    const match = block.trim().match(/^([^:]{1,80}):\s*([\s\S]+)$/)
    if (!match) return null
    const items = splitListItems(match[2])
    if (!items.length) return null
    return { label: match[1].trim(), items }
  }

  const left = parseBlock(blocks[0])
  const right = parseBlock(blocks[1])
  if (!left || !right) return null

  return {
    intro: header[1].trim(),
    listILabel: left.label,
    listIItems: left.items,
    listIILabel: right.label,
    listIIItems: right.items,
    outro,
  }
}

function applyIntroLabels(parsed: ParsedMatchLists, intro: string): ParsedMatchLists {
  const named = intro.match(
    /List[\s-]*I(?!I)(\s*\([^)]+\))?\s+with\s+List[\s-]*II(\s*\([^)]+\))?/i,
  )
  if (!named) return parsed
  if (named[1]) parsed.listILabel = `List-I${named[1]}`
  if (named[2]) parsed.listIILabel = `List-II${named[2]}`
  if (named[1] || named[2]) parsed.intro = 'Match'
  return parsed
}

export function parseMatchLists(text: string): ParsedMatchLists | null {
  if (!text || typeof text !== 'string') return null

  const introMatch = text.match(MATCH_INTRO)
  if (introMatch) {
    const rest = text.slice(introMatch[0].length)
    const parsed = parseFromHeadings(rest, introMatch[1].trim())
    if (parsed) return applyIntroLabels(parsed, introMatch[1])
    const fallback = parseLabeledPair(text)
    return fallback ? applyIntroLabels(fallback, introMatch[1]) : null
  }

  return parseFromHeadings(text)
}
