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
  /\n?\s*(Choose the correct answer[\s\S]*|Select the correct (?:answer|option)[\s\S]*|Options?\s*:[\s\S]*)$/i
const LOWER_ROMAN = 'x|ix|viii|vii|vi|iv|iii|ii|i'
const UPPER_ROMAN = 'X|IX|VIII|VII|VI|IV|III|II|I'
const MARKER_SOURCE =
  `(?:\\((?:${LOWER_ROMAN}|${UPPER_ROMAN}|[A-Da-d]|\\d+)\\)|(?:${LOWER_ROMAN}|${UPPER_ROMAN})[.)]|[A-Da-d][.)]|\\d+[.)])`
// Column / List headings. "II" is listed before "I" so "Column II" is not read as "Column I".
const COLUMN_HEADING =
  /((?:Column|List)(?:\s*[-–—]\s*|\s+)(?:II|2|B|I(?!I)|1|A)(?![A-Za-z0-9])(?:\s*\([^)]*\))?)\s*:?/gi
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

  const semi = raw.split(/\s*;\s*/).map(cleanItem).filter(Boolean)
  if (semi.length >= 2 && semi.every(looksLikeItem)) return semi

  if (startsWithRoman(raw)) {
    const romanSplit = splitMarked(raw, `(?:${LOWER_ROMAN}|${UPPER_ROMAN})[.)]`)
    if (romanSplit.length >= 2) return romanSplit
  }

  if (/^\d+[.)\s]/.test(raw)) {
    const numericSplit = splitMarked(raw, '\\d+[.)]')
    if (numericSplit.length >= 2) return numericSplit
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

/** Cuts on markers such as "iii." without also cutting the "ii." and "i." inside them. */
function splitMarked(raw: string, markerSource: string): string[] {
  const indexes: number[] = []
  for (const match of raw.matchAll(new RegExp(markerSource, 'gi'))) {
    if (match.index === undefined) continue
    if (match.index > 0 && !/\s/.test(raw[match.index - 1])) continue
    indexes.push(match.index)
  }
  if (indexes.length < 2) return []
  return indexes
    .map((start, i) => cleanItem(raw.slice(start, indexes[i + 1] ?? raw.length)))
    .filter(Boolean)
}

function startsWithRoman(raw: string): boolean {
  return new RegExp(`^(?:${LOWER_ROMAN}|${UPPER_ROMAN})[.)]`, 'i').test(raw)
}

function looksLikeItem(part: string): boolean {
  return new RegExp(
    `^(?:${MARKER_SOURCE}|[A-Da-d]\\s+\\S|\\d+\\s+\\S)`,
    'i',
  ).test(part.trim())
}

function markerFamily(marker: string): string {
  const core = marker.replace(/[().\s]/g, '')
  if (/^\d+$/.test(core)) return 'digit'
  if (new RegExp(`^(?:${LOWER_ROMAN})$`).test(core)) return 'lower-roman'
  if (new RegExp(`^(?:${UPPER_ROMAN})$`).test(core)) return 'upper-roman'
  if (/^[a-d]$/.test(core)) return 'lower-alpha'
  if (/^[A-D]$/.test(core)) return 'upper-alpha'
  return 'other'
}

interface ColumnHeading {
  label: string
  kind: 'I' | 'II'
  index: number
  end: number
}

function headingKind(label: string): 'I' | 'II' | null {
  const token = label.match(/(?:Column|List)(?:\s*[-–—]\s*|\s+)(II|2|B|I|1|A)(?![A-Za-z0-9])/i)
  if (!token) return null
  const kind = token[1].toUpperCase()
  return kind === 'II' || kind === '2' || kind === 'B' ? 'II' : 'I'
}

function findColumnHeadings(text: string): ColumnHeading[] {
  const hits: ColumnHeading[] = []
  for (const match of text.matchAll(COLUMN_HEADING)) {
    if (match.index === undefined) continue
    const label = match[1].replace(/\s+/g, ' ').trim().replace(/:$/, '')
    const kind = headingKind(label)
    if (!kind) continue
    const end = match.index + match[0].length
    const after = text.slice(end)
    // "Union list i." is an item, not a "List I" heading.
    if (/^[.)]/.test(after)) continue
    if (/^\s+with\b/i.test(after)) continue
    hits.push({ label, kind, index: match.index, end })
  }
  return hits
}

/**
 * Rows written beside each other: "a. left text   i. right text".
 * A marker inside the right-hand text ( "Dr. B.R." ) stays in that cell.
 */
function extractPairs(body: string): { left: string; right: string }[] | null {
  const text = body.trim()
  if (!text) return null

  const markers = [...text.matchAll(new RegExp(MARKER_SOURCE, 'g'))].map((match) => ({
    index: match.index ?? 0,
    family: markerFamily(match[0]),
  }))
  if (markers.length < 4 || markers[0].index > 3) return null

  const rowFamily = markers[0].family
  const pairs: { left: string; right: string }[] = []
  let i = 0
  while (i < markers.length) {
    const left = markers[i]
    if (left.family !== rowFamily) return null
    let nextRow = i + 1
    while (nextRow < markers.length && markers[nextRow].family !== rowFamily) nextRow += 1
    if (nextRow === i + 1) return null
    const right = markers[i + 1]
    const rightEnd = nextRow < markers.length ? markers[nextRow].index : text.length
    const leftText = cleanItem(text.slice(left.index, right.index))
    const rightText = cleanItem(text.slice(right.index, rightEnd))
    if (!leftText || !rightText) return null
    pairs.push({ left: leftText, right: rightText })
    i = nextRow
  }
  return pairs.length >= 2 ? pairs : null
}

function parseColumns(text: string): ParsedMatchLists | null {
  const headings = findColumnHeadings(text)
  const lefts = headings.filter((heading) => heading.kind === 'I')
  const rights = headings.filter((heading) => heading.kind === 'II')
  if (!lefts.length || !rights.length) return null

  const left = lefts[lefts.length - 1]
  const right = rights[rights.length - 1]
  if (right.index <= left.index) return null

  const intro = text.slice(0, left.index).trim()
  const between = text.slice(left.end, right.index)
  const { itemsBody, outro } = peelOutro(text.slice(right.end))

  if (!between.trim()) {
    const pairs = extractPairs(itemsBody)
    if (!pairs) return null
    return applyIntroLabels({
      intro,
      listILabel: left.label,
      listIItems: pairs.map((pair) => pair.left),
      listIILabel: right.label,
      listIIItems: pairs.map((pair) => pair.right),
      outro,
    }, intro)
  }

  const listIItems = splitListItems(between)
  const listIIItems = splitListItems(itemsBody)
  if (listIItems.length < 2 || listIIItems.length < 2) return null

  return applyIntroLabels({
    intro,
    listILabel: left.label,
    listIItems,
    listIILabel: right.label,
    listIIItems,
    outro,
  }, intro)
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

  const columns = parseColumns(text)
  if (columns) return columns

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
