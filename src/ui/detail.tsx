import { useState, type ReactNode } from "react"
import { Box, Text, useInput } from "ink"
import { colors, type Span, type StyledLine } from "@kud/ink-ui"
import { ageOf, type ServiceRecord } from "../core/index.js"
import { statusLabel, wordLabel, type Label, type Tone } from "../labels.js"
import { visibleLength } from "../render.js"
import { PaneTitle, Rule } from "./filter-column.js"
import { INK, Pending, pendingWidth } from "./overview-parts.js"

const TONE: Record<Tone, string> = {
  error: colors.error,
  warning: colors.warning,
  info: colors.info,
  success: colors.success,
  muted: colors.muted,
}
const GAP = 2
const MAX = 110
const BLANK: StyledLine = { text: "" }
// A pane's content starts under the first letter of its title, one cell in,
// where the page header's icon sits; rows under a heading sit two further in.
const EDGE = 1
const ROW = EDGE + 2
// The overview's gutter between two panes: one space, the rule, two spaces.
const BEFORE_RULE = 1
const AFTER_RULE = 2
// Wide terminals pin what is happening now on the left and scroll history on
// the right; narrower ones stack the same sections in one column. The split
// comes from the terminal alone, as the list's does, so the rule holds still
// from one service to the next.
const SPLIT_MIN = 150
const NOW_SHARE = 0.45

type Cell = { text: string; color?: string; bold?: boolean }

const pad = (text: string, width: number): string => {
  const chars = [...text]
  if (chars.length <= width) return text + " ".repeat(width - chars.length)
  return `${chars.slice(0, Math.max(0, width - 1)).join("")}…`
}
const padStart = (text: string, width: number): string =>
  " ".repeat(Math.max(0, width - visibleLength(text))) + text
const widest = (cells: string[]): number =>
  Math.max(0, ...cells.map(visibleLength))
const tone = (label: Label): Cell => ({
  text: label.text,
  color: TONE[label.tone],
})
const indent = (line: StyledLine, cells: number): StyledLine => ({
  text: "",
  spans: [
    { text: " ".repeat(cells) },
    ...(line.spans ?? [
      { text: line.text, color: line.color, bold: line.bold },
    ]),
  ],
})

// One grid for every section: a qualifier gutter, the thing, and a trailing
// time right-aligned to the content edge so every time column lines up.
// `width` counts from the pane's own left edge.
const grid = (
  rows: { lead: Cell; body: Cell; tail?: Cell }[],
  width: number,
  leadWidth: number,
  tailWidth: number,
  start = ROW,
): StyledLine[] =>
  rows.map(({ lead, body, tail }) => {
    const bodyWidth = Math.max(
      8,
      width -
        start -
        (leadWidth ? leadWidth + GAP : 0) -
        (tailWidth ? tailWidth + GAP : 0),
    )
    const spans: Span[] = [
      { text: " ".repeat(start) },
      ...(leadWidth
        ? [{ ...lead, text: pad(lead.text, leadWidth + GAP) }]
        : []),
      { ...body, text: pad(body.text, bodyWidth) },
    ]
    if (tailWidth)
      spans.push({
        ...(tail ?? { text: "" }),
        text: " ".repeat(GAP) + padStart(tail?.text ?? "", tailWidth),
      })
    return { text: "", spans }
  })

// Every bold text names its foreground: plain bold takes the terminal's bold
// colour, which some themes paint in the warning orange.
const heading = (title: string, count?: number): StyledLine => ({
  text: "",
  spans: [
    { text: " ".repeat(EDGE) },
    { text: title, bold: true, color: INK },
    ...(count ? [{ text: `  ${count}`, color: INK }] : []),
  ],
})
const quiet = (text: string, at = EDGE): StyledLine => ({
  text: "",
  spans: [{ text: " ".repeat(at) }, { text, color: colors.muted }],
})
// Content in the normal text colour: a count is part of the answer, not an
// aside, so it is never greyed out.
const plain = (text: string, at = EDGE): StyledLine => ({
  text: "",
  spans: [{ text: " ".repeat(at) }, { text, color: INK }],
})

