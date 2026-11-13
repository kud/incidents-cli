import { Chalk } from "chalk"
import { colors } from "@kud/ink-ui"
import {
  ageOf,
  whenLabel,
  worstFirst,
  type ServiceRecord,
} from "./core/index.js"
import { declaredText, statusLabel, wordLabel, type Tone } from "./labels.js"

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
    link: (text: string, url: string) =>
      links && url ? `\u001B]8;;${url}\u001B\\${text}\u001B]8;;\u001B\\` : text,
  }
}

const table = (rows: string[][], muted: (s: string) => string): string[] => {
  const widths = rows[0].map((_, i) =>
    Math.max(...rows.map((r) => visibleLength(r[i] ?? ""))),
  )
  return rows.map((row, index) => {
    const line = row.map((cell, i) => pad(cell, widths[i])).join("  ")
    return `  ${index === 0 ? muted(line.trimEnd()) : line.trimEnd()}`
  })
}

export const renderOverview = (
  records: ServiceRecord[],
  options: RenderOptions,
): string => {
  const s = styler(options)
  const rows = [["Status", "Service", "Declared"]].concat(
    worstFirst(records).map((r) => {
      const status = s.tone(
        statusLabel(r.indicator).text,
        statusLabel(r.indicator).tone,
      )
      const name = s.link(r.name, r.url)
      const declared = declaredText(r)
      const loud = r.indicator !== "none" && r.indicator !== "link"
      return [
        status,
        loud ? s.bold(name) : name,
        loud ? s.bold(declared) : s.muted(declared),
      ]
    }),
  )
  return [
    "",
    ...table(rows, s.muted),
    "",
    s.muted(
      "  Declared status only: green is not proof your calls work. incidents list <service> for detail.",
    ),
    ...(options.note ? [s.muted(`  ${options.note}`)] : []),
    "",
  ].join("\n")
}

const OPERATIONAL = "operational"

export const renderDetail = (
  record: ServiceRecord,
  options: RenderOptions,
): string => {
  const s = styler(options)
  const now = options.now ?? Date.now()
  const status = statusLabel(record.indicator)
  const broken = record.components.filter((c) => c.status !== OPERATIONAL)
  const healthy = record.components.length - broken.length
  const happening = [
    ...broken.map((c) => {
      const w = wordLabel(c.status)
      return [s.tone(w.text, w.tone), c.name, "now"]
    }),
    ...record.active.map((i) => {
      const w = wordLabel(i.impact)
      const since = ageOf(i.date, now)
      return [
        s.tone(w.text, w.tone),
        s.link(i.title, i.link),
        since ? `since ${since}` : "",
      ]
    }),
  ]
  const current = new Set(
    record.active.flatMap((i) => [i.link, i.title]).filter(Boolean),
  )
  const upcoming = record.upcoming?.length ?? 0
  const earlier = record.recent
    .filter((i) => !current.has(i.link) && !current.has(i.title))
    .slice(0, 7)
  return [
    "",
    `  ${s.tone(status.text, status.tone)}  ${record.description}  ${s.muted(record.url.replace(/^https:\/\//, ""))}`,
    "",
    ...(happening.length
      ? [...table([["Status", "What", "When"], ...happening], s.muted), ""]
      : []),
    ...(broken.length === 0 && healthy > 0
      ? [s.muted(`  ${healthy} components operational`), ""]
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
