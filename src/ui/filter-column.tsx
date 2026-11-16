import { Box, Text } from "ink"
import type { ReactNode } from "react"
import { colors } from "@kud/ink-ui"
import { FILTER_FULL, type FilterId } from "./overview-model.js"
import { BAND, INK, pad } from "./overview-parts.js"

// The filters stacked beside the body. Each row carries its count, so the
// column is the tally as well as the filter: one place answers both "how bad
// is it" and "show me only that".
// The column's own gutter: a space, the marker, a space, so the marker sits
// under the first letter of the pane title.
const GUTTER = 3
const GLYPH_W = 2
const COUNT_W = 3
const NAME_W = FILTER_FULL - GUTTER - GLYPH_W - COUNT_W - 1

export type FilterItem = {
  id: FilterId
  name: string
  count: number
  glyph: string
  color: string
}

// A pane's title over the row it leaves blank. With focus the label is bold
// in the terminal's own bright text, underlined by a run of `▔` in the
// accent; without, it is muted and the underline row stays blank. A filled
// background means one thing on these screens, the selected row, so focus
// never borrows it. The label starts at `indent`, the pane's text column,
// and never moves when focus changes. `extra` rides after the label on the
// same row: a count, or the search.
export const PaneTitle = ({
  label,
  count,
  focused,
  width,
  indent = 1,
  extra,
}: {
  label: string
  count?: number
  focused: boolean
  width?: number
  indent?: number
  extra?: ReactNode
}) => (
  <Box flexDirection="column" width={width} flexShrink={0}>
    <Box flexShrink={0}>
      <Text wrap="truncate-end">
        {" ".repeat(indent)}
        <Text color={focused ? INK : colors.muted} bold={focused}>
          {label}
        </Text>
        {count ? (
          <Text color={focused ? INK : colors.muted}>{`  ${count}`}</Text>
        ) : null}
      </Text>
      {extra}
    </Box>
    <Text wrap="truncate-end">
      {" ".repeat(indent)}
      <Text color={colors.accent}>
        {focused ? "▔".repeat([...label].length) : " "}
      </Text>
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
  full,
  settled,
}: {
  items: FilterItem[]
  active: FilterId
  focused: boolean
  full: boolean
  settled: boolean
}) => (
  <Box flexDirection="column" flexShrink={0}>
    {items.map((item, i) => {
      const on = item.id === active
      // Until every service has answered, only "all" knows its count; the
      // rest hold a quiet dot in the count's own cell, so nothing shifts.
      const known = settled || item.id === "all"
      // An empty filter dims its count, never its glyph: the colour says what
      // the filter holds, whether or not anything is in it right now.
      const empty = known && item.count === 0
      const tone = INK
      return (
        <Box key={item.id} flexDirection="column" flexShrink={0}>
          {breakBefore(i, items.length) ? <Text> </Text> : null}
          <Box backgroundColor={on && focused ? BAND : undefined}>
            <Text color={focused ? colors.accent : colors.muted}>
              {on ? " ❯ " : "   "}
            </Text>
            <Text color={item.color}>{pad(item.glyph, GLYPH_W)}</Text>
            {full ? (
              <Text color={tone} bold={on}>
                {pad(item.name, NAME_W)}
              </Text>
            ) : null}
            <Text
              color={known && !empty ? tone : colors.muted}
              bold={on && known}
            >
              {(known ? String(item.count) : "·").padStart(COUNT_W)}
            </Text>
          </Box>
        </Box>
      )
    })}
  </Box>
)
