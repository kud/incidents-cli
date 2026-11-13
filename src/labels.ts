import type { Indicator } from "./core/index.js"

export type Tone = "error" | "warning" | "info" | "success" | "muted"

export interface Label {
  text: string
  tone: Tone
}

const STATUS: Record<Indicator, Label> = {
  critical: { text: "● critical", tone: "error" },
  major: { text: "● major", tone: "error" },
  minor: { text: "● minor", tone: "warning" },
  maintenance: { text: "◌ maintenance", tone: "info" },
  unknown: { text: "? unreadable", tone: "warning" },
  none: { text: "● ok", tone: "success" },
  link: { text: "→ manual", tone: "muted" },
}

export const statusLabel = (indicator: string): Label =>
  STATUS[indicator as Indicator] ?? STATUS.link

const WORDS: Record<string, Label> = {
  major_outage: { text: "outage", tone: "error" },
  partial_outage: { text: "partial", tone: "error" },
  under_maintenance: { text: "maintenance", tone: "info" },
  critical: { text: "critical", tone: "error" },
  major: { text: "major", tone: "error" },
  minor: { text: "minor", tone: "warning" },
  degraded_performance: { text: "degraded", tone: "warning" },
}

export const wordLabel = (status: string | undefined): Label =>
  WORDS[status ?? ""] ?? { text: "active", tone: "warning" }

export const declaredText = (record: {
  indicator: string
  kind: string
  description: string
}): string => {
  if (record.indicator === "link") return "no feed, open the page"
  if (record.indicator !== "none") return record.description
  if (record.kind === "rss")
    return `quiet · ${record.description.charAt(0).toLowerCase()}${record.description.slice(1)}`
  return "operational"
}
