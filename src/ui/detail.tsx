import { Box } from "ink"
import { ScrollView, colors, type Span, type StyledLine } from "@kud/ink-ui"
import { ageOf, type ServiceRecord } from "../core/index.js"
import { statusLabel, wordLabel, type Label, type Tone } from "../labels.js"
import { visibleLength } from "../render.js"

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

// One grid for every section: a qualifier gutter, the thing, and a trailing
// time right-aligned to the content edge so every When column lines up.
const grid = (
  rows: { lead: Cell; body: Cell; tail?: Cell }[],
  width: number,
  leadWidth: number,
  tailWidth: number,
  indent = 0,
): StyledLine[] =>
  rows.map(({ lead, body, tail }) => {
    const bodyWidth = Math.max(
      8,
      width - indent - leadWidth - GAP - (tailWidth ? tailWidth + GAP : 0),
    )
    const spans: Span[] = [
      { text: " ".repeat(indent) },
      { ...lead, text: pad(lead.text, leadWidth + GAP) },
      { ...body, text: pad(body.text, bodyWidth) },
    ]
    if (tailWidth)
      spans.push({
        ...(tail ?? { text: "" }),
        text: " ".repeat(GAP) + padStart(tail?.text ?? "", tailWidth),
      })
    return { text: "", spans }
  })

