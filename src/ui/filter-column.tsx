import { Box, Text } from "ink"
import { colors } from "@kud/ink-ui"
import {
  BAR_MAX,
  FILTER_FULL,
  barCells,
  type FilterId,
} from "./overview-model.js"
import { BAND, INK, SOFT, pad } from "./overview-parts.js"

// The filters stacked beside the body. Each row carries a bar sized to its
// count, so the column is the tally as well as the filter: one place answers
// both "how bad is it" and "show me only that".
// The column's own gutter: a space, the marker, a space, so the marker sits
// under the first letter of the pane title.
const GUTTER = 3
const GLYPH_W = 2
const COUNT_W = 3
const NAME_W = FILTER_FULL - GUTTER - GLYPH_W - COUNT_W - 1 - BAR_MAX

export type FilterItem = {
  id: FilterId
  name: string
  count: number
  glyph: string
  color: string
}

// A pane's title: a bar and the label in the accent while the pane holds
// focus, grey without the bar when it does not.
export const PaneTitle = ({
  label,
  count,
  focused,
  width,
}: {
  label: string
  count?: number
  focused: boolean
  width?: number
}) => (
  <Box width={width} flexShrink={0}>
    <Text
      color={focused ? colors.info : colors.muted}
      bold={focused}
      wrap="truncate-end"
    >
      {focused ? "▍" : " "}
      {label}
      {count ? (
        <Text color={colors.muted} bold={false}>{`  ${count}`}</Text>
      ) : null}
    </Text>
  </Box>
)

// The one-cell rule between the filter column and the body.
export const Rule = () => (
  <Box
    width={1}
    flexShrink={0}
    borderStyle="single"
    borderTop={false}
    borderBottom={false}
    borderRight={false}
    borderColor={colors.track}
  />
)

// Groups read as runs: the two broad filters, each status, then the manual
// pages that never answer on their own.
const breakBefore = (i: number, n: number) => i === 2 || i === n - 1

export const FilterList = ({
  items,
  active,
  focused,
  total,
  full,
  settled,
}: {
  items: FilterItem[]
  active: FilterId
  focused: boolean
  total: number
  full: boolean
  settled: boolean
}) => (
  <Box flexDirection="column" flexShrink={0}>
    {items.map((item, i) => {
      const on = item.id === active
      // Until every service has answered, only "All" knows its count; the
      // rest hold a quiet dot in the count's own cell, so nothing shifts.
      const known = settled || item.id === "all"
      const empty = known && item.count === 0
      const tone = on ? INK : empty ? colors.muted : SOFT
      const bar = known ? barCells(item.count, total, item.id) : 0
      return (
        <Box key={item.id} flexDirection="column" flexShrink={0}>
          {breakBefore(i, items.length) ? <Text> </Text> : null}
          <Box backgroundColor={on && focused ? BAND : undefined}>
            <Text color={focused ? colors.info : colors.muted}>
              {on ? " ❯ " : "   "}
            </Text>
            <Text color={empty ? colors.muted : item.color}>
              {pad(item.glyph, GLYPH_W)}
            </Text>
            {full ? (
              <Text color={tone} bold={on}>
                {pad(item.name, NAME_W)}
              </Text>
            ) : null}
            <Text color={known ? tone : colors.muted} bold={on && known}>
              {(known ? String(item.count) : "·").padStart(COUNT_W)}
            </Text>
            {full ? (
              <Text color={item.color}>{" " + "▪".repeat(bar)}</Text>
            ) : null}
          </Box>
        </Box>
      )
    })}
  </Box>
)
