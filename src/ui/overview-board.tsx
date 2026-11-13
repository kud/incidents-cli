import { Box, Text } from "ink"
import { Spinner, colors } from "@kud/ink-ui"
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

const Tile = ({
  row,
  active,
  width,
  focused,
}: {
  row: Row
  active: boolean
  width: number
  focused: boolean
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
      borderColor={active ? (focused ? colors.info : SOFT) : colors.track}
      paddingX={1}
    >
      <Text color={INK} bold wrap="truncate-end">
        {active ? (
          <Text color={focused ? colors.info : colors.muted}>❯ </Text>
        ) : null}
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
// that reads at a glance. The grid snaps to the card columns: a cell is one
// card column wide, or two when its widest entry will not fit in one, so every
// name starts under a card's left edge.
const gridLines = (
  rows: Row[],
  inner: number,
  tile: number,
  perLine: number,
  sorted: boolean,
): { cell: number; lines: Row[][] } => {
  const natural =
    MARK +
    widest(
      rows.map((r) => {
        // Before the sort lands, the cell is sized on the names alone, so a
        // service answering with a long title never reflows the grid; the
        // cell clips it until then.
        if (!sorted) return `${r.service.name}  ◌ checking`
        const extra = headline(r.record)
        return `${r.service.name}  ${glyphOf(labelOf(r))} ${r.record ? wordOf(labelOf(r)) : "checking"}${extra ? `  ${extra}` : ""}`
      }),
    ) +
    GAP
  const span = Math.min(perLine, natural <= tile + 1 ? 1 : 2)
  const cell = span * (tile + 1)
  const across = Math.max(1, Math.floor((inner + 1) / cell))
  const lines: Row[][] = []
  for (let i = 0; i < rows.length; i += across)
    lines.push(rows.slice(i, i + across))
  return { cell, lines }
}

const GridLine = ({
  line,
  first,
  cursor,
  cell,
  focused,
}: {
  line: Row[]
  first: number
  cursor: number
  cell: number
  focused: boolean
}) => (
  // A cell is a card column, less the one-cell gap between cards, so the
  // selected band stops at the card edge above it, not one cell past.
  <Box flexShrink={0} gap={1}>
    {line.map((r, j) => {
      const active = first + j === cursor
      const label = labelOf(r)
      const extra = headline(r.record)
      return (
        <Box
          key={r.service.id}
          width={cell - 1}
          flexShrink={0}
          overflow="hidden"
          backgroundColor={active && focused ? BAND : undefined}
        >
          <Marker active={active} focused={focused} />
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
  sorted,
  width,
  focused,
  empty,
}: OverviewProps) => {
  const [ref, height] = useMeasuredHeight()
  const inner = width
  // Until every service has answered, all of them sit in the grid; trouble
  // moves into cards in one step once the sort lands, so the frame never
  // reshuffles service by service.
  const cards = sorted ? rows.filter(isCard) : []
  const rest = sorted ? rows.filter((r) => !isCard(r)) : rows
  const perLine = Math.max(1, Math.min(5, Math.floor((inner + 1) / (TILE + 1))))
  const tile = Math.floor((inner + 1) / perLine) - 1
  const grid = gridLines(rest, inner, tile, perLine, sorted)
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
      <Box ref={ref} flexDirection="column" flexGrow={1} overflow="hidden">
        {rows.length ? null : <Empty text={empty} />}
        {shownCards.map((band) => (
          <Box key={band.first} gap={1} flexShrink={0}>
            {cards.slice(band.first, band.first + band.size).map((card, j) => (
              <Tile
                key={card.service.id}
                row={card}
                active={band.first + j === cursor}
                width={tile}
                focused={focused}
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
            focused={focused}
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
