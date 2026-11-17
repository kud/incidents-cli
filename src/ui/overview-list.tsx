import { useRef, type ReactNode } from "react"
import { Box, Text } from "ink"
import { colors } from "@kud/ink-ui"
import { isClear } from "../core/index.js"
import { DISCLAIMER, statusLabel } from "../labels.js"
import { hyperlink, visibleLength } from "../render.js"
import type { Label } from "../labels.js"
import {
  ageText,
  headline,
  runBreaks,
  startedAt,
  type Row,
} from "./overview-model.js"
import {
  BAND,
  StatusTag,
  GroupHeading,
  PinMark,
  Empty,
  Footer,
  GAP,
  HiddenNote,
  INK,
  MARK,
  Marker,
  Pending,
  StatusCell,
  StatusPill,
  pillText,
  pad,
  pendingWidth,
  useMeasuredHeight,
  widest,
  type OverviewProps,
} from "./overview-parts.js"

// From this many columns of pane the selected service is read in full beside
// the list, which keeps everything but the preview's room.
export const PREVIEW_MIN = 110
// The preview's widest: past it the list takes the room, rather than the
// preview's lines running out to the frame.
const PREVIEW_ROOM = 90
const DIVIDER = 4
const STATUS_W = widest(
  ["critical", "major", "unknown", "minor", "maintenance", "none", "link"].map(
    (i) => statusLabel(i).text,
  ),
)
// The widest age the clock gives: "9h 59m".
const AGE_W = 6

const componentWord = (status: string): Label =>
  status === "operational"
    ? { text: "ok", tone: "success" }
    : status === "under_maintenance"
      ? { text: "maintenance", tone: "info" }
      : status === "major_outage"
        ? { text: "outage", tone: "error" }
        : { text: "degraded", tone: "warning" }

// Worst first, then by name, as the detail page orders them; maintenance is
// planned work and sits after the breakage.
const RANK: Record<string, number> = {
  major_outage: 0,
  partial_outage: 1,
  degraded_performance: 2,
  under_maintenance: 4,
}
// A status page can list dozens of components; the preview names the few in
// trouble and counts the rest on one line.
const COMPONENTS_SHOWN = 6

// The first line the list shows. The window holds still while the cursor
// moves inside it and only scrolls once the cursor comes within `SCROLL_EDGE`
// lines of an edge, so ↑↓ move the cursor rather than the list under it. It
// never opens on the blank line between two runs, which read as a stray gap
// under the pane title.
const SCROLL_EDGE = 2
export const scrollTop = (
  previous: number,
  lines: { holds?: number }[],
  at: number,
  room: number,
): number => {
  if (lines.length <= room) return 0
  const edge = Math.min(SCROLL_EDGE, Math.floor((room - 1) / 2))
  let start = previous
  if (at < start + edge) start = at - edge
  if (at > start + room - 1 - edge) start = at - room + 1 + edge
  start = Math.max(0, Math.min(start, lines.length - room))
  if (lines[start]?.holds === undefined && start < at) start += 1
  return start
}

