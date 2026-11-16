import { colors } from "@kud/ink-ui"
import { isClear, type ServiceRecord } from "../core/index.js"
import type { Sort } from "../sort.js"
import type { Segment } from "./frame.js"

export const clock = (at: Date): string =>
  at.toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit" })

// Where the data stands: the time it was read, or what is reading it now.
// It is the first piece a short header gives up after the sort.
export const statusSegment = ({
  loading,
  at,
  busy = "↻ checking…",
}: {
  loading: boolean
  at: Date | null
  busy?: string
}): Segment =>
  loading && at
    ? { text: "↻ refreshing…", color: colors.muted, drop: 1 }
    : loading
      ? { text: busy, color: colors.info, drop: 1 }
      : { text: `updated ${at ? clock(at) : ""}`, color: colors.muted, drop: 1 }

// The overview's header after the product name, answer first: how many are
// in trouble, how many could not be read, then the count, the sort and the
// time. An unreadable page is its own number, never folded into trouble.
export const overviewSegments = ({
  records,
  total,
  sort,
  loading,
  at,
}: {
  records: ServiceRecord[]
  total: number
  sort: Sort
  loading: boolean
  at: Date | null
}): Segment[] => {
  const unreadable = records.filter((r) => r.indicator === "unknown").length
  const trouble = records.filter(
    (r) => !isClear(r.indicator) && r.indicator !== "unknown",
  )
  const critical = trouble.some((r) =>
    ["major", "critical"].includes(r.indicator),
  )
  const settled = !loading || at !== null
  return [
    ...(trouble.length
      ? [
          {
            text: `${trouble.length} in trouble`,
            color: critical ? colors.error : colors.warning,
            bold: true,
          },
        ]
      : settled && !unreadable && records.length
        ? [{ text: "all clear", color: colors.success, bold: true }]
        : []),
    ...(unreadable
      ? [{ text: `${unreadable} unreadable`, color: colors.warning }]
      : []),
    {
      text: `${total} service${total === 1 ? "" : "s"}`,
      color: colors.muted,
    },
    {
      text: sort === "status" ? "by status ↓" : "by name",
      color: colors.muted,
      drop: 2,
    },
    statusSegment({ loading, at }),
  ]
}