const heading = (title: string, count?: number): StyledLine => ({
  text: "",
  spans: [
    { text: title, bold: true },
    ...(count ? [{ text: `  ${count}`, color: colors.muted }] : []),
  ],
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

const headline = (record: ServiceRecord): StyledLine => {
  const status = statusLabel(record.indicator)
  return {
    text: "",
    spans: [
      { text: status.text, color: TONE[status.tone] },
      { text: `  ${record.description}  `, bold: true },
      { text: record.url.replace(/^https:\/\//, ""), color: colors.muted },
    ],
  }
}

const footnotes = (record: ServiceRecord): StyledLine[] => [
  ...(record.historyFailed
    ? [
        BLANK,
        {
          text: "History unavailable: its feed could not be read.",
          color: colors.muted,
        },
      ]
    : []),
  ...(record.note ? [BLANK, { text: record.note, color: colors.muted }] : []),
]

// Group earlier incidents under a label shown once, in the lead gutter.
const grouped = (earlier: ServiceRecord["recent"]) => {
  let last = ""
  return earlier.map((i) => {
    const b = bucket(i.date)
    const lead = b === last ? "" : b
    last = b
    return {
      lead: { text: lead, color: colors.muted },
      body: { text: i.title, color: colors.muted },
      tail: { text: recentAgo(i.date), color: colors.muted },
    }
  })
}

// What is happening now: open incidents first, then the components they hit.
const nowLines = (
  record: ServiceRecord,
  width: number,
  leadWidth: number,
  tailWidth: number,
): StyledLine[] => {
  const { broken, healthy } = split(record)
  const affected = broken.map((c) => ({
    lead: tone(wordLabel(c.status)),
    body: { text: c.name },
  }))
  const open = record.active.map((i) => ({
    lead: tone(wordLabel(i.impact)),
    body: { text: i.title, bold: true },
    tail: { text: ageOf(i.date) ? `for ${ageOf(i.date)}` : "" },
  }))
  return [
    ...(open.length
      ? [
          heading("Open incidents", open.length),
          ...grid(open, width, leadWidth, tailWidth, 2),
        ]
      : []),
    ...(affected.length
      ? [
          ...(open.length ? [BLANK] : []),
          heading("Affected components", affected.length),
          ...grid(affected, width, leadWidth, tailWidth, 2),
        ]
      : []),
    ...(broken.length === 0 && healthy > 0
      ? [{ text: `${healthy} components operational`, color: colors.muted }]
      : []),
  ]
}

const natural = (record: ServiceRecord, lead: number, tail: number): number =>
  2 +
  lead +
  GAP +
  widest([
    ...record.components.map((c) => c.name),
    ...record.active.map((i) => i.title),
    ...record.recent.map((i) => i.title),
  ]) +
  GAP +
  tail

const sizes = (record: ServiceRecord) => {
  const { broken, earlier } = split(record)
  const leadWidth = widest([
    ...broken.map((c) => wordLabel(c.status).text),
    ...record.active.map((i) => wordLabel(i.impact).text),
    ...earlier.map((i) => bucket(i.date)),
  ])
  const tailWidth = widest([
    ...record.active.map((i) => `for ${ageOf(i.date)}`),
    ...earlier.map((i) => recentAgo(i.date)),
  ])
  return { leadWidth, tailWidth }
}

export const sectionsLines = (
  record: ServiceRecord,
  full: number,
): StyledLine[] => {
  const { earlier } = split(record)
  const { leadWidth, tailWidth } = sizes(record)
  const width = Math.min(full, MAX, natural(record, leadWidth, tailWidth))
  const now = nowLines(record, width, leadWidth, tailWidth)
  return [
    headline(record),
    ...(now.length ? [BLANK, ...now] : []),
    ...(earlier.length
      ? [
          BLANK,
          heading("Earlier", earlier.length),
          ...grid(grouped(earlier), width, leadWidth, tailWidth, 2),
        ]
      : []),
    ...footnotes(record),
  ]
}

// Wide terminals pin what is happening on the left and scroll history on the
// right; narrower ones stack the same sections in one column.
const SPLIT_MIN = 150

export const historyLines = (
  record: ServiceRecord,
  width: number,
): StyledLine[] => {
  const { earlier } = split(record)
  if (!earlier.length) return []
  const tailWidth = widest(earlier.map((i) => recentAgo(i.date)))
  const lines: StyledLine[] = [heading("History", earlier.length)]
  let last = ""
  for (const i of earlier) {
    const b = bucket(i.date)
    if (b !== last) {
      lines.push(BLANK, { text: b, color: colors.muted, bold: true })
      last = b
    }
    lines.push(
      ...grid(
        [
          {
            lead: { text: "" },
            body: { text: i.title },
            tail: { text: recentAgo(i.date), color: colors.muted },
          },
        ],
        width,
        0,
        tailWidth,
        0,
      ),
    )
  }
  return lines
}

export const DetailBody = ({
  record,
  width,
}: {
  record: ServiceRecord
  width: number
}) => {
  if (width < SPLIT_MIN)
    return <ScrollView lines={sectionsLines(record, width)} />
  const { leadWidth } = sizes(record)
  const tailWidth = widest(record.active.map((i) => `for ${ageOf(i.date)}`))
  const want =
    2 +
    leadWidth +
    GAP +
    widest([
      ...record.components.map((c) => c.name),
      ...record.active.map((i) => i.title),
    ]) +
    GAP +
    tailWidth
  const left = Math.min(want, Math.floor((width - 3) * 0.55))
  const historyTail = widest(
    split(record).earlier.map((i) => recentAgo(i.date)),
  )
  const right = Math.min(
    width - left - 3,
    2 + widest(record.recent.map((i) => i.title)) + GAP + historyTail,
  )
  const leftLines = [
    headline(record),
    BLANK,
    ...nowLines(record, left, leadWidth, tailWidth),
    ...footnotes(record),
  ]
  return (
    <Box flexDirection="row" flexGrow={1}>
      <Box width={left} flexShrink={0} flexDirection="column">
        <ScrollView lines={leftLines} isActive={false} />
      </Box>
      <Box
        width={3}
        flexShrink={0}
        borderStyle="single"
        borderTop={false}
        borderBottom={false}
        borderRight={false}
        borderColor={colors.muted}
      />
      <Box width={right} flexDirection="column">
        <ScrollView lines={historyLines(record, right)} />
      </Box>
    </Box>
  )
}