const Preview = ({ row, width }: { row?: Row; width: number }) => {
  if (!row) return null
  const r = row.record
  const age = ageText(r)
  const start = startedAt(r)
  const clock = start
    ? new Date(start).toLocaleTimeString(undefined, {
        hour: "2-digit",
        minute: "2-digit",
      })
    : ""
  const comps = r?.components ?? []
  const broken = comps
    .filter((c) => c.status !== "operational")
    .sort(
      (a, b) =>
        (RANK[a.status] ?? 3) - (RANK[b.status] ?? 3) ||
        a.name.localeCompare(b.name),
    )
  const healthy = comps.length - broken.length
  const shown = broken.slice(0, COMPONENTS_SHOWN)
  // The status leads each row, so a long name is what gets cut, never the word.
  const wordW = widest([
    ...shown.map((c) => pillText(componentWord(c.status))),
    ...(healthy ? [pillText(componentWord("operational"))] : []),
  ])
  const componentRow = (key: string, status: string, text: string) => {
    const word = componentWord(status)
    return (
      <Text key={key} wrap="truncate-end">
        <StatusPill label={word} />
        <Text>{" ".repeat(wordW + GAP - visibleLength(pillText(word)))}</Text>
        <Text color={INK}>{text}</Text>
      </Text>
    )
  }
  const lines: ReactNode[] = [
    <Text key="t" wrap="truncate-end">
      <Text color={INK} bold>
        {row.service.name}
      </Text>
      <Text>{"   "}</Text>
      <StatusTag row={row} />
    </Text>,
    <Text key="b0"> </Text>,
  ]
  if (r && (!isClear(r.indicator) || r.indicator === "maintenance")) {
    lines.push(
      <Text key="h" color={INK} bold wrap="wrap">
        {headline(r)}
      </Text>,
    )
    if (age)
      lines.push(
        <Text key="a" color={colors.muted}>
          started {clock} · {age}
        </Text>,
      )
    if (r.active.length > 1)
      lines.push(
        <Text key="m" color={INK}>
          and {r.active.length - 1} more open incident
          {r.active.length > 2 ? "s" : ""}
        </Text>,
      )
  } else {
    lines.push(
      <Text key="h" color={INK}>
        {r ? headline(r) || "operational" : "checking…"}
      </Text>,
    )
    if (r?.indicator === "none")
      lines.push(
        <Text key="d" color={colors.muted} wrap="truncate-end">
          {DISCLAIMER}
        </Text>,
      )
  }
  if (comps.length) {
    lines.push(<Text key="b1"> </Text>)
    lines.push(
      <Text key="ch" color={colors.muted}>
        Components
      </Text>,
    )
    for (const c of shown)
      lines.push(componentRow(`c-${c.name}`, c.status, c.name))
    if (broken.length > shown.length)
      lines.push(
        <Text key="more" color={colors.muted}>
          {" ".repeat(wordW + GAP)}+{broken.length - shown.length} more
        </Text>,
      )
    if (healthy)
      lines.push(
        componentRow(
          "ok",
          "operational",
          `${healthy} component${healthy === 1 ? "" : "s"}`,
        ),
      )
  }
  if (r) {
    lines.push(<Text key="b2"> </Text>)
    lines.push(
      <Text key="u" color={colors.link} wrap="truncate-end">
        {hyperlink(r.url, r.url.replace(/^https?:\/\//, ""))}
      </Text>,
    )
    lines.push(
      <Text key="o" color={colors.muted}>
        → history and every incident
      </Text>,
    )
  }
  return (
    // Lines never shrink: on a short window the preview is cut at the bottom,
    // rather than squeezing its blanks and clipping the name.
    <Box flexDirection="column" width={width} overflow="hidden">
      {lines.map((line, i) => (
        <Box key={i} flexShrink={0}>
          {line}
        </Box>
      ))}
    </Box>
  )
}

export const ListOverview = ({
  rows,
  all,
  cursor,
  sorted,
  sort,
  hidden,
  note,
  width,
  focused,
  empty,
  motion,
}: OverviewProps) => {
  const [ref, height] = useMeasuredHeight()
  const top = useRef(0)
  const inner = width
  const preview = inner >= PREVIEW_MIN
  // Columns are sized on every service, not the rows this tab shows, so the
  // name and age hold still as the tab, search or fold changes.
  const nameW = widest(all.map((r) => r.service.name))
  // The status reads as glyph and word, so it never rests on colour alone.
  // Status and age are sized on every value they can hold, not the ones on
  // screen, so the columns are the same while services are still answering
  // as after: the skeleton rows sit where the rows land.
  const statusW = STATUS_W
  const ageW = Math.max(AGE_W, widest(all.map((r) => ageText(r.record))))
  // The split comes from the terminal alone: fitted to the titles, it moved
  // as each service answered and again on every tab.
  const left = preview
    ? Math.max(Math.floor(inner * 0.5), inner - PREVIEW_ROOM - DIVIDER)
    : inner
  // Rows stop a gap short of the divider, as the preview starts a gap after it.
  const rowW = preview ? left - GAP : left
  // Name, status and age hold their columns; the headline takes the rest
  // and is cut at the row's edge.
  // Room for the pinned mark before every name, once anything is pinned, so
  // the names keep one column.
  const mark = all.some((r) => r.pinned) ? 2 : 0
  const fixed =
    MARK + mark + nameW + GAP + statusW + GAP + (ageW ? ageW + GAP : 0)
  const titleW = Math.max(0, rowW - fixed)
  const breaks = runBreaks(rows, sorted, sort)

  const lines: { key: string; node: ReactNode; holds?: number }[] = []
  const pinnedCount = rows.filter((r) => r.pinned).length
  if (pinnedCount)
    lines.push({
      key: "pinned",
      node: <GroupHeading title="Pinned" count={pinnedCount} />,
    })
  rows.forEach((row, i) => {
    if (breaks.has(i)) lines.push({ key: `gap-${i}`, node: <Text> </Text> })
    const active = i === cursor
    const r = row.record
    // Drawn dim while it leaves or arrives in a transition.
    const faded = Boolean(motion?.faded?.[row.service.id])
    lines.push({
      key: row.service.id,
      holds: i,
      node: (
        <Box
          width={rowW}
          backgroundColor={active && focused ? BAND : undefined}
        >
          <Marker active={active} focused={focused} />
          {mark ? <PinMark on={Boolean(row.pinned)} /> : null}
          <Text color={INK} bold dimColor={faded}>
            {pad(row.service.name, nameW + GAP)}
          </Text>
          <StatusCell row={row} width={statusW + GAP} faded={faded} />
          {r ? (
            <>
              {ageW ? (
                <Text color={colors.muted} dimColor={faded}>
                  {ageText(r).padStart(ageW)}
                  {"  "}
                </Text>
              ) : null}
              <Box width={titleW} flexShrink={0}>
                <Text color={INK} dimColor={faded} wrap="truncate-end">
                  {headline(r) || " "}
                </Text>
              </Box>
            </>
          ) : (
            <>
              {ageW ? <Text>{" ".repeat(ageW + GAP)}</Text> : null}
              <Pending row={i} width={pendingWidth(titleW, i)} />
            </>
          )}
        </Box>
      ),
    })
  })

  const at = Math.max(
    0,
    lines.findIndex((l) => l.holds === cursor),
  )
  const room = Math.max(1, height - (hidden.length ? 2 : 0))
  const start = scrollTop(top.current, lines, at, room)
  top.current = start

  return (
    <Box flexDirection="column" flexGrow={1}>
      <Box flexDirection="row" flexGrow={1}>
        <Box
          ref={ref}
          width={left}
          flexShrink={0}
          flexDirection="column"
          overflow="hidden"
        >
          {rows.length ? null : <Empty text={empty} />}
          {lines.slice(start, start + room).map((l) => (
            <Box key={l.key}>{l.node}</Box>
          ))}
          {hidden.length ? (
            <Box marginTop={rows.length ? 1 : 0}>
              <HiddenNote parts={hidden} />
            </Box>
          ) : null}
        </Box>
        {preview ? (
          <>
            <Box
              width={3}
              flexShrink={0}
              borderStyle="single"
              borderTop={false}
              borderBottom={false}
              borderRight={false}
              borderColor={colors.track}
            />
            <Box flexGrow={1} paddingLeft={1}>
              <Preview
                row={rows[cursor]}
                width={Math.max(20, Math.min(90, inner - left - DIVIDER))}
              />
            </Box>
          </>
        ) : null}
      </Box>
      <Footer note={note} />
    </Box>
  )
}
