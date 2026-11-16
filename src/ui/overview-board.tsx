import type { ReactNode } from "react"
import { Box, Text } from "ink"
import chalk from "chalk"
import { colors } from "@kud/ink-ui"
import {
  affected,
  ageText,
  boardGroups,
  glyphOf,
  headline,
  labelOf,
  wordOf,
  type Row,
} from "./overview-model.js"
import {
  BAND,
  Busy,
  Empty,
  Footer,
  GAP,
  HiddenNote,
  INK,
  MARK,
  Marker,
  Pending,
  pendingWidth,
  TONE,
  useMeasuredHeight,
  widest,
  type OverviewProps,
} from "./overview-parts.js"

// The narrowest card: two still share a line beside the named filter column
// at 120 columns.
const TILE = 44
// A card's height: its border, then the name with its status, a blank that
// sets the name apart from what it says, the title, and the components with
// the age.
export const TILE_LINES = 6

// A colour mixed halfway into the background: how the cards that are not
// selected draw their frame and title, so the selected one stands out by
// brightness while every frame keeps its status hue.
export const muted = (hex: string): string => {
  const n = parseInt(hex.slice(1), 16)
  const mix = (c: number, g: number) => Math.round((c + g) / 2)
  const out =
    (mix((n >> 16) & 255, 0x1e) << 16) |
    (mix((n >> 8) & 255, 0x1e) << 8) |
    mix(n & 255, 0x2e)
  return `#${out.toString(16).padStart(6, "0")}`
}

// A border style's left column: its top corner, side and bottom corner.
const edgeOf = (heavy: boolean): [string, string, string] =>
  heavy ? ["┏", "┃", "┗"] : ["╭", "│", "╰"]

const Tile = ({
  row,
  active,
  width,
  focused,
  height = TILE_LINES,
}: {
  row: Row
  active: boolean
  width: number
  focused: boolean
  // Part-way through a transition: fewer rows. At one row the card is its
  // own line, as the ok strip draws it.
  height?: number
}) => {
  const label = labelOf(row)
  const inner = width - 4
  if (height <= 1)
    return (
      <Box width={width} height={1} flexShrink={0} paddingLeft={MARK}>
        <Text color={INK} bold wrap="truncate-end">
          {row.service.name}
        </Text>
        <Text>{"  "}</Text>
        <Text color={TONE[label.tone]}>{label.text}</Text>
      </Box>
    )
  const selected = active && focused
  // The frame is the status: its colour on all four sides, heavy when the
  // service is on fire, so that reads without colour too. Ok, manual and
  // unread cards keep the neutral frame.
  const fire = ["critical", "major"].includes(row.record?.indicator ?? "")
  const tone =
    row.record &&
    row.record.indicator !== "none" &&
    row.record.indicator !== "link"
      ? TONE[label.tone]
      : colors.track
  // Selection is brightness: the selected card at full colour with a bold
  // title, the rest muted. Without colour it needs a shape: an inverse
  // title where styles still render, a marker where nothing does.
  const frame = selected ? tone : muted(tone)
  const plain = chalk.level === 0
  const inverse = selected && !plain && Boolean(process.env.NO_COLOR)
  const [corner, side, foot] = edgeOf(fire)
  const lines = [
    <Box key="t" width={inner} gap={GAP}>
      <Box flexGrow={1} flexShrink={1}>
        <Text
          color={
            selected ? INK : muted(tone === colors.track ? colors.muted : tone)
          }
          bold={selected}
          inverse={inverse}
          wrap="truncate-end"
        >
          {selected && plain ? "❯ " : ""}
          {row.service.name}
        </Text>
      </Box>
      <Box flexShrink={0}>
        {row.record ? (
          <Text color={TONE[label.tone]}>{label.text}</Text>
        ) : (
          <Busy label="checking" />
        )}
      </Box>
    </Box>,
    <Text key="b"> </Text>,
    ...(row.record
      ? [
          <Text key="h" color={INK} wrap="truncate-end">
            {headline(row.record)}
          </Text>,
          <Box key="c" width={inner} gap={GAP}>
            <Box flexGrow={1} flexShrink={1}>
              <Text color={INK} wrap="truncate-end">
                {affected(row.record).join(", ") || " "}
              </Text>
            </Box>
            <Box flexShrink={0}>
              <Text color={colors.muted}>{ageText(row.record)}</Text>
            </Box>
          </Box>,
        ]
      : // A card still being read: its name is known, the rest shimmers
        // where the headline and the components will land.
        [
          <Pending key="h" width={pendingWidth(inner, 0)} />,
          <Pending key="c" width={pendingWidth(Math.floor(inner / 2), 1)} />,
        ]),
  ]
  // The left edge is drawn on its own, corners included: as a side of the
  // border, Ink gives its corners the top and bottom colour, and a status
  // edge stopped short of the card's full height.
  return (
    <Box width={width} height={height} flexShrink={0}>
      <Box flexDirection="column" width={1} flexShrink={0}>
        <Text color={frame}>{corner}</Text>
        {Array.from({ length: height - 2 }, (_, i) => (
          <Text key={i} color={frame}>
            {side}
          </Text>
        ))}
        <Text color={frame}>{foot}</Text>
      </Box>
      <Box
        width={width - 1}
        flexShrink={0}
        height={height}
        flexDirection="column"
        borderStyle={fire ? "bold" : "round"}
        borderColor={frame}
        borderLeft={false}
        paddingX={1}
      >
        {lines.slice(0, Math.max(0, height - 2))}
      </Box>
    </Box>
  )
}

