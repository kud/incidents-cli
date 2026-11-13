import { fuzzyFilter } from "@kud/ink-ui"
import {
  ageOf,
  type Indicator,
  type Service,
  type ServiceRecord,
} from "../core/index.js"
import { statusLabel, type Label } from "../labels.js"

export type Row = { service: Service; record?: ServiceRecord }

import type { Sort } from "../sort.js"
import type { View } from "../view.js"

export type FilterId =
  | "all"
  | "trouble"
  | "major"
  | "minor"
  | "unknown"
  | "maintenance"
  | "none"
  | "link"

const TROUBLE: readonly Indicator[] = ["critical", "major", "unknown", "minor"]

// Each tab's name and the indicators it holds. `major` takes `critical` too:
// both draw red, and a tab of one rarely-seen word would sit empty forever.
export const FILTERS: {
  id: FilterId
  name: string
  holds: readonly Indicator[] | null
}[] = [
  { id: "all", name: "All", holds: null },
  { id: "trouble", name: "Trouble", holds: TROUBLE },
  { id: "major", name: "major", holds: ["critical", "major"] },
  { id: "minor", name: "minor", holds: ["minor"] },
  { id: "unknown", name: "unreadable", holds: ["unknown"] },
  { id: "maintenance", name: "maintenance", holds: ["maintenance"] },
  { id: "none", name: "ok", holds: ["none"] },
  { id: "link", name: "manual", holds: ["link"] },
]

export const CHECKING: Label = { text: "◌ checking", tone: "muted" }

export const labelOf = (row: Row): Label =>
  row.record ? statusLabel(row.record.indicator) : CHECKING
export const glyphOf = (label: Label): string => label.text.split(" ")[0]
export const wordOf = (label: Label): string =>
  label.text.split(" ").slice(1).join(" ")

export const isTrouble = (row: Row): boolean =>
  row.record !== undefined &&
  TROUBLE.includes(row.record.indicator as Indicator)

// The board gives a card to anything worth reading in full: trouble, and a
// maintenance window, which has a title and an end even though it is clear.
export const isCard = (row: Row): boolean =>
  isTrouble(row) || row.record?.indicator === "maintenance"

export const isHealthy = (row: Row): boolean => row.record?.indicator === "none"

const holds = (filter: FilterId, row: Row): boolean => {
  const spec = FILTERS.find((f) => f.id === filter)
  if (!spec?.holds) return true
  return (
    row.record !== undefined &&
    spec.holds.includes(row.record.indicator as Indicator)
  )
}

export const searchRows = (rows: Row[], term: string | null): Row[] => {
  if (!term?.trim()) return rows
  const byId = new Map(rows.map((r) => [r.service.id, r]))
  return fuzzyFilter(
    rows.map((r) => ({
      id: r.service.id,
      title: [r.service.name, ...r.service.aliases].join(" "),
    })),
    term,
  ).flatMap((item) => byId.get(item.id) ?? [])
}

export const filterCounts = (rows: Row[]): Record<FilterId, number> =>
  Object.fromEntries(
    FILTERS.map((f) => [f.id, rows.filter((r) => holds(f.id, r)).length]),
  ) as Record<FilterId, number>

export type Narrowed = {
  rows: Row[]
  counts: Record<FilterId, number>
  hidden: { search: number; tab: number; folded: number }
}

// Search, then the tab, then the fold, so every tab's count answers "what
// would I see there with this search", and each step owns the rows it took.
export const narrow = (
  rows: Row[],
  {
    filter,
    folded,
    term,
  }: { filter: FilterId; folded: boolean; term: string | null },
): Narrowed => {
  const searched = searchRows(rows, term)
  const tabbed = searched.filter((r) => holds(filter, r))
  const shown = folded ? tabbed.filter((r) => !isHealthy(r)) : tabbed
  return {
    rows: shown,
    counts: filterCounts(searched),
    hidden: {
      search: rows.length - searched.length,
      tab: searched.length - tabbed.length,
      folded: tabbed.length - shown.length,
    },
  }
}

export type HiddenPart = { text: string; key: string; action: string }

// What the filters left out, each with the key that brings it back. Empty
// when nothing is hidden: a filter that took nothing has nothing to confess.
export const hiddenParts = (
  hidden: Narrowed["hidden"],
  { filter, term }: { filter: FilterId; term: string | null },
): HiddenPart[] => {
  const name = FILTERS.find((f) => f.id === filter)?.name ?? filter
  return [
    hidden.folded
      ? {
          text: `${hidden.folded} operational hidden`,
          key: "z",
          action: "show",
        }
      : null,
    hidden.tab
      ? { text: `${hidden.tab} outside ${name}`, key: "←→", action: "tabs" }
      : null,
    hidden.search
      ? {
          text: `${hidden.search} not matching “${term ?? ""}”`,
          key: "esc",
          action: "clear",
        }
      : null,
  ].filter((p): p is HiddenPart => p !== null)
}

export const hiddenLine = (parts: HiddenPart[]): string =>
  parts.map((p) => `${p.text} · ${p.key} ${p.action}`).join("   ")

// The order the cursor walks: the board draws its cards before the grid, so
// ↓ has to follow the eye there rather than the list's order.
export const navOrder = (view: View, rows: Row[]): Row[] =>
  view === "board"
    ? [...rows.filter(isCard), ...rows.filter((r) => !isCard(r))]
    : rows

const startOf = (r: ServiceRecord): string | undefined =>
  r.active[0]?.date ??
  (r.kind === "rss" && r.indicator !== "none" ? r.recent[0]?.date : undefined)

export const startedAt = (r?: ServiceRecord): string | undefined =>
  r ? startOf(r) : undefined

export const ageText = (r?: ServiceRecord): string => {
  const start = startedAt(r)
  const age = start ? ageOf(start) : ""
  return age ? `for ${age}` : ""
}

export const headline = (r?: ServiceRecord): string => {
  if (!r) return ""
  if (r.indicator === "link") return "no feed, open the page"
  if (r.active[0]) return r.active[0].title
  if (r.indicator === "none")
    return r.kind === "rss"
      ? `quiet · ${r.description.charAt(0).toLowerCase()}${r.description.slice(1)}`
      : ""
  return r.description.replace(/^Posted [^:]+: /, "")
}

export const affected = (r?: ServiceRecord): string[] =>
  (r?.components ?? [])
    .filter((c) => c.status !== "operational")
    .map((c) => c.name)

// A blank line goes where the severity changes, but only once the rows hold
// their sorted order: while they still sit in config order every row would
// be its own run. By name there are no runs to mark.
export const runBreaks = (
  rows: Row[],
  sorted: boolean,
  sort: Sort = "status",
): Set<number> => {
  const breaks = new Set<number>()
  if (!sorted || sort !== "status") return breaks
  rows.forEach((r, i) => {
    if (i && r.record?.indicator !== rows[i - 1].record?.indicator)
      breaks.add(i)
  })
  return breaks
}
