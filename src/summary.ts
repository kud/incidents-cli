import { ageOf, type ServiceRecord } from "./core/index.js"

// What one service says in a row, shared by the TUI and the plain output so
// the two read alike: when its trouble started, for how long, and the line
// that names it.
const startOf = (r: ServiceRecord): string | undefined =>
  r.active[0]?.date ??
  (r.kind === "rss" && r.indicator !== "none" ? r.recent[0]?.date : undefined)

export const startedAt = (r?: ServiceRecord): string | undefined =>
  r ? startOf(r) : undefined

// How long the trouble has run, bare: "1h 12m". Every row and card says a
// duration the same way; only the detail's "started" line adds the clock.
export const ageText = (r?: ServiceRecord): string => {
  const start = startedAt(r)
  return start ? ageOf(start) : ""
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