// The card geometry for a body `width` cells wide: how many cards share a
// line, and how wide each one is.
const tiles = (width: number) => {
  const perLine = Math.max(1, Math.min(5, Math.floor((width + 1) / (TILE + 1))))
  return { perLine, tile: Math.floor((width + 1) / perLine) - 1 }
}

// Everything without a card as a grid of names that reads at a glance. The
// grid snaps to the card columns: a cell is one card column wide, or two when
// its widest entry will not fit in one, so every name starts under a card's
// left edge. The strip and the manual group share one cell size.
const gridOf = (
  rows: Row[],
  inner: number,
  tile: number,
  perLine: number,
  sorted: boolean,
): { cell: number; span: number; across: number } => {
  // Names are padded to the widest, so the cell is sized on the widest name
  // and the widest status after it. Before the sort lands it is sized on the
  // names alone, so a service answering with a long title never reflows the
  // grid; the cell clips it until then.
  const natural =
    MARK +
    widest(rows.map((r) => r.service.name)) +
    GAP +
    widest(
      rows.map((r) => {
        if (!sorted) return "◌ checking"
        const extra = headline(r.record)
        return `${glyphOf(labelOf(r))} ${r.record ? wordOf(labelOf(r)) : "checking"}${extra ? `  ${extra}` : ""}`
      }),
    ) +
    GAP
  const span = Math.min(perLine, natural <= tile + 1 ? 1 : 2)
  const cell = span * (tile + 1)
  const across = Math.max(1, Math.floor((inner + 1) / cell))
  return { cell, span, across }
}

const chunk = <T,>(list: T[], size: number): T[][] => {
  const out: T[][] = []
  for (let i = 0; i < list.length; i += size) out.push(list.slice(i, i + size))
  return out
}

// The board as the arrows see it: one entry per line on screen, cards and
// grid alike, with the services it holds and how many card columns each of
// its cells spans. A blank between groups is not a line here.
export type BoardLine = { first: number; size: number; span: number }
export type BoardShape = { lines: BoardLine[] }

const lineUp = (sizes: number[], span: number, start: number): BoardLine[] => {
  let first = start
  return sizes.map((size) => {
    const line = { first, size, span }
    first += size
    return line
  })
}

export const boardShape = (
  rows: Row[],
  width: number,
  sorted: boolean,
): BoardShape => {
  const { cards, strip, manual } = boardGroups(rows, sorted)
  const { perLine, tile } = tiles(width)
  const grid = gridOf([...strip, ...manual], width, tile, perLine, sorted)
  const cardLines = lineUp(
    chunk(cards, perLine).map((l) => l.length),
    1,
    0,
  )
  const stripLines = lineUp(
    chunk(strip, grid.across).map((l) => l.length),
    grid.span,
    cards.length,
  )
  const manualLines = lineUp(
    chunk(manual, grid.across).map((l) => l.length),
    grid.span,
    cards.length + strip.length,
  )
  return { lines: [...cardLines, ...stripLines, ...manualLines] }
}

export type Direction = "left" | "right" | "up" | "down"

