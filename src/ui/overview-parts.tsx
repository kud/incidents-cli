import {
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type RefObject,
} from "react"
import { Box, Text, measureElement, type DOMElement } from "ink"
import { Spinner, colors } from "@kud/ink-ui"
import type { Tone } from "../labels.js"
import type { Sort } from "../sort.js"
import { visibleLength } from "../render.js"
import {
  glyphOf,
  hiddenLine,
  labelOf,
  type HiddenPart,
  type Row,
} from "./overview-model.js"

export const TONE: Record<Tone, string> = {
  error: colors.error,
  warning: colors.warning,
  info: colors.info,
  success: colors.success,
  muted: colors.muted,
}

// Normal text takes the terminal's own foreground, so it reads on a light
// theme as well as a dark one: a fixed near-white vanished on a light ground.
// The cost is a theme with a custom "bold colour", whose bold names take it.
export const INK: string | undefined = undefined
export const SOFT = colors.secondary
export const BAND = colors.selection
export const FRAME_SIDES = 4
export const GAP = 2
// The selection gutter: the marker, then a space. It is as wide as a card's
// border and padding, so a name in the grid or the list starts in the column
// where card titles start, and every note in the body (the scroll hint, the
// hidden count, an empty filter, the footer) starts there too.
export const MARK = 2

export const pad = (text: string, width: number): string => {
  if (width <= 0) return ""
  const chars = [...text]
  if (chars.length <= width) return text + " ".repeat(width - chars.length)
  return `${chars.slice(0, Math.max(0, width - 1)).join("")}…`
}

export const widest = (cells: string[]): number =>
  Math.max(0, ...cells.map(visibleLength))

// The rows the body actually gets from its flex parent, measured after layout
// rather than derived from a chrome constant, so a wrapped hint line or a
// resized terminal never pushes the list past the frame.
export const useMeasuredHeight = (): [RefObject<DOMElement | null>, number] => {
  const ref = useRef<DOMElement | null>(null)
  const [height, setHeight] = useState(0)
  useLayoutEffect(() => {
    if (!ref.current) return
    const measured = measureElement(ref.current).height
    if (measured !== height) setHeight(measured)
  })
  return [ref, height]
}

export const Marker = ({
  active,
  focused = true,
}: {
  active: boolean
  focused?: boolean
}) => (
  <Text color={focused ? colors.accent : colors.muted}>
    {active ? "❯ " : "  "}
  </Text>
)

// The status cell: glyph and word in the tone's colour, or the spinner while
// the service has not answered.
export const StatusCell = ({ row, width }: { row: Row; width: number }) => {
  const label = labelOf(row)
  return (
    <Box width={width} flexShrink={0}>
      {row.record ? (
        <Text color={TONE[label.tone]}>{glyphOf(label)}</Text>
      ) : (
        <Spinner />
      )}
    </Box>
  )
}

// A placeholder for a row that has not answered: a half-height bar, so a
// column of them reads as lines of text rather than one solid slab. Each row
// lags the one above it, so the shimmer runs down the list.
const ROW_LAG = 2
const FRAME_MS = 70
const CREST = 3
const LEAD = CREST + 3
const REST = 10
// Bars vary in length the way titles do, never past the title column.
const SPREAD = [0.62, 0.44, 0.78, 0.52, 0.7, 0.4]

const moving = () =>
  process.stdout?.isTTY === true &&
  !process.env["NO_MOTION"] &&
  !process.env["REDUCE_MOTION"]

const shade = (cell: number, frame: number, cells: number, lag: number) => {
  const travel = cells + LEAD * 2
  const phase =
    (((frame - lag) % (travel + REST)) + travel + REST) % (travel + REST)
  if (phase >= travel) return colors.track
  return Math.abs(cell - (phase - LEAD)) <= CREST
    ? colors.trackHighlight
    : colors.track
}

export const pendingWidth = (titleW: number, row: number): number =>
  Math.max(1, Math.round(titleW * SPREAD[row % SPREAD.length]))

export const Pending = ({
  width,
  row = 0,
}: {
  width: number
  row?: number
}) => {
  const [frame, setFrame] = useState(0)
  const live = moving()
  useEffect(() => {
    if (!live) return
    const timer = setInterval(() => setFrame((f) => f + 1), FRAME_MS)
    return () => clearInterval(timer)
  }, [live])
  if (width <= 0) return null
  const cells = Math.floor(width)
  return (
    <Text>
      {Array.from({ length: cells }, (_, i) => (
        <Text
          key={i}
          color={live ? shade(i, frame, cells, row * ROW_LAG) : colors.track}
        >
          ▀
        </Text>
      ))}
    </Text>
  )
}

export const HiddenNote = ({ parts }: { parts: HiddenPart[] }) =>
  parts.length ? (
    <Box paddingLeft={MARK}>
      <Text color={colors.muted} wrap="truncate-end">
        {hiddenLine(parts)}
      </Text>
    </Box>
  ) : null

export const Empty = ({ text }: { text: string }) => (
  <Box paddingLeft={MARK} flexShrink={0}>
    <Text color={colors.muted} wrap="truncate-end">
      {text}
    </Text>
  </Box>
)

export const Footer = ({ note }: { note: string | null }) => (
  <Box flexDirection="column" marginTop={1} flexShrink={0} paddingLeft={MARK}>
    <Text color={colors.muted}>
      Declared status only: green is not proof your calls work.
    </Text>
    {note ? <Text color={colors.muted}>{note}</Text> : null}
  </Box>
)

export type OverviewProps = {
  rows: Row[]
  // Every service, whatever the tab, search or fold left out.
  all: Row[]
  cursor: number
  sorted: boolean
  sort: Sort
  hidden: HiddenPart[]
  note: string | null
  // The pane's own width beside the filter column, whether it holds focus,
  // and the line an empty filter shows in place of the rows.
  width: number
  focused: boolean
  empty: string
}
