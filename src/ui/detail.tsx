import type { ReactNode } from "react"
import { Box, Text } from "ink"
import { ScrollView, colors, type Span, type StyledLine } from "@kud/ink-ui"
import { ageOf, type ServiceRecord } from "../core/index.js"
import { statusLabel, wordLabel, type Label, type Tone } from "../labels.js"
import { visibleLength } from "../render.js"
import { PaneTitle, Rule } from "./filter-column.js"
import {
  INK,
  Pending,
  pendingWidth,
  useMeasuredHeight,
} from "./overview-parts.js"

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
    ...(count ? [{ text: `  ${count}`, color: colors.muted }] : []),
  ],
})
const quiet = (text: string, at = EDGE): StyledLine => ({
  text: "",
  spans: [{ text: " ".repeat(at) }, { text, color: colors.muted }],
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
      color: colors.secondary,
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
      ...(healthy > 0 ? [quiet(`${healthy} more operational`, ROW)] : []),
    ])
  else if (healthy > 0)
    sections.push([quiet(`${healthy} components operational`)])
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

export const historyLines = (
  record: ServiceRecord,
  room: number,
  { at = EDGE, fill = false }: { at?: number; fill?: boolean } = {},
): StyledLine[] => {
  const { earlier } = split(record)
  const tailWidth = widest(earlier.map((i) => recentAgo(i.date)))
  const width = fill ? room : Math.min(room, MAX, historyWidth(record, at))
  const lines: StyledLine[] = []
  let last = ""
  for (const i of earlier) {
    const b = bucket(i.date)
    if (b !== last) {
      if (last) lines.push(BLANK)
      lines.push(quiet(b, at))
      last = b
    }
    lines.push(
      ...grid(
        [
          {
            lead: { text: "" },
            body: { text: i.title, color: INK },
            tail: { text: recentAgo(i.date), color: colors.muted },
          },
        ],
        width,
        0,
        tailWidth,
        at + 2,
      ),
    )
  }
  return lines
}

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
export const sectionsLines = (
  record: ServiceRecord,
  full: number,
  historyBusy = false,
): StyledLine[] => {
  const { earlier } = split(record)
  const { leadWidth, tailWidth } = sizes(record)
  const width = Math.min(
    full,
    Math.max(nowWidth(record, full), Math.min(MAX, historyWidth(record, ROW))),
  )
  const now = nowLines(record, width, leadWidth, tailWidth)
  const history = historyLines(record, width, { at: ROW, fill: true })
  return [
    ...headline(record),
    ...(now.length ? [BLANK, ...now] : []),
    BLANK,
    heading("History", earlier.length || undefined),
    ...(history.length
      ? history
      : historyBusy
        ? placeholderLines(width - ROW)
        : historyEmpty(record).map((l) => indent(l, ROW - EDGE))),
    ...noteLines(record),
  ]
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
  historyBusy = false,
}: {
  record: ServiceRecord | undefined
  // The page's inner width, frame excluded.
  width: number
  historyBusy?: boolean
}) => {
  const [ref, height] = useMeasuredHeight()
  const left = Math.floor(width * NOW_SHARE)
  const right = width - left - BEFORE_RULE - 1 - AFTER_RULE
  const pinned = record ? pinnedLines(record, left) : []
  // The now pane does not scroll, so it splits only when all of it fits under
  // its title; otherwise the page stacks and scrolls as one.
  const fits = height === 0 || pinned.length + 2 <= height
  const { earlier } = record ? split(record) : { earlier: [] }
  const history = record ? historyLines(record, right) : []
  return (
    <Box ref={ref} flexDirection="column" flexGrow={1}>
      {width < SPLIT_MIN || !fits ? (
        // One pane, titled as the split's first, scrolling with the keys.
        <Box flexDirection="column" flexGrow={1}>
          <PaneTitle label="Now" focused width={width} />
          <Text> </Text>
          {record ? (
            <ScrollView lines={sectionsLines(record, width, historyBusy)} />
          ) : (
            <PendingRows width={Math.min(48, width - EDGE)} />
          )}
        </Box>
      ) : (
        <Box flexDirection="row" flexGrow={1}>
          <Pane title="Now" focused={false} width={left}>
            {record ? (
              <ScrollView
                lines={pinned}
                isActive={false}
                showIndicator={false}
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
              <ScrollView lines={history} />
            ) : !record || historyBusy ? (
              <PendingRows width={Math.min(60, right - EDGE)} rows={4} />
            ) : (
              <ScrollView lines={historyEmpty(record)} isActive={false} />
            )}
          </Pane>
        </Box>
      )}
    </Box>
  )
}