// Where an arrow takes the cursor: ←→ along a line, ↑↓ to the line above or
// below, landing on the cell under the same card column. ← off a line's first
// cell leaves the body for the filters; every other edge holds still.
export const boardStep = (
  { lines }: BoardShape,
  cursor: number,
  dir: Direction,
): number | "filters" => {
  const at = lines.findIndex(
    (l) => cursor >= l.first && cursor < l.first + l.size,
  )
  if (at < 0) return cursor
  const line = lines[at]
  const col = cursor - line.first
  if (dir === "left") return col ? cursor - 1 : "filters"
  if (dir === "right") return col < line.size - 1 ? cursor + 1 : cursor
  const to = lines[dir === "down" ? at + 1 : at - 1]
  if (!to) return cursor
  const x = col * line.span
  return to.first + Math.min(Math.floor(x / to.span), to.size - 1)
}

// One grid line. Names are padded to the widest in their column, so the
// status glyphs line up down the strip.
const GridLine = ({
  line,
  first,
  cursor,
  cell,
  nameW,
  focused,
}: {
  line: Row[]
  first: number
  cursor: number
  cell: number
  nameW: number[]
  focused: boolean
}) => (
  // A cell is a card column, less the one-cell gap between cards, so the
  // selected band stops at the card edge above it, not one cell past.
  <Box flexShrink={0} gap={1}>
    {line.map((r, j) => {
      const active = first + j === cursor
      const label = labelOf(r)
      const extra = headline(r.record)
      const room = Math.max(1, Math.min(nameW[j], cell - 1 - MARK - 4))
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
          <Box width={room} flexShrink={0}>
            <Text color={INK} bold wrap="truncate-end">
              {r.service.name}
            </Text>
          </Box>
          <Text>{"  "}</Text>
          {r.record ? (
            <Text color={TONE[label.tone]} wrap="truncate-end">
              {label.text}
            </Text>
          ) : (
            <Busy label="checking" />
          )}
          {extra ? (
            <Text color={INK} wrap="truncate-end">
              {"  "}
              {extra}
            </Text>
          ) : null}
        </Box>
      )
    })}
  </Box>
)

// A band is one line on screen: a card line, a grid line, or a blank that
// sets a group apart. `first` is the cursor index of its first service and
// `size` how many it holds, none for a blank.
type Band = {
  key: string
  height: number
  first: number
  size: number
  draw: () => ReactNode
}
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
const linesIn = (bands: Band[]) => bands.reduce((sum, b) => sum + b.height, 0)

// The pieces of the board for `rows` at `width`, before any window is taken:
// the card lines, then the grid's (the strip, or the one line it folds to,
// and the manual group after a blank).
// A frame part-way through a transition: per-card heights (one row is the
// card's line), the services already handed to the strip while the first
// load settles, and how many strip lines show.
export type Motion = {
  heights?: Record<string, number>
  strip?: Row[]
  stripLines?: number
}

const layout = (
  rows: Row[],
  width: number,
  sorted: boolean,
  okHidden: number,
  render: {
    cursor: number
    focused: boolean
  } = { cursor: -1, focused: false },
  motion: Motion = {},
) => {
  const groups = boardGroups(rows, sorted)
  const { cards, manual } = groups
  const strip = sorted ? groups.strip : (motion.strip ?? [])
  const heightOf = (r: Row) => motion.heights?.[r.service.id] ?? TILE_LINES
  const { perLine, tile } = tiles(width)
  const grid = gridOf([...strip, ...manual], width, tile, perLine, sorted)
  const cardBands: Band[] = chunk(cards, perLine).map((line, n) => ({
    key: `c${n}`,
    height: Math.max(...line.map(heightOf)),
    first: n * perLine,
    size: line.length,
    draw: () => (
      <Box key={`c${n}`} gap={1} flexShrink={0}>
        {line.map((card, j) => (
          <Tile
            key={card.service.id}
            row={card}
            active={n * perLine + j === render.cursor}
            width={tile}
            focused={render.focused}
            height={heightOf(card)}
          />
        ))}
      </Box>
    ),
  }))
  const gridGroup = (group: Row[], start: number, tag: string): Band[] => {
    const lines = chunk(group, grid.across)
    const nameW = Array.from({ length: grid.across }, (_, j) =>
      widest(lines.flatMap((l) => (l[j] ? [l[j].service.name] : []))),
    )
    return lines.map((line, n) => ({
      key: `${tag}${n}`,
      height: 1,
      first: start + n * grid.across,
      size: line.length,
      draw: () => (
        <GridLine
          key={`${tag}${n}`}
          line={line}
          first={start + n * grid.across}
          cursor={render.cursor}
          cell={grid.cell}
          nameW={nameW}
          focused={render.focused}
        />
      ),
    }))
  }
  const blank = (key: string): Band => ({
    key,
    height: 1,
    first: -1,
    size: 0,
    draw: () => <Text key={key}> </Text>,
  })
  // The strip folded to one line: how many are ok, and the key that shows
  // them.
  const folded: Band[] =
    okHidden && !strip.length
      ? [
          {
            key: "ok",
            height: 1,
            first: -1,
            size: 0,
            draw: () => (
              <Box key="ok" paddingLeft={MARK} flexShrink={0}>
                <Text color={TONE.success}>● </Text>
                <Text color={INK}>{okHidden} ok</Text>
                <Text color={colors.muted}> · z show</Text>
              </Box>
            ),
          },
        ]
      : []
  const stripBands = [
    ...gridGroup(strip, cards.length, "s").slice(0, motion.stripLines),
    ...folded,
  ]
  const manualBands = gridGroup(manual, cards.length + strip.length, "m")
  const gridBands = [
    ...stripBands,
    ...(stripBands.length && manualBands.length ? [blank("gm")] : []),
    ...manualBands,
  ]
  const cardsRight = perLine * (tile + 1) - 1
  return { cardBands, gridBands, cards, cardsRight }
}

