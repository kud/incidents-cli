import { visibleLength } from "../render.js"
import type { Hint } from "./frame.js"

const GAP = 2

export const hintsWidth = (hints: Hint[]): number =>
  hints.reduce(
    (sum, [key, label]) => sum + visibleLength(`${key} ${label}`),
    0,
  ) +
  GAP * Math.max(0, hints.length - 1)

// The hints that fit on one row of `room` cells, so the row never wraps a
// lone `q quit` onto a line of its own. The keys in `drop` go first, in that
// order; past them, the last but one. The last hint, quit, always stays.
export const fitHints = (
  hints: Hint[],
  room: number,
  drop: string[],
): Hint[] => {
  const tail = hints.slice(-1)
  let kept = hints.slice(0, -1)
  const order = [...drop]
  while (kept.length && hintsWidth([...kept, ...tail]) > room) {
    const next = order.shift()
    kept = next
      ? kept.filter(([key]) => key !== next)
      : kept.slice(0, kept.length - 1)
  }
  return [...kept, ...tail]
}
