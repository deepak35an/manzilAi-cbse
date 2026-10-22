"""Normalize C listings in PYQ question text into fenced, indented code blocks.

Question text extracted from exam PDFs arrives flush-left, so the renderer has to
guess which lines are code and cannot recover the original indentation. This
script moves that information into the data: each contiguous run of C statements
is re-indented by brace depth and wrapped in a ```c fence.

Only the "question" field is rewritten. Edits are applied as targeted string
replacements on the raw file text so the diff stays minimal and the surrounding
JSON formatting is untouched.

Usage:
    python scripts/normalize_code_blocks.py --file GATE_2017_2.json
    python scripts/normalize_code_blocks.py --file GATE_2017_2.json --write
    python scripts/normalize_code_blocks.py --all --write
"""

from __future__ import annotations

import argparse
import json
import math
import re
import sys
from pathlib import Path

CONTENT_DIR = Path(__file__).resolve().parents[1] / "data" / "Examination Content" / "GATE_CSE_PYQ"

INDENT = "    "

TYPE_KEYWORDS = (
    r"int|void|char|float|double|long|short|unsigned|signed|static|struct"
    r"|union|enum|typedef|const|register|extern|volatile|bool|size_t|FILE"
)

# A line must match one of these to count as C code.
CODE_PATTERNS = (
    # preprocessor directives
    re.compile(r"^#\s*(include|define|pragma|if|ifdef|ifndef|elif|else|endif|undef)\b"),
    # declarations and function signatures
    re.compile(rf"^({TYPE_KEYWORDS})\b.*[;{{(]"),
    # control flow
    re.compile(r"^(if|for|while|switch|do|else)\b.*[{;)]"),
    re.compile(r"^(else|do)\s*\{?$"),
    re.compile(r"^(case\b.*:|default\s*:)"),
    # jumps
    re.compile(r"^(return|break|continue|goto)\b[^.]*;$"),
    # braces alone on a line, e.g. "{", "};", "} }"
    re.compile(r"^[{}\s;]+$"),
    # a closing brace carrying the rest of a statement, e.g. "} while(x!=y);"
    re.compile(r"^\}\s*(while|else)\b"),
    # a statement that closes its block, e.g. "boxE = boxN; }"
    re.compile(r"^.*;\s*\}+\s*;?$"),
    # function call statement, e.g. printf("%d", n);
    re.compile(r"^[A-Za-z_]\w*\s*\(.*\)\s*;$"),
    # parenthesised expression statement, e.g. (*ptr)++;
    re.compile(r"^\(.*\)\s*(\+\+|--)\s*;$"),
    # function signature with an implicit return type, e.g. main()
    # Parameters are only allowed when the line opens a block, so that
    # "MultiDequeue(Q){" counts but the SQL schema line
    # "employees(emp-id, first-name)" does not.
    re.compile(r"^[A-Za-z_]\w*\s*\(\s*\)\s*\{?$"),
    re.compile(r"^[A-Za-z_]\w*\s*\([^;]*\)\s*\{$"),
    # assignment, e.g. n = ++m;  *ptr = 1;  arr[i] += 2;
    re.compile(
        r"^\*?[A-Za-z_][\w\[\]\.\*]*(->\w+)?\s*"
        r"(=|\+=|-=|\*=|/=|%=|\|=|&=|\^=|<<=|>>=)[^=].*;$"
    ),
    # declaration with a type the pattern above does not know, e.g. "Lock L1;"
    re.compile(r"^[A-Za-z_]\w*\s+\*?[A-Za-z_]\w*\s*;$"),
    # standalone increment / decrement, e.g. n--;  --n1;
    re.compile(r"^\*?\w+(\+\+|--)\s*;$"),
    re.compile(r"^(\+\+|--)\w+\s*;$"),
)

# Lines that look like code but are enumerated answer items or match-the-following
# rows, e.g. "(P) static char var;" or "(A) 12".
ENUM_PREFIX = re.compile(r"^\(?([A-Da-d]|[P-Sp-s]|[ivxIVX]+)[\).]")

FULL_BOLD = re.compile(r"^\*\*((?:(?!\*\*).)+)\*\*$")

FENCE = re.compile(r"```([^\n]*)\n([\s\S]*?)\n?```")

LANGUAGE_TAG = re.compile(r"[A-Za-z0-9_+#-]+")

# Two statements on one line separated by a run of spaces, which is how
# side-by-side listings (e.g. "Process X / Process Y") come out of the PDF.
COLUMN_GAP = re.compile(r";\s{2,}\S")

