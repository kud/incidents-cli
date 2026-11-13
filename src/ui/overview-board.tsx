import { Box, Text, useWindowSize } from "ink"
import { Spinner, colors } from "@kud/ink-ui"
import type { Label } from "../labels.js"
import {
  affected,
  ageText,
  glyphOf,
  headline,
  isCard,
  labelOf,
  wordOf,
  type Row,
} from "./overview-model.js"
import {
  BAND,
  Empty,
  FRAME_SIDES,
  Footer,
  GAP,
  HiddenNote,
  INK,
  MARK,
  Marker,
  SOFT,
  TONE,
  useMeasuredHeight,
  widest,
  type OverviewProps,
} from "./overview-parts.js"

const TILE = 46
// A card's height: its border, then name, status, title and components.
const TILE_LINES = 6

const Tally = ({ rows, width }: { rows: Row[]; width: number }) => {
  const counts = new Map<string, { label: Label; n: number; k: string }>()
  for (const r of rows) {
    const label = labelOf(r)
    const k = r.record?.indicator ?? "checking"
    counts.set(k, { label, n: (counts.get(k)?.n ?? 0) + 1, k })
  }
  const total = rows.length || 1
  let used = 0
  const parts = [...counts.values()].map((c, i, all) => {
    const cells =
      i === all.length - 1
        ? width - used
        : Math.max(1, Math.round((c.n / total) * width))
    used += cells
    return { ...c, cells }
  })
  return (
    <Box flexDirection="column" paddingLeft={1} flexShrink={0}>
      <Text wrap="truncate-end">
        {parts.map((p) => (
          <Text key={p.k} color={TONE[p.label.tone]}>
            {(p.k === "unknown" ? "▒" : p.k === "link" ? "░" : "█").repeat(
              Math.max(0, p.cells),
            )}
          </Text>
        ))}
      </Text>
      <Text>
        {parts.map((p, i) => (
          <Text key={p.k}>
            {i ? <Text color={colors.muted}>{"   "}</Text> : null}
            <Text color={TONE[p.label.tone]}>{glyphOf(p.label)} </Text>
            <Text color={INK} bold>
              {p.n}
            </Text>
            <Text color={SOFT}> {wordOf(p.label)}</Text>
          </Text>
        ))}
      </Text>
    </Box>
  )
}

const Tile = ({
  row,
  active,
  width,
}: {
  row: Row
  active: boolean
  width: number
}) => {
  const label = labelOf(row)
  const inner = width - 4
  return (
    <Box
      width={width}
      flexShrink={0}
      height={TILE_LINES}
      flexDirection="column"
      borderStyle="round"
      borderColor={active ? colors.info : colors.track}
      paddingX={1}
    >
      <Text color={INK} bold wrap="truncate-end">
        {active ? <Text color={colors.info}>❯ </Text> : null}
        {row.service.name}
      </Text>
      <Box justifyContent="space-between" width={inner}>
        <Text color={TONE[label.tone]}>{label.text}</Text>
        <Text color={SOFT}>{ageText(row.record)}</Text>
      </Box>
      <Text color={INK} wrap="truncate-end">
        {headline(row.record)}
      </Text>
      <Text color={colors.muted} wrap="truncate-end">
        {affected(row.record).join(", ") || " "}
      </Text>
    </Box>
  )
}

// Everything without a card, pending services included, as a grid of names
// that reads at a glance.
const ClearGrid = ({
  rows,
  offset,
  cursor,
  width,
}: {
  rows: Row[]
  offset: number
  cursor: number
  width: number
}) => {
  const cell =
    MARK +
    widest(
      rows.map((r) => {
        const extra = headline(r.record)
        return `${r.service.name}  ${glyphOf(labelOf(r))} ${r.record ? wordOf(labelOf(r)) : "checking"}${extra ? `  ${extra}` : ""}`
      }),
    ) +
    GAP
  const perLine = Math.max(1, Math.floor(width / cell))
  const lines: Row[][] = []
  for (let i = 0; i < rows.length; i += perLine)
    lines.push(rows.slice(i, i + perLine))
  return (
    <Box flexDirection="column">
      {lines.map((line, n) => (
        <Box key={n}>
          {line.map((r, j) => {
            const active = offset + n * perLine + j === cursor
            const label = labelOf(r)
            const extra = headline(r.record)
            return (
              <Box
                key={r.service.id}
                width={cell}
                flexShrink={0}
                backgroundColor={active ? BAND : undefined}
              >
                <Marker active={active} />
                <Text color={INK} bold={active}>
                  {r.service.name}
                </Text>
                <Text>{"  "}</Text>
                {r.record ? (
                  <Text color={TONE[label.tone]}>{label.text}</Text>
                ) : (
                  <Spinner label="checking" />
                )}
                {extra ? <Text color={colors.muted}> {extra}</Text> : null}
              </Box>
            )
          })}
        </Box>
      ))}
    </Box>
  )
}

// `rows` arrive in the board's walking order (cards, then the grid), so the
// cursor index reads straight across both.
export const BoardOverview = ({
  rows,
  cursor,
  hidden,
  note,
}: OverviewProps) => {
  const { columns } = useWindowSize()
  const [ref, height] = useMeasuredHeight()
  const inner = columns - FRAME_SIDES - 2
  const cards = rows.filter(isCard)
  const rest = rows.filter((r) => !isCard(r))
  const perLine = Math.max(1, Math.min(5, Math.floor((inner + 1) / (TILE + 1))))
  const tile = Math.floor((inner + 1) / perLine) - 1
  const lines: number[][] = []
  for (let i = 0; i < cards.length; i += perLine)
    lines.push(cards.slice(i, i + perLine).map((_, j) => i + j))
  const restLines = Math.ceil(rest.length / Math.max(1, Math.floor(inner / 30)))
  const fit = Math.max(
    1,
    Math.floor(
      Math.max(0, height - restLines - (hidden.length ? 2 : 0) - 1) /
        TILE_LINES,
    ),
  )
  const at = Math.max(
    0,
    lines.findIndex((l) => l.includes(cursor)),
  )
  const start =
    cursor >= cards.length || lines.length <= fit
      ? 0
      : Math.max(0, Math.min(at - Math.floor(fit / 2), lines.length - fit))
  return (
    <Box flexDirection="column" flexGrow={1}>
      <Tally rows={rows} width={perLine * (tile + 1) - 2} />
      <Box
        ref={ref}
        flexDirection="column"
        flexGrow={1}
        overflow="hidden"
        marginTop={1}
      >
        {rows.length ? null : <Empty />}
        {lines.slice(start, start + fit).map((line, n) => (
          <Box key={n} gap={1} flexShrink={0}>
            {line.map((i) => (
              <Tile
                key={cards[i].service.id}
                row={cards[i]}
                active={i === cursor}
                width={tile}
              />
            ))}
          </Box>
        ))}
        {cards.length && rest.length ? <Text> </Text> : null}
        <ClearGrid
          rows={rest}
          offset={cards.length}
          cursor={cursor}
          width={inner}
        />
        {hidden.length ? (
          <Box marginTop={rows.length ? 1 : 0}>
            <HiddenNote parts={hidden} />
          </Box>
        ) : null}
      </Box>
      <Footer note={note} />
    </Box>
  )
}
