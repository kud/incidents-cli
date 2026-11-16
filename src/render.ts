import { Chalk } from "chalk"
import { colors } from "@kud/ink-ui"
import {
  ageOf,
  whenLabel,
  worstFirst,
  type ServiceRecord,
} from "./core/index.js"
import {
  DISCLAIMER,
  statusLabel,
  withGlyph,
  wordLabel,
  type Label,
  type Tone,
} from "./labels.js"
import { ageText, headline } from "./summary.js"

export interface RenderOptions {
  color: boolean
  links: boolean
  now?: number
  note?: string | null
}

const ESC = String.fromCharCode(27)
const BEL = String.fromCharCode(7)
const ANSI = new RegExp(`${ESC}\\[[0-9;]*[a-zA-Z]`, "g")
const OSC8 = new RegExp(
  `${ESC}\\]8;;[^${BEL}${ESC}]*(?:${BEL}|${ESC}\\\\)`,
  "g",
)

export const stripEscapes = (s: string): string =>
  s.replace(OSC8, "").replace(ANSI, "")

export const visibleLength = (s: string): number => [...stripEscapes(s)].length

// An OSC 8 hyperlink: terminals that know it make `text` clickable, the rest
// print `text` alone.
export const hyperlink = (url: string, text: string): string =>
  url ? `\u001B]8;;${url}\u001B\\${text}\u001B]8;;\u001B\\` : text

const pad = (s: string, width: number): string =>
  s + " ".repeat(Math.max(0, width - visibleLength(s)))

const toneColour: Record<Tone, string> = {
  error: colors.error,
  warning: colors.warning,
  info: colors.info,
  success: colors.success,
  muted: colors.muted,
}

const styler = ({ color, links }: Pick<RenderOptions, "color" | "links">) => {
  const chalk = new Chalk({ level: color ? 3 : 0 })
  return {
    tone: (text: string, tone: Tone) => chalk.hex(toneColour[tone])(text),
    muted: (text: string) => chalk.hex(colors.muted)(text),
    bold: (text: string) => chalk.bold(text),
    link: (text: string, url: string) => (links ? hyperlink(url, text) : text),
  }
}

// Columns padded to their widest cell, two spaces apart, every line two in.
// With `header`, the first row is the column names, muted. A column in
// `right` is aligned to its right edge.
const table = (
  rows: string[][],
  muted: (s: string) => string,
  { header = true, right = [] as number[] } = {},
): string[] => {
  const widths = rows[0].map((_, i) =>
    Math.max(...rows.map((r) => visibleLength(r[i] ?? ""))),
  )
  return rows.map((row, index) => {
    const line = row
      .map((cell, i) =>
        right.includes(i)
          ? " ".repeat(Math.max(0, widths[i] - visibleLength(cell))) + cell
          : pad(cell, widths[i]),
      )
      .join("  ")
    return `  ${header && index === 0 ? muted(line.trimEnd()) : line.trimEnd()}`
  })
}

// One line per service, as the TUI's list draws it: the name, the status,
// how long, then the headline. Worst first.
export const renderOverview = (
  records: ServiceRecord[],
  options: RenderOptions,
): string => {
  const s = styler(options)
  const rows = worstFirst(records).map((r) => {
    const label = statusLabel(r.indicator)
    const loud = r.indicator !== "none" && r.indicator !== "link"
    const line = headline(r)
    return [
      s.bold(s.link(r.name, r.url)),
      s.tone(label.text, label.tone),
      s.muted(ageText(r)),
      loud ? line : s.muted(line),
    ]
  })
  return [
    "",
    ...(rows.length ? table(rows, s.muted, { header: false, right: [2] }) : []),
    "",
    s.muted(`  ${DISCLAIMER}`),
    `  ${s.bold("incidents list <service>")}${s.muted(" for detail.")}`,
    ...(options.note ? [s.muted(`  ${options.note}`)] : []),
    "",
  ].join("\n")
}

const OPERATIONAL = "operational"

// One service in full: its name, what it declares and where, then its open
// incidents and its components as two tables, then what came before.
export const renderDetail = (
  record: ServiceRecord,
  options: RenderOptions,
): string => {
  const s = styler(options)
  const now = options.now ?? Date.now()
  const status = statusLabel(record.indicator)
  const broken = record.components.filter((c) => c.status !== OPERATIONAL)
  const healthy = record.components.length - broken.length
  const word = (raw: string | undefined, fallback: (r: string) => Label) => {
    const w = withGlyph(fallback(raw ?? ""))
    return s.tone(w.text, w.tone)
  }
  const incidents = record.active.map((i) => [
    word(i.impact, wordLabel),
    s.link(i.title, i.link),
    s.muted(ageOf(i.date, now)),
  ])
  const components = broken.map((c) => [word(c.status, wordLabel), c.name])
  const current = new Set(
    record.active.flatMap((i) => [i.link, i.title]).filter(Boolean),
  )
  const upcoming = record.upcoming?.length ?? 0
  const earlier = record.recent
    .filter((i) => !current.has(i.link) && !current.has(i.title))
    .slice(0, 7)
  const url = record.url.replace(/^https?:\/\//, "")
  return [
    "",
    `  ${s.bold(record.name)}`,
    `  ${s.tone(status.text, status.tone)}  ${record.description}`,
    `  ${s.muted(s.link(url, record.url))}`,
    ...(record.indicator === "none" ? [s.muted(`  ${DISCLAIMER}`)] : []),
    "",
    ...(incidents.length
      ? [
          ...table(
            [["Status", "Open incident", "For"], ...incidents],
            s.muted,
            {
              right: [2],
            },
          ),
          "",
        ]
      : []),
    ...(components.length
      ? [
          ...table([["Status", "Component"], ...components], s.muted),
          ...(healthy > 0 ? [s.muted(`  + ${healthy} ${OPERATIONAL}`)] : []),
          "",
        ]
      : healthy > 0
        ? [s.muted(`  ${healthy} components ${OPERATIONAL}`), ""]
        : []),
    ...(earlier.length
      ? [
          ...table(
            [
              ["Earlier", "When"],
              ...earlier.map((i) => [
                s.muted(s.link(i.title, i.link)),
                s.muted(whenLabel(i.date, now)),
              ]),
            ],
            s.muted,
          ),
          "",
        ]
      : []),
    ...(record.historyFailed
      ? [s.muted("  History unavailable: its feed could not be read."), ""]
      : []),
    ...(upcoming
      ? [
          s.muted(
            `  ${upcoming} upcoming maintenance${upcoming === 1 ? "" : "s"}`,
          ),
          "",
        ]
      : []),
    ...(record.note ? [s.muted(`  ${record.note}`), ""] : []),
    ...(options.note ? [s.muted(`  ${options.note}`), ""] : []),
  ].join("\n")
}
