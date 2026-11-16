import type { Motion } from "./overview-board.js"
import { TILE_LINES } from "./overview-board.js"
import type { Row } from "./overview-model.js"
import { moving } from "./overview-parts.js"

// Motion here is a transition between two states, never a show: a frame
// every FRAME_MS, none longer than about 300ms in all, and a key press ends
// it at once on the final state.
export const FRAME_MS = 50

// Off wherever motion could not be seen or is not wanted: no terminal, a
// dumb one, colour switched off, CI, or motion turned down.
export const canAnimate = (): boolean =>
  moving() &&
  !process.env.NO_COLOR &&
  process.env.TERM !== "dumb" &&
  !process.env.CI

// The rows a card passes through as it collapses to its line, by step:
// whole, then 5, 3 and the line itself. Three frames, 150ms.
export const COLLAPSE = [TILE_LINES, 5, 3, 1]
export const COLLAPSE_STEPS = COLLAPSE.length - 1

export const collapseHeights = (
  steps: Record<string, number>,
): Record<string, number> =>
  Object.fromEntries(
    Object.entries(steps).map(([id, step]) => [
      id,
      COLLAPSE[Math.min(step, COLLAPSE_STEPS)],
    ]),
  )

// One frame of a transition: the rows the board draws (the old set while
// leaving cards collapse, the new one while arriving cards open) and how.
export type Frame = { rows: Row[]; motion: Motion }

const ids = (rows: Row[]) => new Set(rows.map((r) => r.service.id))
const heights = (rows: Row[], h: number) =>
  Object.fromEntries(rows.map((r) => [r.service.id, h]))

const flags = (rows: Row[]) =>
  Object.fromEntries(rows.map((r) => [r.service.id, true]))

// A filter change on the board. What leaves dims, its cards closing to their
// line; then what arrives comes in dim, its cards opening from a line, and
// brightens on the final state. Lines fade too, so nothing jumps. Six frames,
// 300ms. Empty when nothing leaves or arrives.
export const filterFrames = (
  before: Row[],
  after: Row[],
  isCard: (r: Row) => boolean,
): Frame[] => {
  const was = ids(before)
  const now = ids(after)
  const leaving = before.filter((r) => !now.has(r.service.id))
  const arriving = after.filter((r) => !was.has(r.service.id))
  const out = flags(leaving)
  const into = flags(arriving)
  const closing = leaving.filter(isCard)
  const opening = arriving.filter(isCard)
  return [
    ...(leaving.length
      ? [5, 3, 1].map((h) => ({
          rows: before,
          motion: { heights: heights(closing, h), faded: out },
        }))
      : []),
    ...(arriving.length
      ? [1, 3, TILE_LINES].map((h) => ({
          rows: after,
          motion: { heights: heights(opening, h), faded: into },
        }))
      : []),
  ]
}

// `z` on the board: the strip of `lines` lines folds to half, then one, and
// the fold line lands; showing it again runs the same steps back.
export const stripFrames = (
  rows: Row[],
  lines: number,
  hiding: boolean,
): Frame[] => {
  if (lines <= 1) return []
  const steps = [Math.ceil(lines / 2), 1]
  return (hiding ? steps : [...steps].reverse()).map((stripLines) => ({
    rows,
    motion: { stripLines },
  }))
}