LITERAL = re.compile(r"\"(?:\\.|[^\"\\])*\"|'(?:\\.|[^'\\])*'")


def strip_comment(text: str) -> str:
    """Drop a trailing // comment, ignoring any that sits in a string literal."""
    masked = LITERAL.sub(lambda m: " " * len(m.group(0)), text)
    start = masked.find("//")
    return text[:start].rstrip() if start != -1 else text


def brace_delta(text: str) -> int:
    """Net braces opened by a line, ignoring any inside string literals."""
    bare = LITERAL.sub("", text)
    return bare.count("{") - bare.count("}")


def unwrap_unbalanced_fences(text: str) -> str:
    """Strip the fence delimiters when any of them holds unbalanced braces.

    A fence holding unbalanced braces is a listing that was cut in half, with
    the remainder stranded in the prose after it. All fences in the question go,
    not just the unbalanced one: a balanced fragment sitting between two broken
    ones would otherwise keep the region from being read as a single listing.
    """
    bodies = [body for _, body in FENCE.findall(text)]
    if not any(brace_delta(body) for body in bodies):
        return text

    def replace(match: re.Match[str]) -> str:
        return "\n" + "\n".join(dedent(match.group(2).split("\n"))) + "\n"

    return FENCE.sub(replace, text)


def looks_multi_column(lines: list[str]) -> bool:
    """True for listings printed as two or more columns side by side.

    Brace depth is meaningless across columns, so these must not be re-indented.
    Exam papers print variants of the same program next to each other, which
    shows up as repeated directives or several unclosed braces on one line.
    """
    if sum(1 for line in lines if COLUMN_GAP.search(line)) >= 2:
        return True
    for line in lines:
        if line.count("#include") >= 2:
            return True
        if line.count("{") >= 2 and "}" not in line:
            return True
        if len(re.findall(r"\bmain\s*\(", line)) >= 2:
            return True
    return False


def indent_unit(widths: list[int]) -> int:
    """The indentation step a listing was written with, e.g. 2, 3, or 4."""
    step = 0
    for width in widths:
        if width:
            step = math.gcd(step, width)
    return step or 1


