import { tailHints, type Hint } from "@kud/ink-ui"
import { visibleLength } from "../render.js"

const GAP = 2

const widthOf = (hints: Hint[]): number =>
  hints.reduce(
    (sum, [key, label]) => sum + visibleLength(`${key} ${label}`),
    0,
  ) +
  GAP * Math.max(0, hints.length - 1)

// The hints that fit on one row of `room` cells, the page's tail included, so
// the row never wraps a lone `q quit` onto a line of its own. The keys in
// `drop` go first, in that order; past them, the last of the host's own hints.
// The tail always stays.
export const fitHints = (
  hints: Hint[],
  room: number,
  drop: string[],
  page: "root" | "nested" = "root",
  help = false,
): Hint[] => {
  const tail = tailHints(page, help)
  let kept = hints
  const order = [...drop]
  while (kept.length && widthOf([...kept, ...tail]) > room) {
    const next = order.shift()
    kept = next
      ? kept.filter(([key]) => key !== next)
      : kept.slice(0, kept.length - 1)
  }
  return kept
}
