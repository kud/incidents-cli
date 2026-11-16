import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import { Box, useApp, useInput, useWindowSize } from "ink"
import {
  FilterBar,
  colors,
  useFilterMode,
  useListCursor,
  useTabs,
} from "@kud/ink-ui"
import { worstFirst, type ServiceRecord } from "../core/index.js"
import { statusLabel } from "../labels.js"
import type { Source } from "../source.js"
import { DetailBody } from "./detail.js"
import { HelpOverlay } from "./help.js"
import { fitHints } from "./fit-hints.js"
import { FRAME_ROWS, Frame, TEXT_COLUMN, type Hint } from "./frame.js"
import { overviewSegments, statusSegment } from "./header.js"
import {
  BoardOverview,
  boardShape,
  boardStep,
  type Direction,
} from "./overview-board.js"
import { ListOverview } from "./overview-list.js"
import {
  FILTERS,
  FILTER_FULL,
  glyphOf,
  filterWidth,
  hiddenParts,
  narrow,
  navOrder,
  type FilterId,
  type Row,
} from "./overview-model.js"
import type { Sort } from "../sort.js"
import type { View } from "../view.js"
import { FRAME_SIDES, MARK, TONE } from "./overview-parts.js"
import {
  FilterList,
  PaneTitle,
  Rule,
  type FilterItem,
} from "./filter-column.js"

// Which side Tab has put the keys on: the filter column or the body.
type Focus = "filters" | "body"

// Each row is the filter column, one space, the rule, two spaces, the body.
const BEFORE_RULE = 1
const AFTER_RULE = 2

const FILTER_TONE: Partial<Record<FilterId, string>> = {
  trouble: colors.error,
}

const keepHistory = (
  previous: ServiceRecord | undefined,
  next: ServiceRecord,
): ServiceRecord =>
  previous?.historyLoaded && !next.historyLoaded
    ? {
        ...next,
        recent: previous.recent,
        upcoming: previous.upcoming,
        historyLoaded: true,
        historyFailed: previous.historyFailed,
      }
    : next

const filterItems = (counts: Record<FilterId, number>): FilterItem[] =>
  FILTERS.map((f) => {
    const label =
      f.holds && f.id !== "trouble" ? statusLabel(f.holds.at(-1)!) : null
    return {
      id: f.id,
      name: f.name,
      count: counts[f.id],
      glyph: label ? glyphOf(label) : f.id === "trouble" ? "▲" : "◇",
      color: label ? TONE[label.tone] : (FILTER_TONE[f.id] ?? colors.muted),
    }
  })

