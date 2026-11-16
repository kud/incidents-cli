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
  link: { text: "↗ manual", tone: "muted" },
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

// A status word with its glyph, as every status reads on screen, so none
// rests on colour alone: ◌ for planned work, ● for the rest.
export const withGlyph = (label: Label): Label =>
  /^[●◌?↗] /.test(label.text)
    ? label
    : {
        ...label,
        text: `${label.text === "maintenance" ? "◌" : "●"} ${label.text}`,
      }

export const wordLabel = (status: string | undefined): Label =>
  WORDS[status ?? ""] ?? { text: "active", tone: "warning" }

// What every status here is: the vendor's own word, not a measurement.
export const DISCLAIMER =
  "Declared status only: green is not proof your calls work."
