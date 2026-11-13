import { useLayoutEffect, useRef, useState, type RefObject } from "react"
import { Box, Text, measureElement, type DOMElement } from "ink"
import { SkeletonBar, Spinner, colors } from "@kud/ink-ui"
import type { Tone } from "../labels.js"
import { visibleLength } from "../render.js"
import {
  glyphOf,
  hiddenLine,
  labelOf,
  wordOf,
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

// Every bold text names its foreground. Plain bold falls back to the
// terminal's "bold colour", which in some themes is the warning orange, and a
// screen of service names then reads as a wall of alarms.
export const INK = "#E6E6EB"
export const SOFT = colors.secondary
export const BAND = colors.selection
export const FRAME_SIDES = 4
export const GAP = 2
// The selection gutter: a space, the marker, a space.
export const MARK = 3

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

export const Marker = ({ active }: { active: boolean }) => (
  <Text color={colors.info}>{active ? " ❯ " : "   "}</Text>
)

// The status cell: glyph and word in the tone's colour, or the spinner while
// the service has not answered.
export const StatusCell = ({ row, width }: { row: Row; width: number }) => {
  const label = labelOf(row)
  return (
    <Box width={width} flexShrink={0}>
      {row.record ? (
        <Text color={TONE[label.tone]}>
          {glyphOf(label)} {wordOf(label)}
        </Text>
      ) : (
        <Spinner label="checking" />
      )}
    </Box>
  )
}

export const Pending = ({ width }: { width: number }) =>
  width > 0 ? <SkeletonBar width={width} /> : null

export const HiddenNote = ({ parts }: { parts: HiddenPart[] }) =>
  parts.length ? (
    <Box paddingLeft={MARK}>
      <Text color={colors.muted} wrap="truncate-end">
        {hiddenLine(parts)}
      </Text>
    </Box>
  ) : null

export const Empty = () => (
  <Box paddingLeft={MARK}>
    <Text color={SOFT}>Nothing to show here.</Text>
  </Box>
)

export const Footer = ({ note }: { note: string | null }) => (
  <Box flexDirection="column" marginTop={1} paddingLeft={MARK}>
    <Text color={colors.muted}>
      Declared status only: green is not proof your calls work.
    </Text>
    {note ? <Text color={colors.muted}>{note}</Text> : null}
  </Box>
)

export type OverviewProps = {
  rows: Row[]
  cursor: number
  sorted: boolean
  hidden: HiddenPart[]
  note: string | null
}
