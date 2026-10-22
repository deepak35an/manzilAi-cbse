/**
 * Turns stored program text into a fenced block so markdown keeps the
 * lines together. Leaves prose, math, and existing fences untouched.
 */

const CODE_START =
  /^(?:#include\b|#define\b|#pragma\b|#if\b|#endif\b|#ifndef\b|#ifdef\b|int\b|void\b|char\b|float\b|double\b|long\b|short\b|unsigned\b|signed\b|static\b|struct\b|typedef\b|enum\b|const\b|return\b|if\b|else\b|for\b|while\b|do\b|switch\b|case\b|default\s*:|break\b|continue\b|goto\b|printf\b|scanf\b|malloc\b|free\b|sizeof\b|main\s*\()/

function unwrapFullBold(line: string): string {
  const match = line.trim().match(/^\*\*((?:(?!\*\*).)+)\*\*$/)
  return match ? match[1] : line
}

const LITERAL = /"(?:\\.|[^"\\])*"|'(?:\\.|[^'\\])*'/g

function stripComment(text: string): string {
  const masked = text.replace(LITERAL, (match) => ' '.repeat(match.length))
  const start = masked.indexOf('//')
  return start === -1 ? text : text.slice(0, start).trimEnd()
}

/** Net braces opened by a line, ignoring any inside string literals. */
function braceDelta(text: string): number {
  const bare = text.replace(LITERAL, '')
  return (bare.match(/\{/g) || []).length - (bare.match(/\}/g) || []).length
}

function isCodeLine(line: string): boolean {
  const raw = stripComment(unwrapFullBold(line).trim()).trim()
  if (!raw) return false
  // Subscripts, Greek, and set notation never appear in these listings, but do
  // appear in language and probability questions whose lines otherwise look
  // like code, e.g. "L1 = {a^p | p is a prime number}".
  if (/[^\x20-\x7E]/.test(raw)) return false
  if (/^\(?[A-Da-d]\)/.test(raw) || /^\([P-Sp-s]\)/.test(raw) || /^\([ivxIVX]+\)/.test(raw)) {
    return false
  }
  // braces alone on a line, e.g. "{", "};", "} }"
  if (/^[{}\s;]+$/.test(raw)) return true
  // a closing brace carrying the rest of a statement, e.g. "} while(x!=y);"
  if (/^\}\s*(while|else)\b/.test(raw)) return true
  // a statement that closes its block, e.g. "boxE = boxN; }"
  if (/^.*;\s*\}+\s*;?$/.test(raw)) return true
  // a parenthesised expression statement, e.g. "(*ptr)++;"
  if (/^\(.*\)\s*(\+\+|--)\s*;$/.test(raw)) return true
  // a call or signature that opens a block, e.g. "MultiDequeue(Q){"
  if (/^[A-Za-z_]\w*\s*\([^;]*\)\s*\{$/.test(raw)) return true
  if (/^(?:else|do)\b/.test(raw)) return true
  if (CODE_START.test(raw)) return true
  if (/^\*+\w/.test(raw) && /[=;]/.test(raw)) return true
  if (/[;{}]\s*$/.test(raw) && /[=()*[\]]/.test(raw) && raw.split(/\s+/).length <= 14) {
    return true
  }
  return false
}

const INDENT = '    '

function hasOwnIndent(lines: string[]): boolean {
  return lines.some((line) => /^\s+\S/.test(line))
}

const BRACELESS_HEADER = /^(else\s+)?(if|for|while)\s*\(.*\)$/

// Two statements on one line separated by a run of spaces, which is how
// side-by-side listings come out of the source PDFs. Brace depth is meaningless
// across columns, so those must not be re-indented.
const COLUMN_GAP = /;\s{2,}\S/

function count(text: string, pattern: RegExp): number {
  return (text.match(pattern) || []).length
}