def trust_existing_indent(lines: list[str]) -> bool:
    """True when the author's indentation agrees with the code's structure.

    Some listings arrive with indentation that survived extraction only in
    part -- a couple of stray deep lines over an otherwise flat body. Those read
    worse than a rebuild, so only keep indentation that mostly matches what the
    braces imply.
    """
    widths = [len(line) - len(line.lstrip()) for line in lines]
    unit = indent_unit(widths)
    source = [width // unit for width in widths]

    rebuilt = reindent(lines)
    computed = [(len(line) - len(line.lstrip())) // len(INDENT) for line in rebuilt]

    disagree = sum(1 for a, b in zip(source, computed) if a != b)
    return disagree <= len(source) * 0.25


def unwrap_full_bold(line: str) -> str:
    """Strip markdown bold wrapping a whole line, e.g. "**int i;**"."""
    match = FULL_BOLD.match(line.strip())
    return match.group(1) if match else line


def is_code_line(line: str) -> bool:
    """True when the line is a C statement rather than prose or math."""
    text = strip_comment(unwrap_full_bold(line).strip()).strip()
    if not text:
        return False
    # Math notation (subscripts, set symbols, Greek) never appears in these
    # listings, but does appear in language/probability questions that otherwise
    # look like code, e.g. "L1 = {a^p | p is a prime number}".
    if not text.isascii():
        return False
    if ENUM_PREFIX.match(text):
        return False
    return any(pattern.search(text) for pattern in CODE_PATTERNS)


BRACELESS_HEADER = re.compile(r"^(else\s+)?(if|for|while)\s*\(.*\)$")

SWITCH_LABEL = re.compile(r"^(case\b|default\s*:)")


def reindent(lines: list[str]) -> list[str]:
    """Re-indent C statements, tracking scopes on a stack.

    The stack holds one entry per open scope: BRACE for a real `{`, and VIRTUAL
    for the implied scope of a braceless `if`/`for`/`while`, which lasts for a
    single statement. This keeps nested braceless loops, Allman braces, switch
    labels, and braces that open and close on one line all correct.
    """
    BRACE, VIRTUAL = "brace", "virtual"
    out: list[str] = []
    stack: list[str] = []

    def close_brace() -> None:
        while stack and stack[-1] == VIRTUAL:
            stack.pop()
        if stack:
            stack.pop()

    for line in lines:
        text = line.strip()
        if not text:
            out.append("")
            continue

        is_bare_open = text == "{"

        if is_bare_open:
            # Allman style: the brace belongs to the statement above it, so it
            # takes over that statement's implied scope instead of nesting.
            if stack and stack[-1] == VIRTUAL:
                stack.pop()
            level = len(stack)
        elif text.startswith("}"):
            close_brace()
            level = len(stack)
        elif text.startswith("#"):
            level = 0
        elif SWITCH_LABEL.match(text):
            level = len(stack) - 1
        else:
            level = len(stack)

        out.append(INDENT * max(level, 0) + text)

        if is_bare_open:
            stack.append(BRACE)
            continue

        # Apply the remaining braces on this line, ignoring any inside string
        # literals. A leading `}` was already consumed above, so skip the first
        # character when it is one.
        scan = LITERAL.sub("", text)
        for char in scan[1:] if scan.startswith("}") else scan:
            if char == "{":
                stack.append(BRACE)
            elif char == "}":
                close_brace()

        if BRACELESS_HEADER.match(text) or text == "else":
            stack.append(VIRTUAL)
        else:
            # The single statement owned by any braceless header is complete.
            while stack and stack[-1] == VIRTUAL:
                stack.pop()

    return out


def dedent(lines: list[str]) -> list[str]:
    """Remove the indentation shared by every non-blank line."""
    widths = [len(line) - len(line.lstrip()) for line in lines if line.strip()]
    if not widths:
        return lines
    common = min(widths)
    if not common:
        return lines
    return [line[common:] if line.strip() else "" for line in lines]


def format_existing_fence(match: re.Match[str]) -> str:
    """Dedent a fence already present in the data, re-indenting if it is flat.

    Some listings arrive wrapped in a fence but with a uniform leading indent on
    every line, which carries no structure. Those get re-indented. Listings with
    genuine relative indentation are left as the author wrote them.

    Fences holding something other than C -- an array of numbers, a set of
    asymptotic growth expressions -- are left alone entirely.
    """
    info, body = match.group(1), match.group(2)

    # Some fences are opened mid-sentence, which leaves the first line of code
    # sitting in the language-tag position. Recover it as code; the indentation
    # of such a fence is unreliable, so rebuild it from scratch.
    malformed = bool(info.strip()) and not LANGUAGE_TAG.fullmatch(info.strip())
    if malformed:
        body = f"{info.strip()}\n{body}"
        info = ""

    lines = dedent(body.split("\n"))
    while lines and not lines[0].strip():
        lines.pop(0)
    while lines and not lines[-1].strip():
        lines.pop()
    if not lines:
        return match.group(0)

    if sum(1 for line in lines if is_code_line(line)) < 2:
        return match.group(0)

    if looks_multi_column(lines):
        return match.group(0)

    code = [line for line in lines if line.strip()]
    keep = (
        not malformed
        and any(line.startswith((" ", "\t")) for line in code)
        and trust_existing_indent(code)
    )
    if not keep:
        lines = reindent(code)

    fence = f"```{info.strip() or 'c'}\n" + "\n".join(lines) + "\n```"
    return surround(match, fence)


def surround(match: re.Match[str], fence: str) -> str:
    """Pad a fence with blank lines when it does not already own its own lines.

    A fence opened mid-sentence is not a fence at all as far as markdown is
    concerned, so the delimiters have to start a line.
    """
    text = match.string
    head = text[text.rfind("\n", 0, match.start()) + 1 : match.start()]

    tail_end = text.find("\n", match.end())
    tail = text[match.end() : tail_end if tail_end != -1 else len(text)]

    prefix = "\n\n" if head.strip() else ""
    suffix = "\n\n" if tail.strip() else ""
    return prefix + fence + suffix


def promote_code_blocks(segment: str) -> str:
    """Wrap each run of C statements in `segment` in a fenced block."""
    lines = segment.split("\n")
    out: list[str] = []
    i = 0

    while i < len(lines):
        if not is_code_line(lines[i]):
            out.append(lines[i])
            i += 1
            continue

        block: list[str] = []
        # Source index of each line in `block`. Blank lines are skipped rather
        # than collected, so the two cannot be related by length alone.
        origin: list[int] = []
        depth = 0
        # Count of leading lines in `block` that close cleanly, used to back out
        # of a listing whose braces never balance.
        settled = 0

        while i < len(lines):
            if not lines[i].strip():
                # Blank lines inside a listing are PDF extraction artifacts.
                # Consume them only if the listing continues.
                look = i
                while look < len(lines) and not lines[look].strip():
                    look += 1
                if look < len(lines) and (depth > 0 or is_code_line(lines[look])):
                    i = look
                    continue
                break
            # An open brace means the listing cannot have ended, whatever the
            # line-by-line classifier makes of this particular line.
            if depth <= 0 and not is_code_line(lines[i]):
                break
            block.append(unwrap_full_bold(lines[i]).rstrip())
            origin.append(i)
            depth += brace_delta(block[-1])
            if depth <= 0 and is_code_line(block[-1]):
                settled = len(block)
            i += 1

        # Unbalanced braces mean the run ran past the end of the listing and
        # swallowed prose; keep only as much as closed cleanly. Always keep at
        # least the first line, so the outer loop cannot revisit it forever.
        if depth > 0:
            keep = max(settled, 1)
            if keep < len(block):
                i = origin[keep]
                del block[keep:]

        # A single statement is more likely prose than a listing.
        if len(block) < 2:
            out.extend(block)
            continue

        if out and out[-1].strip():
            out.append("")
        out.append("```c")
        out.extend(block if looks_multi_column(block) else reindent(block))
        out.append("```")
        if i < len(lines) and lines[i].strip():
            out.append("")

    return "\n".join(out)


def normalize(question: str) -> str | None:
    """Return the rewritten question text, or None when nothing changed."""
    text = unwrap_unbalanced_fences(question)

    # Tidy the fences that remain and promote bare code only between them, so
    # nothing gets fenced twice.
    parts = re.split(r"(```[^\n]*\n[\s\S]*?\n?```)", text)
    rebuilt = "".join(
        FENCE.sub(format_existing_fence, part)
        if part.startswith("```")
        else promote_code_blocks(part)
        for part in parts
    )

    rebuilt = re.sub(r"\n{3,}", "\n\n", rebuilt)
    return rebuilt if rebuilt != question else None


def process(path: Path, write: bool) -> int:
    # newline="" on both read and write keeps the file's existing CRLF/LF
    # endings intact; the replacements below only touch JSON string literals,
    # which never contain a raw newline.
    with open(path, encoding="utf-8", newline="") as handle:
        raw = handle.read()
    questions = json.loads(raw)

    edits = 0
    for item in questions:
        original = item.get("question")
        if not isinstance(original, str):
            continue

        updated = normalize(original)
        if updated is None:
            continue

        old_literal = json.dumps(original)
        new_literal = json.dumps(updated)
        if raw.count(old_literal) != 1:
            print(
                f"  ! Q{item.get('question_number')}: could not locate a unique "
                f"string literal in the raw file, skipping",
                file=sys.stderr,
            )
            continue

        raw = raw.replace(old_literal, new_literal)
        edits += 1

        print(f"\n{'=' * 72}\n{path.name}  Q{item.get('question_number')}\n{'=' * 72}")
        print("--- before ---")
        print(original)
        print("--- after ---")
        print(updated)

    if not edits:
        print(f"{path.name}: no changes")
        return 0

    # Guard against producing a file that no longer parses.
    json.loads(raw)

    if write:
        with open(path, "w", encoding="utf-8", newline="") as handle:
            handle.write(raw)
        print(f"\n{path.name}: rewrote {edits} question(s)")
    else:
        print(f"\n{path.name}: {edits} question(s) would change (dry run)")

    return edits


def main() -> int:
    # Question text contains Greek and subscript characters that the default
    # Windows console encoding cannot represent.
    for stream in (sys.stdout, sys.stderr):
        stream.reconfigure(encoding="utf-8", errors="replace")

    parser = argparse.ArgumentParser(description=__doc__)
    group = parser.add_mutually_exclusive_group(required=True)
    group.add_argument("--file", help="file name inside the GATE_CSE_PYQ directory")
    group.add_argument("--all", action="store_true", help="process every JSON file")
    parser.add_argument(
        "--write", action="store_true", help="apply changes (default is a dry run)"
    )
    args = parser.parse_args()

    paths = sorted(CONTENT_DIR.glob("*.json")) if args.all else [CONTENT_DIR / args.file]

    total = 0
    for path in paths:
        if not path.exists():
            print(f"{path} not found", file=sys.stderr)
            return 1
        total += process(path, args.write)

    print(f"\ntotal: {total} question(s)")
    return 0


if __name__ == "__main__":
    sys.exit(main())
