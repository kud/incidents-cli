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
// A card's height: its border, then the name with its status, a blank that
// sets the name apart from what it says, the title, and the components with
// the age.
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
      borderStyle={active ? "bold" : "round"}
      borderColor={active ? (focused ? colors.accent : SOFT) : colors.track}
      // The left edge carries the status tone, selected or not: the status
      // belongs to the card, the rest of the border to the cursor.
      borderLeftColor={TONE[label.tone]}
      paddingX={1}
    >
      <Box width={inner} gap={GAP}>
        <Box flexGrow={1} flexShrink={1}>
          <Text color={INK} bold wrap="truncate-end">
            {row.service.name}
          </Text>
        </Box>
        <Box flexShrink={0}>
          <Text color={TONE[label.tone]}>{label.text}</Text>
        </Box>
      </Box>
      <Text> </Text>
      <Text color={INK} wrap="truncate-end">
        {headline(row.record)}
      </Text>
      <Box width={inner} gap={GAP}>
        <Box flexGrow={1} flexShrink={1}>
          <Text color={INK} wrap="truncate-end">
            {affected(row.record).join(", ") || " "}
          </Text>
        </Box>
        <Box flexShrink={0}>
          <Text color={colors.muted}>{ageText(row.record)}</Text>
        </Box>
      </Box>
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
): { cell: number; span: number; across: number; lines: Row[][] } => {
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
  return { cell, span, across, lines }
}

// The card geometry for a body `width` cells wide: how many cards share a
// line, and how wide each one is.
const tiles = (width: number) => {
  const perLine = Math.max(1, Math.min(5, Math.floor((width + 1) / (TILE + 1))))
  return { perLine, tile: Math.floor((width + 1) / perLine) - 1 }
}

// The board as the arrows see it: cards in rows of `perLine`, then the grid
// in rows of `across`, each grid cell `span` card columns wide.
export type BoardShape = {
  cards: number
  perLine: number
  across: number
  span: number
  total: number
}

export const boardShape = (
  rows: Row[],
  width: number,
  sorted: boolean,
): BoardShape => {
  const cards = sorted ? rows.filter(isCard).length : 0
  const rest = sorted ? rows.filter((r) => !isCard(r)) : rows
  const { perLine, tile } = tiles(width)
  const { span, across } = gridLines(rest, width, tile, perLine, sorted)
  return { cards, perLine, across, span, total: rows.length }
}

export type Direction = "left" | "right" | "up" | "down"

// Where an arrow takes the cursor: ←→ along a row, ↑↓ down a column, across
// the cards and the grid as one board. ← off the first column leaves the body
// for the filters; every other edge holds still.
export const boardStep = (
  shape: BoardShape,
  cursor: number,
  dir: Direction,
): number | "filters" => {
  const { cards, perLine, across, span, total } = shape
  const onCards = cursor < cards
  const width = onCards ? perLine : across
  const at = onCards ? cursor : cursor - cards
  const size = onCards ? cards : total - cards
  const col = at % width
  const row = Math.floor(at / width)
  const lastRow = Math.floor((size - 1) / width)
  if (dir === "left") return col ? cursor - 1 : "filters"
  if (dir === "right")
    return col < width - 1 && at + 1 < size ? cursor + 1 : cursor
  if (dir === "down") {
    if (row < lastRow)
      return Math.min(cursor + width, onCards ? cards - 1 : total - 1)
    if (!onCards || cards === total) return cursor
    return (
      cards + Math.min(Math.floor(col / span), across - 1, total - cards - 1)
    )
  }
  if (row) return cursor - width
  if (onCards || !cards) return cursor
  const lastCardRow = Math.floor((cards - 1) / perLine)
  return Math.min(lastCardRow * perLine + col * span, cards - 1)
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
          {/* A cell too narrow for its text cuts it with an ellipsis rather
              than wrapping a name onto a second line. */}
          <Text color={INK} bold wrap="truncate-end">
            {r.service.name}
          </Text>
          <Text>{"  "}</Text>
          {r.record ? (
            <Text color={TONE[label.tone]} wrap="truncate-end">
              {label.text}
            </Text>
          ) : (
            <Spinner label="checking" />
          )}
          {extra ? (
            <Text color={INK} wrap="truncate-end">
              {" "}
              {extra}
            </Text>
          ) : null}
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
  const { perLine, tile } = tiles(inner)
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