const dayStart = (ms: number): number => {
  const d = new Date(ms)
  d.setHours(0, 0, 0, 0)
  return d.getTime()
}
const bucket = (raw: string, now = Date.now()): string => {
  const ms = new Date(raw).getTime()
  if (Number.isNaN(ms)) return "Undated"
  const days = Math.round((dayStart(now) - dayStart(ms)) / 86_400_000)
  if (days <= 0) return "Today"
  if (days === 1) return "Yesterday"
  if (days < 7) return "This week"
  const d = new Date(ms)
  const sameYear = d.getFullYear() === new Date(now).getFullYear()
  return d.toLocaleString(undefined, {
    month: "long",
    ...(sameYear ? {} : { year: "numeric" }),
  })
}
const shortDate = (raw: string): string => {
  const d = new Date(raw)
  return Number.isNaN(d.getTime())
    ? raw
    : d.toLocaleString(undefined, { day: "numeric", month: "short" })
}
const recentAgo = (raw: string): string => {
  const a = ageOf(raw)
  return a && !(a.endsWith("d") && parseInt(a, 10) >= 7)
    ? `${a} ago`
    : shortDate(raw)
}

const split = (record: ServiceRecord) => {
  const broken = record.components.filter((c) => c.status !== "operational")
  const current = new Set(
    record.active.flatMap((i) => [i.link, i.title]).filter(Boolean),
  )
  const earlier = record.recent.filter(
    (i) => !current.has(i.link) && !current.has(i.title),
  )
  return {
    broken,
    healthy: record.components.length - broken.length,
    earlier,
  }
}

