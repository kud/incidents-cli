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

// The tally reads worst first whatever order the rows are in, so sorting by
// name never reshuffles the bar.
const TALLY_ORDER = [
  "critical",
  "major",
  "unknown",
  "minor",
  "maintenance",
  "none",
  "link",
  "checking",
]

const Tally = ({ rows, width }: { rows: Row[]; width: number }) => {
  const counts = new Map<string, { label: Label; n: number; k: string }>()
  for (const r of rows) {
    const label = labelOf(r)
    const k = r.record?.indicator ?? "checking"
    counts.set(k, { label, n: (counts.get(k)?.n ?? 0) + 1, k })
  }
  const total = rows.length || 1
  let used = 0
  const parts = [...counts.values()]
    .sort((a, b) => TALLY_ORDER.indexOf(a.k) - TALLY_ORDER.indexOf(b.k))
    .map((c, i, all) => {
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
// that reads at a glance. Each line holds as many cells as the widest fits.
const gridLines = (
  rows: Row[],
  width: number,
): { cell: number; lines: Row[][] } => {
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
  return { cell, lines }
}

const GridLine = ({
  line,
  first,
  cursor,
  cell,
}: {
  line: Row[]
  first: number
  cursor: number
  cell: number
}) => (
  <Box flexShrink={0}>
    {line.map((r, j) => {
      const active = first + j === cursor
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
          <Text color={INK} bold>
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
)

// One band per card line or grid line. `first` is the cursor index of the
// band's first service, `size` how many services it holds.
type Band = { height: number; first: number; size: number }
type Span = { start: number; end: number }

const holds = (b: Band, cursor: number) =>
  cursor >= b.first && cursor < b.first + b.size

// The bands that fit in `room` lines. Without the cursor among them, the top
// ones. With it, they grow one band above, then one below, in turn, so the
// cursor sits mid-window until an edge stops one side; its own band always
// shows, even when the room is short.
const windowOf = (bands: Band[], cursor: number, room: number): Span => {
  const at = bands.findIndex((b) => holds(b, cursor))
  if (at < 0) {
    let end = 0
    let used = 0
    while (end < bands.length && used + bands[end].height <= room)
      used += bands[end++].height
    return { start: 0, end }
  }
  let start = at
  let end = at + 1
  let used = bands[at].height
  let up = true
  let down = true
  while (up || down) {
    if (up) {
      const h = bands[start - 1]?.height
      if (h !== undefined && used + h <= room) {
        start -= 1
        used += h
      } else up = false
    }
    if (down) {
      const h = bands[end]?.height
      if (h !== undefined && used + h <= room) {
        end += 1
        used += h
      } else down = false
    }
  }
  return { start, end }
}

const servicesIn = (bands: Band[]) => bands.reduce((sum, b) => sum + b.size, 0)

// The services the windows left out, so a scrolled board never hides one
// silently. Walking order runs cards then grid, so a card cut below the window
// is "below" even though the grid follows it on screen.
const offscreen = (
  cards: Band[],
  cardSpan: Span,
  grid: Band[],
  gridSpan: Span,
): string => {
  const above =
    servicesIn(cards.slice(0, cardSpan.start)) +
    servicesIn(grid.slice(0, gridSpan.start))
  const below =
    servicesIn(cards.slice(cardSpan.end)) + servicesIn(grid.slice(gridSpan.end))
  return [
    above ? `${above} more above` : "",
    below ? `${below} more below` : "",
  ]
    .filter(Boolean)
    .join(" · ")
}

// `rows` arrive in the board's walking order (cards, then the grid), so the
// cursor index reads straight across both. The grid takes the lines it needs
// first, short of crowding out every card; the cards scroll in what is left.
// Whatever either part cannot show is counted on the line between them.
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
  const grid = gridLines(rest, inner)
  const cardBands: Band[] = []
  for (let i = 0; i < cards.length; i += perLine)
    cardBands.push({
      height: TILE_LINES,
      first: i,
      size: Math.min(perLine, cards.length - i),
    })
  const gridBands: Band[] = grid.lines.map((line, n) => ({
    height: 1,
    first: cards.length + n * grid.lines[0].length,
    size: line.length,
  }))
  // One line is always kept for the scroll note or the break before the grid.
  const budget = Math.max(0, height - (hidden.length ? 2 : 0) - 1)
  const onGrid = cursor >= cards.length
  const gridRoom = Math.min(
    gridBands.length,
    Math.max(
      onGrid ? 1 : 0,
      budget - (cardBands.length && !onGrid ? TILE_LINES : 0),
    ),
  )
  const cardSpan = windowOf(cardBands, cursor, budget - gridRoom)
  const gridSpan = windowOf(gridBands, cursor, gridRoom)
  const shownCards = cardBands.slice(cardSpan.start, cardSpan.end)
  const shownGrid = gridBands.slice(gridSpan.start, gridSpan.end)
  const scrolled =
    shownCards.length < cardBands.length || shownGrid.length < gridBands.length
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
        {shownCards.map((band) => (
          <Box key={band.first} gap={1} flexShrink={0}>
            {cards.slice(band.first, band.first + band.size).map((card, j) => (
              <Tile
                key={card.service.id}
                row={card}
                active={band.first + j === cursor}
                width={tile}
              />
            ))}
          </Box>
        ))}
        {scrolled ? (
          <Box paddingLeft={MARK} flexShrink={0}>
            <Text color={colors.muted}>
              {offscreen(cardBands, cardSpan, gridBands, gridSpan)}
              {" · ↑↓ scroll"}
            </Text>
          </Box>
        ) : shownCards.length && shownGrid.length ? (
          <Text> </Text>
        ) : null}
        {shownGrid.map((band) => (
          <GridLine
            key={band.first}
            line={rest.slice(
              band.first - cards.length,
              band.first - cards.length + band.size,
            )}
            first={band.first}
            cursor={cursor}
            cell={grid.cell}
          />
        ))}
        {hidden.length ? (
          <Box marginTop={rows.length ? 1 : 0} flexShrink={0}>
            <HiddenNote parts={hidden} />
          </Box>
        ) : null}
      </Box>
      <Footer note={note} />
    </Box>
  )
}
