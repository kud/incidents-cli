import type { ReactNode } from "react"
import { Box, Text } from "ink"
import { colors } from "@kud/ink-ui"
import { visibleLength } from "../render.js"

// One piece of the header after the product name. `drop` ranks the pieces a
// short terminal gives up, highest first; a piece without one always stays.
export type Segment = {
  text: string
  color?: string
  bold?: boolean
  dim?: boolean
  drop?: number
}

export type Hint = [key: string, label: string]

const SEP = " · "
const RULE_GAP = 2
const RULE_MIN = 4
// The frame's borders and the header's one-cell inset either side.
export const FRAME_INSET = 4
// The rows the frame itself takes: its two borders, the header, the blank
// under it and the keys.
export const FRAME_ROWS = 5
// Where every pane's text starts, counted from inside the frame's left
// border: the footer keys start there too.
export const TEXT_COLUMN = 3

const CRUMB = " › "

const lengthOf = (brand: string, segments: Segment[]): number =>
  visibleLength(brand) +
  segments.reduce((sum, s) => sum + SEP.length + visibleLength(s.text), 0)

// The header that fits `room` cells: the dashed rule goes first, then the
// pieces by their `drop` rank. The product name is never cut; whatever still
// overflows is cut at the end of the line.
export const fitHeader = (
  brand: string,
  segments: Segment[],
  room: number,
): { segments: Segment[]; rule: number } => {
  let kept = segments
  const used = () => lengthOf(brand, kept)
  if (used() + RULE_GAP + RULE_MIN <= room)
    return { segments: kept, rule: room - used() - RULE_GAP }
  const ranks = [...new Set(segments.flatMap((s) => s.drop ?? []))].sort(
    (a, b) => b - a,
  )
  for (const rank of ranks) {
    if (used() <= room) break
    kept = kept.filter((s) => s.drop !== rank)
  }
  return { segments: kept, rule: 0 }
}

// The product name, and on a nested page the breadcrumb to it: the name is
// the brand colour, the place in plain bold, so orange never means anything
// but the product.
export const Header = ({
  brand,
  crumb,
  segments,
  width,
}: {
  brand: string
  crumb?: string
  segments: Segment[]
  width: number
}) => {
  const lead = crumb ? `${brand}${CRUMB}${crumb}` : brand
  const room = Math.max(visibleLength(lead), width - FRAME_INSET)
  const fit = fitHeader(lead, segments, room)
  return (
    <Box paddingLeft={1} paddingRight={1} flexShrink={0}>
      <Box flexShrink={0}>
        <Text color={colors.accent} bold>
          {brand}
        </Text>
        {crumb ? (
          <Text>
            <Text color={colors.muted}>{CRUMB}</Text>
            <Text bold>{crumb}</Text>
          </Text>
        ) : null}
      </Box>
      <Text wrap="truncate-end">
        {fit.segments.map((s, i) => (
          <Text key={i}>
            <Text color={colors.muted}>{SEP}</Text>
            <Text color={s.color} bold={s.bold} dimColor={s.dim}>
              {s.text}
            </Text>
          </Text>
        ))}
        {fit.rule ? (
          <Text color={colors.info} dimColor>
            {" ".repeat(RULE_GAP)}
            {"╌".repeat(fit.rule)}
          </Text>
        ) : null}
      </Text>
    </Box>
  )
}

export const Hints = ({ hints }: { hints: Hint[] }) => (
  <Box columnGap={2} flexShrink={0}>
    {hints.map(([key, label]) => (
      <Box key={key} flexShrink={0}>
        <Text>{key}</Text>
        <Text dimColor>{` ${label}`}</Text>
      </Box>
    ))}
  </Box>
)

// The app's page: a rounded frame, the header, a blank row, the body and one
// row of keys, with an optional counter at that row's right end.
export const Frame = ({
  columns,
  rows,
  brand,
  crumb,
  segments,
  hints,
  counter,
  notice,
  children,
}: {
  columns: number
  rows: number
  brand: string
  crumb?: string
  segments: Segment[]
  hints: Hint[]
  counter?: string
  // A one-line notice that takes the counter's place for a moment, bright,
  // dimming as it goes.
  notice?: { text: string; fading: boolean }
  children: ReactNode
}) => (
  <Box
    flexDirection="column"
    width={columns}
    height={rows}
    borderStyle="round"
    borderColor={colors.muted}
    overflow="hidden"
  >
    <Header brand={brand} crumb={crumb} segments={segments} width={columns} />
    {/* The body is clipped to its rows: on a short window a pane is cut at
        the bottom, never drawn over the keys. */}
    <Box flexDirection="column" flexGrow={1} marginTop={1} overflow="hidden">
      {children}
    </Box>
    <Box paddingLeft={TEXT_COLUMN} paddingRight={1} flexShrink={0}>
      <Box flexGrow={1}>
        <Hints hints={hints} />
      </Box>
      {notice ? (
        <Box flexShrink={0} marginLeft={2}>
          <Text bold={!notice.fading} dimColor={notice.fading}>
            {notice.text}
          </Text>
        </Box>
      ) : counter ? (
        <Box flexShrink={0} marginLeft={2}>
          <Text dimColor>{counter}</Text>
        </Box>
      ) : null}
    </Box>
  </Box>
)
