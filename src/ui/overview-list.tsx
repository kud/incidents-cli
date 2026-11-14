import { useRef, type ReactNode } from "react"
import { Box, Text } from "ink"
import { colors } from "@kud/ink-ui"
import { isClear } from "../core/index.js"
import type { Tone } from "../labels.js"
import {
  affected,
  ageText,
  headline,
  labelOf,
  runBreaks,
  startedAt,
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
  Pending,
  StatusCell,
  TONE,
  pad,
  pendingWidth,
  useMeasuredHeight,
  widest,
  type OverviewProps,
} from "./overview-parts.js"

// From this many columns of pane the selected service is read in full beside
// the list, which keeps everything but the preview's room.
export const PREVIEW_MIN = 110
const PREVIEW_ROOM = 52
const DIVIDER = 4
const COMPONENTS_MAX = 28
const COMPONENTS_MIN = 10
const TITLE_MIN = 32

const componentWord = (status: string): { text: string; tone: Tone } =>
  status === "operational"
    ? { text: "ok", tone: "success" }
    : status === "under_maintenance"
      ? { text: "maintenance", tone: "info" }
      : status === "major_outage"
        ? { text: "outage", tone: "error" }
        : { text: "degraded", tone: "warning" }

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
  const label = labelOf(row)
  const age = ageText(r)
  const start = startedAt(r)
  const clock = start
    ? new Date(start).toLocaleTimeString(undefined, {
        hour: "2-digit",
        minute: "2-digit",
      })
    : ""
  const comps = [...(r?.components ?? [])].sort(
    (a, b) =>
      Number(a.status === "operational") - Number(b.status === "operational"),
  )
  const nameW = widest(comps.map((c) => c.name))
  const lines: ReactNode[] = [
    <Text key="t" wrap="truncate-end">
      <Text color={INK} bold>
        {row.service.name}
      </Text>
      <Text>{"   "}</Text>
      <Text color={TONE[label.tone]}>{label.text}</Text>
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
          started {clock} · going {age}
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
  }
  if (comps.length) {
    lines.push(<Text key="b1"> </Text>)
    lines.push(
      <Text key="ch" color={colors.muted}>
        Components
      </Text>,
    )
    for (const c of comps) {
      const word = componentWord(c.status)
      lines.push(
        <Text key={`c-${c.name}`} wrap="truncate-end">
          <Text color={INK}>{pad(c.name, nameW + GAP)}</Text>
          <Text color={TONE[word.tone]}>{word.text}</Text>
        </Text>,
      )
    }
  }
  if (r) {
    lines.push(<Text key="b2"> </Text>)
    lines.push(
      <Text key="u" color={colors.link} wrap="truncate-end">
        {r.url.replace(/^https?:\/\//, "")}
      </Text>,
    )
    lines.push(
      <Text key="o" color={colors.muted}>
        ⏎ history and every incident
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
}: OverviewProps) => {
  const [ref, height] = useMeasuredHeight()
  const top = useRef(0)
  const inner = width
  const preview = inner >= PREVIEW_MIN
  // Columns are sized on every service, not the rows this tab shows, so the
  // name and age hold still as the tab, search or fold changes.
  const nameW = widest(all.map((r) => r.service.name))
  // The status reads as glyph and word, so it never rests on colour alone.
  const statusW = widest(all.map((r) => labelOf(r).text))
  const ageW = widest(all.map((r) => ageText(r.record)))
  const base = MARK + nameW + GAP + statusW + GAP + (ageW ? GAP + ageW : 0)
  // The split comes from the terminal alone: fitted to the titles, it moved
  // as each service answered and again on every tab.
  const left = preview
    ? Math.max(Math.floor(inner * 0.5), inner - PREVIEW_ROOM - DIVIDER)
    : inner
  // Rows stop a gap short of the divider, as the preview starts a gap after it.
  const rowW = preview ? left - GAP : left
  // The title is the answer, so the components column gives way to it: it
  // takes only what is left past TITLE_MIN, and none at all below COMPONENTS_MIN.
  const spare = rowW - base - TITLE_MIN - GAP
  const compsW = preview
    ? 0
    : Math.min(
        COMPONENTS_MAX,
        spare,
        widest(all.map((r) => affected(r.record).join(", "))),
      )
  const fixed = base + (compsW >= COMPONENTS_MIN ? GAP + compsW : 0)
  const titleW = Math.max(0, rowW - fixed)
  const breaks = runBreaks(rows, sorted, sort)

  const lines: { key: string; node: ReactNode; holds?: number }[] = []
  rows.forEach((row, i) => {
    if (breaks.has(i)) lines.push({ key: `gap-${i}`, node: <Text> </Text> })
    const active = i === cursor
    const r = row.record
    lines.push({
      key: row.service.id,
      holds: i,
      node: (
        <Box
          width={rowW}
          backgroundColor={active && focused ? BAND : undefined}
        >
          <Marker active={active} focused={focused} />
          <Text color={INK} bold>
            {pad(row.service.name, nameW + GAP)}
          </Text>
          <StatusCell row={row} width={statusW + GAP} />
          {r ? (
            <>
              <Text color={INK}>{pad(headline(r), titleW)}</Text>
              {compsW >= COMPONENTS_MIN ? (
                <Text color={INK}>
                  {"  "}
                  {pad(affected(r).join(", "), compsW)}
                </Text>
              ) : null}
              {ageW ? (
                <Text color={colors.muted}>
                  {"  "}
                  {ageText(r).padStart(ageW)}
                </Text>
              ) : null}
            </>
          ) : (
            <Pending row={i} width={pendingWidth(titleW, i)} />
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