function looksMultiColumn(lines: string[]): boolean {
  if (lines.filter((line) => COLUMN_GAP.test(line)).length >= 2) return true
  return lines.some(
    (line) =>
      count(line, /#include/g) >= 2 ||
      (count(line, /\{/g) >= 2 && !line.includes('}')) ||
      count(line, /\bmain\s*\(/g) >= 2
  )
}

function gcd(a: number, b: number): number {
  return b ? gcd(b, a % b) : a
}

/**
 * True when the source's own indentation agrees with what its braces imply.
 * Listings whose indentation only partly survived extraction -- a few stray
 * deep lines over an otherwise flat body -- read better rebuilt than preserved.
 */
function trustExistingIndent(lines: string[]): boolean {
  const widths = lines.map((line) => line.length - line.trimStart().length)
  const unit = widths.reduce((acc, w) => (w ? gcd(acc, w) : acc), 0) || 1
  const source = widths.map((w) => Math.floor(w / unit))

  const computed = reindentC(lines).map((line) =>
    Math.floor((line.length - line.trimStart().length) / INDENT.length)
  )

  const disagree = source.filter((level, i) => level !== computed[i]).length
  return disagree <= source.length * 0.25
}

function shouldKeepIndent(lines: string[]): boolean {
  return hasOwnIndent(lines) && trustExistingIndent(lines)
}

const SWITCH_LABEL = /^(case\b|default\s*:)/

/**
 * Re-indents C, tracking scopes on a stack: 'brace' for a real `{`, 'virtual'
 * for the implied single-statement scope of a braceless if/for/while. Only safe
 * to call on text already known to be code, and only worth calling when the
 * source carries no indentation of its own -- question text extracted from exam
 * PDFs arrives flush-left.
 */
function reindentC(lines: string[]): string[] {
  const out: string[] = []
  const stack: string[] = []

  const closeBrace = () => {
    while (stack.length && stack[stack.length - 1] === 'virtual') stack.pop()
    stack.pop()
  }

  for (const line of lines) {
    const text = line.trim()
    if (!text) {
      out.push('')
      continue
    }

    const isBareOpen = text === '{'
    let level: number

    if (isBareOpen) {
      // Allman style: the brace belongs to the statement above it, so it takes
      // over that statement's implied scope instead of nesting inside it.
      if (stack[stack.length - 1] === 'virtual') stack.pop()
      level = stack.length
    } else if (text.startsWith('}')) {
      closeBrace()
      level = stack.length
    } else if (text.startsWith('#')) {
      level = 0
    } else if (SWITCH_LABEL.test(text)) {
      level = stack.length - 1
    } else {
      level = stack.length
    }

    out.push(INDENT.repeat(Math.max(level, 0)) + text)

    if (isBareOpen) {
      stack.push('brace')
      continue
    }

    // A leading `}` was already consumed above, so skip it here.
    for (const char of text.startsWith('}') ? text.slice(1) : text) {
      if (char === '{') stack.push('brace')
      else if (char === '}') closeBrace()
    }

    if (BRACELESS_HEADER.test(text) || text === 'else') {
      stack.push('virtual')
    } else {
      while (stack.length && stack[stack.length - 1] === 'virtual') stack.pop()
    }
  }

  return out
}

function reindentFence(fence: string): string {
  const match = fence.match(/^(```[^\n]*\n)([\s\S]*?)(\n?```)$/)
  if (!match) return fence
  // Dedent first: a listing where every line shares one leading indent carries
  // no structure and still needs re-indenting.
  const lines = dedent(match[2].split('\n'))
  if (looksMultiColumn(lines) || shouldKeepIndent(lines)) {
    return match[1] + lines.join('\n') + match[3]
  }
  return match[1] + reindentC(lines).join('\n') + match[3]
}

function dedent(lines: string[]): string[] {
  const indents = lines
    .filter((line) => line.trim())
    .map((line) => line.match(/^[ ]*/)?.[0].length ?? 0)
  if (!indents.length) return lines
  const min = Math.min(...indents)
  if (!min) return lines
  return lines.map((line) => (line.trim() ? line.slice(min) : line))
}

function fenceBlock(block: string[]): string {
  const nonEmpty = block.filter((line) => line.trim())
  const blanks = block.length - nonEmpty.length
  const collapse = blanks >= 2 && blanks >= nonEmpty.length * 0.4
  const source = dedent(collapse ? nonEmpty : block)
  const keep = looksMultiColumn(source) || shouldKeepIndent(source)
  const body = (keep ? source : reindentC(source))
    .join('\n')
    .replace(/^\n+|\n+$/g, '')
  return `\`\`\`c\n${body}\n\`\`\``
}

function promoteCodeBlocks(markdown: string): string {
  const lines = markdown.split('\n')
  const out: string[] = []
  let i = 0

  const nextContentIsCode = (from: number) => {
    let j = from
    while (j < lines.length && lines[j].trim() === '') j += 1
    return j < lines.length && isCodeLine(lines[j])
  }

  while (i < lines.length) {
    if (!isCodeLine(lines[i])) {
      out.push(lines[i])
      i += 1
      continue
    }

    const start = i
    const block: string[] = []
    // Source index of each collected line, so a rewind lands exactly even
    // though blank lines are pushed without advancing in step.
    const origin: number[] = []
    let depth = 0
    let settled = 0

    while (i < lines.length) {
      if (lines[i].trim() === '') {
        if (depth <= 0 && !nextContentIsCode(i + 1)) break
        block.push('')
        origin.push(i)
        i += 1
        continue
      }
      // An open brace means the listing cannot have ended, whatever the
      // line-by-line classifier makes of this particular line.
      if (depth <= 0 && !isCodeLine(lines[i])) break
      block.push(unwrapFullBold(lines[i]).replace(/\s+$/, ''))
      origin.push(i)
      depth += braceDelta(block[block.length - 1])
      if (depth <= 0 && isCodeLine(block[block.length - 1])) settled = block.length
      i += 1
    }

    // Unbalanced braces mean the run swallowed prose past the end of the
    // listing; keep only as much as closed cleanly, but always at least one
    // line so the outer loop cannot revisit it forever.
    if (depth > 0) {
      const keep = Math.max(settled, 1)
      if (keep < block.length) {
        i = origin[keep]
        block.length = keep
      }
    }

    const codeCount = block.filter((line) => line.trim()).length
    if (codeCount < 2) {
      for (let k = start; k < i; k += 1) out.push(lines[k])
      continue
    }

    if (out.length > 0 && out[out.length - 1].trim() !== '') out.push('')
    out.push(fenceBlock(block))
    out.push('')
  }

  return out.join('\n').replace(/\n{3,}/g, '\n\n')
}

/**
 * Drops the fence delimiters when any fence in the text holds unbalanced
 * braces, which means a listing was stored cut in half with the remainder
 * stranded in the prose after it. Letting the whole region be re-detected
 * keeps it together.
 */
function healSplitFences(markdown: string): string {
  const FENCE = /```([^\n]*)\n([\s\S]*?)\n?```/g

  // A fence opened mid-sentence leaves the first line of code sitting in the
  // language-tag position, so that text has to be kept, not dropped.
  const recover = (info: string) =>
    info.trim() && !/^[A-Za-z0-9_+#-]+$/.test(info.trim()) ? info.trim() : ''

  let broken = false
  for (const [, info, body] of markdown.matchAll(FENCE)) {
    if (braceDelta(recover(info) + '\n' + body) !== 0) broken = true
  }
  if (!broken) return markdown

  return markdown.replace(FENCE, (_, info: string, body: string) => {
    const head = recover(info)
    const lines = dedent(body.split('\n'))
    return '\n' + (head ? head + '\n' : '') + lines.join('\n') + '\n'
  })
}

export function prepareQuestionMarkdown(markdown: string): string {
  const parts = healSplitFences(markdown).split(/(```[\s\S]*?```|\$\$[\s\S]*?\$\$)/g)
  return parts
    .map((part) => {
      if (part.startsWith('$$')) return part
      if (part.startsWith('```')) return reindentFence(part)
      const withCode = promoteCodeBlocks(part)
      const chunks = withCode.split(/(```[\s\S]*?```)/g)
      return chunks
        .map((chunk) => {
          if (chunk.startsWith('```')) return chunk
          return chunk.replace(/([^\n])\n(?!\n)/g, '$1  \n')
        })
        .join('')
    })
    .join('')
}