// The declared status, then the page it came from on its own line, so the
// address is never the part that gets cut.
const headline = (record: ServiceRecord): StyledLine[] => {
  const status = statusLabel(record.indicator)
  return [
    {
      text: "",
      spans: [
        { text: " ".repeat(EDGE) },
        { text: status.text, color: TONE[status.tone] },
        { text: "  " },
        { text: record.description, bold: true, color: INK },
      ],
    },
    {
      text: "",
      spans: [
        { text: " ".repeat(EDGE) },
        {
          text: record.url.replace(/^https?:\/\//, ""),
          color: colors.link,
        },
      ],
    },
  ]
}

const noteLines = (record: ServiceRecord): StyledLine[] =>
  record.note ? [BLANK, quiet(record.note)] : []

const historyFailedLines = (record: ServiceRecord): StyledLine[] =>
  record.historyFailed
    ? [quiet("History unavailable: its feed could not be read.")]
    : []

// What is happening now: open incidents first, then the components they hit,
// then a count of the ones that are fine.
const nowLines = (
  record: ServiceRecord,
  width: number,
  leadWidth: number,
  tailWidth: number,
): StyledLine[] => {
  const { broken, healthy } = split(record)
  const affected = broken.map((c) => ({
    lead: tone(wordLabel(c.status)),
    body: { text: c.name, color: INK },
  }))
  const open = record.active.map((i) => ({
    lead: tone(wordLabel(i.impact)),
    body: { text: i.title, bold: true, color: INK },
    tail: {
      text: ageOf(i.date) ? `for ${ageOf(i.date)}` : "",
      color: INK,
    },
  }))
  const sections: StyledLine[][] = []
  if (open.length)
    sections.push([
      heading("Open incidents", open.length),
      ...grid(open, width, leadWidth, tailWidth),
    ])
  if (affected.length)
    sections.push([
      heading("Affected components", affected.length),
      ...grid(affected, width, leadWidth, tailWidth),
      ...(healthy > 0 ? [plain(`${healthy} more operational`, ROW)] : []),
    ])
  else if (healthy > 0)
    sections.push([plain(`${healthy} components operational`)])
  return sections.flatMap((s, i) => (i ? [BLANK, ...s] : s))
}

const sizes = (record: ServiceRecord) => {
  const { broken } = split(record)
  const leadWidth = widest([
    ...broken.map((c) => wordLabel(c.status).text),
    ...record.active.map((i) => wordLabel(i.impact).text),
  ])
  const tailWidth = widest(record.active.map((i) => `for ${ageOf(i.date)}`))
  return { leadWidth, tailWidth }
}

// The width the now rows want: no wider, so their times sit by their titles
// rather than out at the rule.
const nowWidth = (record: ServiceRecord, room: number): number => {
  const { leadWidth, tailWidth } = sizes(record)
  const titles = widest([
    ...record.components.map((c) => c.name),
    ...record.active.map((i) => i.title),
  ])
  return Math.min(
    room,
    MAX,
    ROW + leadWidth + GAP + titles + (tailWidth ? GAP + tailWidth : 0),
  )
}

// History grouped under period labels, newest first, each row's time
// right-aligned to one edge. Labels start at `at`, rows two further in; the
// rows take their natural width within `room`, or all of it when `fill`.
const historyWidth = (record: ServiceRecord, at: number): number => {
  const { earlier } = split(record)
  return (
    at +
    2 +
    widest(earlier.map((i) => i.title)) +
    GAP +
    widest(earlier.map((i) => recentAgo(i.date)))
  )
}

// A line the scroller shows, and whether it is an incident, so the note at
// the cut counts incidents rather than lines.
type Row = { line: StyledLine; entry?: boolean }
const rowsOf = (lines: StyledLine[]): Row[] => lines.map((line) => ({ line }))

const historyRows = (
  record: ServiceRecord,
  room: number,
  { at = EDGE, fill = false }: { at?: number; fill?: boolean } = {},
): Row[] => {
  const { earlier } = split(record)
  const tailWidth = widest(earlier.map((i) => recentAgo(i.date)))
  const width = fill ? room : Math.min(room, MAX, historyWidth(record, at))
  const lines: Row[] = []
  let last = ""
  for (const i of earlier) {
    const b = bucket(i.date)
    if (b !== last) {
      if (last) lines.push({ line: BLANK })
      lines.push({ line: quiet(b, at) })
      last = b
    }
    lines.push(
      ...grid(
        [
          {
            lead: { text: "" },
            body: { text: i.title, color: INK },
            tail: { text: recentAgo(i.date), color: colors.accent },
          },
        ],
        width,
        0,
        tailWidth,
        at + 2,
      ).map((line) => ({ line, entry: true })),
    )
  }
  return lines
}

export const historyLines = (
  ...args: Parameters<typeof historyRows>
): StyledLine[] => historyRows(...args).map((r) => r.line)

const historyEmpty = (record: ServiceRecord): StyledLine[] =>
  record.historyFailed
    ? historyFailedLines(record)
    : [quiet("No past incidents on record.")]

// The loaders' bars as plain lines, held still, for a pane that scrolls
// as one list and so cannot hold the animated rows.
const placeholderLines = (width: number, rows = 3): StyledLine[] =>
  Array.from({ length: rows }, (_, i) => ({
    text: "",
    spans: [
      { text: " ".repeat(ROW) },
      { text: "▀".repeat(pendingWidth(width, i)), color: colors.track },
    ],
  }))

// The stacked page, for terminals too narrow to split: the same sections in
// one scrolling column, history last, every time on one edge.
const sectionsRows = (
  record: ServiceRecord,
  full: number,
  historyBusy = false,
): Row[] => {
  const { earlier } = split(record)
  const { leadWidth, tailWidth } = sizes(record)
  const width = Math.min(
    full,
    Math.max(nowWidth(record, full), Math.min(MAX, historyWidth(record, ROW))),
  )
  const now = nowLines(record, width, leadWidth, tailWidth)
  const history = historyRows(record, width, { at: ROW, fill: true })
  return [
    ...rowsOf([
      ...headline(record),
      ...(now.length ? [BLANK, ...now] : []),
      BLANK,
      heading("History", earlier.length || undefined),
    ]),
    ...(history.length
      ? history
      : rowsOf(
          historyBusy
            ? placeholderLines(width - ROW)
            : historyEmpty(record).map((l) => indent(l, ROW - EDGE)),
        )),
    ...rowsOf(noteLines(record)),
  ]
}

export const sectionsLines = (
  ...args: Parameters<typeof sectionsRows>
): StyledLine[] => sectionsRows(...args).map((r) => r.line)

const Line = ({ line }: { line: StyledLine }) =>
  line.spans ? (
    <Text wrap="truncate-end">
      {line.spans.map((s, j) => (
        <Text key={j} color={s.color} bold={s.bold} dimColor={s.dim}>
          {s.text}
        </Text>
      ))}
      {line.spans.length ? "" : " "}
    </Text>
  ) : (
    <Text color={line.color} bold={line.bold} wrap="truncate-end">
      {line.text || " "}
    </Text>
  )

// Lines held to `height` rows. When they run past it, the last row becomes
// the board's scroll note, "N more below · ↑↓ scroll", in the column `at`,
// and the arrows move the window; a page never grows past the terminal.
const Scroller = ({
  rows,
  height,
  at,
  isActive = true,
}: {
  rows: Row[]
  height: number
  at: number
  isActive?: boolean
}) => {
  const [start, setStart] = useState(0)
  const fits = rows.length <= height
  const room = fits ? rows.length : Math.max(1, height - 1)
  const end = Math.max(0, rows.length - room)
  const top = Math.min(start, end)
  useInput(
    (input, key) => {
      const move = (to: number) => setStart(Math.max(0, Math.min(end, to)))
      if (key.downArrow || input === "j") move(top + 1)
      if (key.upArrow || input === "k") move(top - 1)
      if (key.pageDown || input === " " || input === "f") move(top + room)
      if (key.pageUp || input === "b") move(top - room)
      if (input === "g") move(0)
      if (input === "G") move(end)
    },
    { isActive: isActive && !fits },
  )
  const incidents = (part: Row[]) => part.filter((r) => r.entry).length
  const above = incidents(rows.slice(0, top))
  const below = incidents(rows.slice(top + room))
  const note = [
    above ? `${above} more above` : "",
    below ? `${below} more below` : "",
    "↑↓ scroll",
  ]
    .filter(Boolean)
    .join(" · ")
  return (
    <Box flexDirection="column" flexShrink={0} overflow="hidden">
      {rows.slice(top, top + room).map((r, i) => (
        <Line key={top + i} line={r.line} />
      ))}
      {fits ? null : (
        <Text wrap="truncate-end">
          {" ".repeat(at)}
          <Text color={colors.muted}>{note}</Text>
        </Text>
      )}
    </Box>
  )
}

// Placeholder rows while a pane waits on the network: the overview's own
// shimmer, so a loading detail reads like a loading list.
const PendingRows = ({ width, rows = 3 }: { width: number; rows?: number }) => (
  <Box flexDirection="column" paddingLeft={EDGE} flexShrink={0}>
    {Array.from({ length: rows }, (_, i) => (
      <Pending key={i} row={i} width={pendingWidth(width, i)} />
    ))}
  </Box>
)

const Pane = ({
  title,
  count,
  focused,
  width,
  children,
}: {
  title: string
  count?: number
  focused: boolean
  width: number
  children: ReactNode
}) => (
  <Box flexDirection="column" width={width} flexShrink={0}>
    <PaneTitle label={title} count={count} focused={focused} width={width} />
    <Text> </Text>
    {children}
  </Box>
)

const pinnedLines = (record: ServiceRecord, left: number): StyledLine[] => {
  const { leadWidth, tailWidth } = sizes(record)
  return [
    ...headline(record),
    BLANK,
    ...nowLines(record, nowWidth(record, left), leadWidth, tailWidth),
    ...noteLines(record),
  ]
}

export const DetailBody = ({
  record,
  width,
  height = Number.MAX_SAFE_INTEGER,
  historyBusy = false,
}: {
  record: ServiceRecord | undefined
  // The page's inner width and the rows its body may take, frame, title row,
  // the blank under it and the keys excluded.
  width: number
  height?: number
  historyBusy?: boolean
}) => {
  // Each pane's title and the blank under it come off the top.
  const room = Math.max(1, height - 2)
  const left = Math.floor(width * NOW_SHARE)
  const right = width - left - BEFORE_RULE - 1 - AFTER_RULE
  const pinned = record ? pinnedLines(record, left) : []
  // The now pane does not scroll, so it splits only when all of it fits under
  // its title; otherwise the page stacks and scrolls as one.
  const fits = pinned.length <= room
  const { earlier } = record ? split(record) : { earlier: [] }
  const history = record ? historyRows(record, right) : []
  return (
    <Box flexDirection="column" flexGrow={1}>
      {width < SPLIT_MIN || !fits ? (
        // One pane, titled as the split's first, scrolling with the keys.
        <Box flexDirection="column" flexGrow={1}>
          <PaneTitle label="Now" focused width={width} />
          <Text> </Text>
          {record ? (
            <Scroller
              rows={sectionsRows(record, width, historyBusy)}
              height={room}
              at={ROW + 2}
            />
          ) : (
            <PendingRows width={Math.min(48, width - EDGE)} />
          )}
        </Box>
      ) : (
        <Box flexDirection="row" flexGrow={1}>
          <Pane title="Now" focused={false} width={left}>
            {record ? (
              <Scroller
                rows={rowsOf(pinned)}
                height={room}
                at={EDGE}
                isActive={false}
              />
            ) : (
              <PendingRows width={left - EDGE} />
            )}
          </Pane>
          <Box width={BEFORE_RULE} flexShrink={0} />
          <Rule />
          <Box width={AFTER_RULE} flexShrink={0} />
          <Pane
            title="History"
            count={earlier.length || undefined}
            focused
            width={right}
          >
            {history.length ? (
              <Scroller rows={history} height={room} at={EDGE + 2} />
            ) : !record || historyBusy ? (
              <PendingRows width={Math.min(60, right - EDGE)} rows={4} />
            ) : (
              <Scroller
                rows={rowsOf(historyEmpty(record))}
                height={room}
                at={EDGE}
                isActive={false}
              />
            )}
          </Pane>
        </Box>
      )}
    </Box>
  )
}