// Whether the board fits `height` lines as it is, every ok service in the
// strip: when it does not, the strip folds to one line before any card is
// scrolled off.
export const boardFits = (
  rows: Row[],
  width: number,
  sorted: boolean,
  height: number,
): boolean => {
  const { cardBands, gridBands } = layout(rows, width, sorted, 0)
  const between = cardBands.length && gridBands.length ? 1 : 0
  return linesIn(cardBands) + between + linesIn(gridBands) <= height
}

// `rows` arrive in the board's walking order (cards, the strip, the manual
// group), so the cursor index reads straight across all three. The grid
// takes the lines it needs first, short of crowding out every card; the cards
// scroll in what is left. Whatever is off screen is counted at the bottom
// right of the card grid.
export const BoardOverview = ({
  rows,
  cursor,
  hidden,
  note,
  sorted,
  width,
  focused,
  empty,
  okHidden = 0,
  motion,
}: OverviewProps) => {
  const [ref, height] = useMeasuredHeight()
  const { cardBands, gridBands, cards, cardsRight } = layout(
    rows,
    width,
    sorted,
    okHidden,
    { cursor, focused },
    motion,
  )
  const onGrid = cursor >= cards.length
  // One line is always kept between the cards and the grid: blank, or the
  // scroll note at its right end.
  const budget = Math.max(0, height - (hidden.length ? 2 : 0) - 1)
  const gridRoom = Math.min(
    linesIn(gridBands),
    Math.max(
      onGrid ? 1 : 0,
      budget - (cardBands.length && !onGrid ? TILE_LINES : 0),
    ),
  )
  const cardSpan = windowOf(cardBands, cursor, budget - gridRoom)
  const gridSpan = windowOf(gridBands, cursor, gridRoom)
  const shownCards = cardBands.slice(cardSpan.start, cardSpan.end)
  const shownGrid = gridBands.slice(gridSpan.start, gridSpan.end)
  const above =
    servicesIn(cardBands.slice(0, cardSpan.start)) +
    servicesIn(gridBands.slice(0, gridSpan.start))
  const below =
    servicesIn(cardBands.slice(cardSpan.end)) +
    servicesIn(gridBands.slice(gridSpan.end))
  const scroll = [
    above ? `${above} more above` : "",
    below ? `${below} more below` : "",
    above || below ? "↑↓ scroll" : "",
  ]
    .filter(Boolean)
    .join(" · ")
  return (
    <Box flexDirection="column" flexGrow={1}>
      <Box ref={ref} flexDirection="column" flexGrow={1} overflow="hidden">
        {rows.length ? null : <Empty text={empty} />}
        {shownCards.map((band) => band.draw())}
        {scroll ? (
          <Box
            width={Math.min(width, cardsRight)}
            justifyContent="flex-end"
            flexShrink={0}
          >
            <Text color={colors.muted}>{scroll}</Text>
          </Box>
        ) : shownCards.length && shownGrid.length ? (
          <Text> </Text>
        ) : null}
        {shownGrid.map((band) => band.draw())}
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