export const App = ({
  source,
  initialDetail,
}: {
  source: Source
  initialDetail?: string
}) => {
  const { columns, rows: height } = useWindowSize()
  const [records, setRecords] = useState<Record<string, ServiceRecord>>({})
  const [loading, setLoading] = useState(true)
  const [updatedAt, setUpdatedAt] = useState<Date | null>(null)
  // Rows hold still while a read is in flight, each resolving in place, and
  // take the worst-first order only once every service has answered.
  const [order, setOrder] = useState<string[]>(() =>
    source.services.map((s) => s.id),
  )
  const [sorted, setSorted] = useState(false)
  const [view, setView] = useState<View>(source.view ?? "board")
  const [sort, setSort] = useState<Sort>(source.sort ?? "status")
  const [folded, setFolded] = useState(false)
  const [detailId, setDetailId] = useState<string | null>(initialDetail ?? null)
  const [detailBusy, setDetailBusy] = useState(false)
  const [help, setHelp] = useState(false)
  // When the open service was last read on its own, so its page says how old
  // its own data is rather than the overview's.
  const [detailAt, setDetailAt] = useState<Date | null>(null)
  const loadRef = useRef<AbortController | null>(null)
  const detailRef = useRef<AbortController | null>(null)

  const load = useCallback(() => {
    loadRef.current?.abort()
    const controller = new AbortController()
    loadRef.current = controller
    setLoading(true)
    source
      .readAll({
        signal: controller.signal,
        onRecord: (record) =>
          setRecords((prev) => ({
            ...prev,
            [record.id]: keepHistory(prev[record.id], record),
          })),
      })
      .then((all) => {
        setOrder(worstFirst(all).map((record) => record.id))
        setSorted(true)
        setLoading(false)
        setUpdatedAt(new Date())
      })
      .catch(() => undefined)
  }, [source])

  const loadDetail = useCallback(
    (id: string) => {
      const service = source.services.find((s) => s.id === id)
      if (!service) return
      detailRef.current?.abort()
      const controller = new AbortController()
      detailRef.current = controller
      setDetailBusy(true)
      source
        .readDetail(service, { signal: controller.signal })
        .then((record) => {
          setRecords((prev) => ({ ...prev, [id]: record }))
          setDetailBusy(false)
          setDetailAt(new Date())
        })
        .catch(() => undefined)
    },
    [source],
  )

  useEffect(() => {
    load()
    if (initialDetail) loadDetail(initialDetail)
    return () => {
      loadRef.current?.abort()
      detailRef.current?.abort()
    }
  }, [])

  // By name the order is known before anything answers, so it never moves.
  const byName = useMemo(
    () =>
      [...source.services]
        .sort((a, b) => a.name.localeCompare(b.name))
        .map((s) => s.id),
    [source],
  )
  const rows: Row[] = useMemo(
    () =>
      (sort === "name" ? byName : order).flatMap((id) => {
        const service = source.services.find((s) => s.id === id)
        return service ? [{ service, record: records[id] }] : []
      }),
    [sort, byName, order, records, source],
  )

  const atRoot = detailId === null
  const [focus, setFocus] = useState<Focus>("body")
  const filterMode = useFilterMode({ isActive: atRoot && !help })
  const { term, typing } = filterMode
  const searchCounts = narrow(rows, { filter: "all", folded: false, term })
  const items = filterItems(searchCounts.counts)
  const tabs = items.map((item) => ({ value: item.id, label: item.name }))
  // The app owns Tab and the arrows on the filter column, so the hook only
  // keeps the active filter.
  const { active: tab = "all", setActive } = useTabs(tabs, {
    initial: "all",
    isActive: false,
  })
  const narrowed = narrow(rows, { filter: tab, folded, term })
  // Until the sort lands the board has no cards yet, so the walk is the grid.
  const visible = sorted ? navOrder(view, narrowed.rows) : narrowed.rows
  // An empty filter says so on its own line; the "outside" count would only
  // repeat it.
  const hidden = hiddenParts(narrowed.hidden, { filter: tab, term }).filter(
    (p) => visible.length || p.key !== "tab",
  )

  // The app moves the cursor itself, so the hook only holds it.
  const { cursor, setCursor } = useListCursor(visible.length, {
    isActive: false,
  })

  // The cursor holds a service, not a position: across the re-sort, a tab,
  // the fold, a search or a view switch it stays on the row it was on, and
  // only falls back to a position when that row has left the list.
  // Until the cursor is first moved, though, it holds the top: nobody chose
  // the first service in the config, and following it through the first
  // sort dropped the selection into the middle of the list.
  const selected = useRef<string | null>(null)
  const moved = useRef(false)
  const lastCursor = useRef(cursor)
  const shape = visible.map((r) => r.service.id).join("\n")
  const lastShape = useRef(shape)
  useEffect(() => {
    if (lastShape.current !== shape) {
      lastShape.current = shape
      const at = moved.current
        ? visible.findIndex((r) => r.service.id === selected.current)
        : 0
      if (at >= 0) {
        if (at !== cursor) setCursor(at)
        lastCursor.current = at
        selected.current = visible[at]?.service.id ?? null
        return
      }
      const fallback = Math.max(0, Math.min(cursor, visible.length - 1))
      if (fallback !== cursor) setCursor(fallback)
      lastCursor.current = fallback
      selected.current = visible[fallback]?.service.id ?? null
      return
    }
    if (cursor !== lastCursor.current) moved.current = true
    lastCursor.current = cursor
    selected.current = visible[cursor]?.service.id ?? null
  }, [shape, cursor])

  const openDetail = (id: string) => {
    setDetailId(id)
    if (!records[id]?.historyLoaded) loadDetail(id)
  }

  const closeDetail = () => {
    detailRef.current?.abort()
    setDetailBusy(false)
    setDetailAt(null)
    setDetailId(null)
  }

  const filterW = filterWidth(columns)
  const full = filterW === FILTER_FULL
  const bodyW = Math.max(
    20,
    columns - FRAME_SIDES - filterW - BEFORE_RULE - 1 - AFTER_RULE,
  )

  const onFilters = focus === "filters"
  const { exit } = useApp()

  // One handler for the whole app, so the order holds: the overlay first,
  // then quit, then the page that has the keys. Arrows mean depth: ← and →
  // move between the filters, the services and a service's page, ↑↓ within
  // the one that has focus. The board keeps its own ←→ between cards.
  useInput((input, key) => {
    if (typing) {
      // The search owns every other key while it is being typed; ↑↓ still
      // walk what it matches.
      if (focus === "body" && (key.upArrow || key.downArrow))
        step(key.upArrow ? "up" : "down")
      return
    }
    if (help) {
      if (input === "q") return exit()
      if (input === "?" || key.escape || key.backspace || key.delete)
        setHelp(false)
      return
    }
    if (input === "q") return exit()
    if (input === "?") return setHelp(true)
    if (input === "r") return detailId ? loadDetail(detailId) : load()
    if (!atRoot) {
      if (key.leftArrow || key.escape || key.backspace || key.delete)
        closeDetail()
      return
    }
    if (key.escape || key.backspace || key.delete) {
      if (filterMode.active) filterMode.clear()
      return
    }
    if (key.tab) return setFocus((f) => (f === "filters" ? "body" : "filters"))
    // The view keys act on the whole overview, so they answer whichever pane
    // holds focus.
    if (input === "v") return setView((v) => (v === "list" ? "board" : "list"))
    if (input === "s")
      return setSort((s) => (s === "status" ? "name" : "status"))
    if (input === "z") return setFolded((f) => !f)
    if (onFilters) {
      const back = key.upArrow || input === "k"
      const on = key.downArrow || input === "j"
      if (back || on) {
        const i = FILTERS.findIndex((f) => f.id === tab)
        const next = (i + (on ? 1 : -1) + FILTERS.length) % FILTERS.length
        return setActive(FILTERS[next].id)
      }
      if (key.rightArrow || key.return) return setFocus("body")
      return
    }
    const open = () => {
      if (visible[cursor]) openDetail(visible[cursor].service.id)
    }
    if (key.return) return open()
    if (view === "list") {
      if (key.leftArrow) return setFocus("filters")
      if (key.rightArrow) return open()
    }
    const dir: Direction | null = key.leftArrow
      ? "left"
      : key.rightArrow
        ? "right"
        : key.upArrow || input === "k"
          ? "up"
          : key.downArrow || input === "j"
            ? "down"
            : null
    if (dir) step(dir)
  })

  // One move of the cursor in the services pane. The list is one column; the
  // board walks in two, and ← off its first column steps out to the filters.
  function step(dir: Direction) {
    if (!visible.length) {
      if (dir === "left") setFocus("filters")
      return
    }
    if (view === "list") {
      if (dir === "up" || dir === "down")
        setCursor((c) =>
          Math.max(
            0,
            Math.min(visible.length - 1, c + (dir === "up" ? -1 : 1)),
          ),
        )
      return
    }
    const next = boardStep(boardShape(visible, bodyW, sorted), cursor, dir)
    if (next === "filters") setFocus("filters")
    else setCursor(next)
  }

  const BRAND = "◆ Incidents"
  const helpHints: Hint[] = [
    ["esc", "close"],
    ["q", "quit"],
  ]

  if (detailId !== null) {
    const service = source.services.find((s) => s.id === detailId)
    const record = records[detailId]
    return (
      <Frame
        columns={columns}
        rows={height}
        brand={BRAND}
        crumb={service?.name}
        segments={[
          !record
            ? statusSegment({ loading: true, at: null })
            : detailBusy && !record.historyLoaded
              ? statusSegment({
                  loading: true,
                  at: null,
                  busy: "↻ loading history…",
                })
              : statusSegment({
                  loading: detailBusy,
                  at: detailAt ?? updatedAt,
                }),
        ]}
        hints={
          help
            ? helpHints
            : [
                ["↑↓", "scroll"],
                ["←", "back"],
                ["?", "keys"],
                ["q", "quit"],
              ]
        }
      >
        {help ? <HelpOverlay indent={TEXT_COLUMN} width={columns} /> : null}
        {/* Hidden rather than unmounted under the overlay, so the page keeps
            its scroll. */}
        <Box
          display={help ? "none" : "flex"}
          flexDirection="column"
          flexGrow={1}
        >
          <DetailBody
            record={record}
            width={Math.max(20, columns - FRAME_SIDES)}
            height={Math.max(4, height - FRAME_ROWS)}
            historyBusy={detailBusy && !record?.historyLoaded}
            active={!help}
          />
        </Box>
      </Frame>
    )
  }

  const Overview = view === "board" ? BoardOverview : ListOverview
  const filterName = FILTERS.find((f) => f.id === tab)?.name ?? tab
  // Collapsed, the column has no room for names, so the active one rides in
  // the body's title.
  const bodyTitle =
    full || tab === "all" ? "Services" : `Services · ${filterName}`
  const other = view === "list" ? "board" : "list"
  const searchHint: Hint =
    term === null ? ["/", "search"] : ["esc", "clear search"]
  // Six keys at most: the rest live behind `?`.
  const hints: Hint[] = help
    ? helpHints
    : typing
      ? [
          ["↑↓", "move"],
          ["⏎", "done"],
          ["⌃u", "clear"],
        ]
      : onFilters
        ? [
            ["↑↓", "filter"],
            ["⏎", "open"],
            searchHint,
            ["v", other],
            ["?", "keys"],
            ["q", "quit"],
          ]
        : [
            view === "board" ? ["←→↑↓", "move"] : ["↑↓", "move"],
            view === "board" ? ["⏎", "open"] : ["→", "open"],
            searchHint,
            ["v", other],
            ["?", "keys"],
            ["q", "quit"],
          ]
  // The counter is the services pane's: it hides while the filters have the
  // keys, and with the overlay open.
  const counter =
    visible.length && !onFilters && !help
      ? `${cursor + 1} of ${visible.length}`
      : ""
  // The keys share their row with the counter; at a narrow width the least
  // used ones drop rather than wrap.
  const hintRoom =
    columns - 2 - TEXT_COLUMN - 1 - (counter ? 2 + counter.length : 0)
  return (
    <Frame
      columns={columns}
      rows={height}
      brand={BRAND}
      segments={overviewSegments({
        records: Object.values(records),
        total: source.services.length,
        sort,
        loading,
        at: updatedAt,
      })}
      hints={typing ? hints : fitHints(hints, hintRoom, ["v", "/", "esc", "?"])}
      counter={counter || undefined}
    >
      {help ? <HelpOverlay indent={TEXT_COLUMN} width={columns} /> : null}
      <Box display={help ? "none" : "flex"} flexDirection="column" flexGrow={1}>
        {term === null ? null : (
          <Box paddingLeft={2}>
            <FilterBar
              term={term}
              typing={typing}
              caret={filterMode.caret}
              matches={term ? visible.length : undefined}
            />
          </Box>
        )}
        <Box flexDirection="row" flexGrow={1}>
          <Box flexDirection="column" width={filterW} flexShrink={0}>
            <PaneTitle
              label="Filters"
              focused={onFilters}
              width={filterW}
              indent={TEXT_COLUMN}
            />
            <FilterList
              items={items}
              active={tab}
              focused={onFilters}
              full={full}
              settled={sorted}
            />
          </Box>
          <Box width={BEFORE_RULE} flexShrink={0} />
          <Rule />
          <Box width={AFTER_RULE} flexShrink={0} />
          <Box flexDirection="column" width={bodyW} flexShrink={0}>
            <PaneTitle
              label={bodyTitle}
              focused={!onFilters}
              width={bodyW}
              indent={MARK}
            />
            <Overview
              rows={visible}
              all={rows}
              cursor={cursor}
              sorted={sorted}
              sort={sort}
              hidden={hidden}
              note={source.note}
              width={bodyW}
              focused={!onFilters}
              empty={`Nothing in ${filterName} right now · ← filters`}
            />
          </Box>
        </Box>
      </Box>
    </Frame>
  )
}
