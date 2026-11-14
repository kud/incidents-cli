import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import { Box, Text, useInput, useWindowSize } from "ink"
import {
  FilterBar,
  FooterHints,
  PAGE_CHROME,
  Page,
  colors,
  useAppKeys,
  useFilterMode,
  useListCursor,
  useTabs,
} from "@kud/ink-ui"
import { isClear, worstFirst, type ServiceRecord } from "../core/index.js"
import { statusLabel } from "../labels.js"
import type { Source } from "../source.js"
import { DetailBody } from "./detail.js"
import { fitHints } from "./fit-hints.js"
import {
  BoardOverview,
  boardShape,
  boardStep,
  type Direction,
} from "./overview-board.js"
import { ListOverview } from "./overview-list.js"
import {
  FILTERS,
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
import { FRAME_SIDES, TONE } from "./overview-parts.js"
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
  const [focus, setFocus] = useState<Focus>("body")
  const [sort, setSort] = useState<Sort>(source.sort ?? "status")
  const [folded, setFolded] = useState(false)
  const [detailId, setDetailId] = useState<string | null>(initialDetail ?? null)
  const [detailBusy, setDetailBusy] = useState(false)
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
  const filterMode = useFilterMode({ isActive: atRoot })
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

  const { cursor, setCursor } = useListCursor(visible.length, {
    vimKeys: !typing,
    // The board walks in two dimensions, so it takes the arrows itself.
    isActive: atRoot && focus === "body" && view === "list",
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

  useAppKeys({
    isActive: !typing,
    onBack: () => {
      if (detailId !== null) {
        closeDetail()
        return true
      }
      if (filterMode.active) {
        filterMode.clear()
        return true
      }
      return false
    },
  })

  const filterW = filterWidth(columns)
  const full = filterW > 8
  const bodyW = Math.max(
    20,
    columns - FRAME_SIDES - filterW - BEFORE_RULE - 1 - AFTER_RULE,
  )

  useInput((input, key) => {
    if (typing) return
    if (input === "r") return detailId ? loadDetail(detailId) : load()
    if (!atRoot) return
    if (key.tab) return setFocus((f) => (f === "filters" ? "body" : "filters"))
    // The view keys act on the whole overview, so they answer whichever pane
    // holds focus.
    if (input === "v") return setView((v) => (v === "list" ? "board" : "list"))
    if (input === "s")
      return setSort((s) => (s === "status" ? "name" : "status"))
    if (input === "z") return setFolded((f) => !f)
    const cycle = (step: number) => {
      const i = FILTERS.findIndex((f) => f.id === tab)
      setActive(FILTERS[(i + step + FILTERS.length) % FILTERS.length].id)
    }
    if (focus === "filters") {
      if (key.rightArrow) return setFocus("body")
      const back = key.upArrow || input === "k"
      const on = key.downArrow || input === "j"
      if (back || on) return cycle(on ? 1 : -1)
      if (key.return) return setFocus("body")
      return
    }
    if (view === "board") {
      const dir: Direction | null = key.leftArrow
        ? "left"
        : key.rightArrow
          ? "right"
          : key.upArrow || input === "k"
            ? "up"
            : key.downArrow || input === "j"
              ? "down"
              : null
      if (dir && visible.length) {
        const next = boardStep(boardShape(visible, bodyW, sorted), cursor, dir)
        return next === "filters" ? setFocus("filters") : setCursor(next)
      }
    } else if (key.leftArrow) {
      // The list is one column, so every row sits on the board's left edge:
      // ← steps out to the filters there too, and → has nowhere to go.
      return setFocus("filters")
    }
    if (key.return && visible[cursor]) openDetail(visible[cursor].service.id)
  })

  const trouble = Object.values(records).filter((r) => !isClear(r.indicator))
  const stamp = (at: Date | null) => ({
    text: `updated ${at?.toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit" }) ?? ""}`,
    tone: "quiet" as const,
  })
  const updated = stamp(updatedAt)
  const status = loading
    ? {
        text: updatedAt ? "↻ refreshing…" : "↻ checking…",
        tone: updatedAt ? ("quiet" as const) : ("busy" as const),
      }
    : updated
  const alert = trouble.length
    ? `${trouble.length} declaring trouble`
    : undefined
  const critical = trouble.some((r) =>
    ["major", "critical"].includes(r.indicator),
  )

  if (detailId !== null) {
    const service = source.services.find((s) => s.id === detailId)
    const record = records[detailId]
    return (
      <Page
        fill
        icon="◆"
        title="Incidents"
        scope={service?.name}
        status={
          !record
            ? { text: "↻ checking…", tone: "busy" }
            : detailBusy
              ? record.historyLoaded
                ? { text: "↻ refreshing…", tone: "quiet" }
                : { text: "↻ loading history…", tone: "busy" }
              : stamp(detailAt ?? updatedAt)
        }
        page="nested"
        help={false}
        hints={[
          ["↑↓", "scroll"],
          ["r", "refresh"],
        ]}
      >
        <DetailBody
          record={record}
          width={Math.max(20, columns - FRAME_SIDES)}
          // The frame, the title row, the blank under it and the keys.
          height={Math.max(4, height - PAGE_CHROME - 1)}
          historyBusy={detailBusy && !record?.historyLoaded}
        />
      </Page>
    )
  }

  const Overview = view === "board" ? BoardOverview : ListOverview
  const onFilters = focus === "filters"
  const filterName = FILTERS.find((f) => f.id === tab)?.name ?? tab
  // Collapsed, the column has no room for names, so the active one rides in
  // the body's title.
  const bodyTitle =
    full || tab === "all" ? "Services" : `Services · ${filterName}`
  const hints: [string, string][] = onFilters
    ? [
        ["↑↓", "filter"],
        ["⏎", "go"],
        ["tab", "services"],
        ["/", "search"],
        ["v", view === "list" ? "board" : "list"],
        ["r", "refresh"],
      ]
    : [
        ...(view === "board"
          ? ([["←→↑↓", "move"]] as [string, string][])
          : ([["↑↓", "move"]] as [string, string][])),
        ["⏎", "open"],
        ["tab", "filters"],
        ["/", "search"],
        ["z", folded ? "show ok" : "fold ok"],
        ["v", view === "list" ? "board" : "list"],
        ["s", sort === "status" ? "by name" : "by status"],
        ["r", "refresh"],
      ]
  // The keys share their row with the counter; at a narrow width the least
  // used ones drop rather than wrap: sort, fold, refresh, view, search.
  const counter = visible.length ? `${cursor + 1} of ${visible.length}` : ""
  const hintRoom =
    columns - FRAME_SIDES - 3 - (counter ? 2 + counter.length : 0)
  return (
    <Page
      fill
      icon="◆"
      title="Incidents"
      scope={sort === "status" ? "by status ↓" : "by name"}
      count={source.services.length}
      noun="service"
      status={status}
      alert={alert}
      critical={critical}
      // No search open, no bar: the frame keeps its blank under the title.
      filter={
        term === null ? undefined : (
          <FilterBar
            term={term}
            typing={typing}
            caret={filterMode.caret}
            matches={term ? visible.length : undefined}
          />
        )
      }
      page="root"
      help={false}
    >
      <Box flexDirection="row" flexGrow={1}>
        <Box flexDirection="column" width={filterW} flexShrink={0}>
          <PaneTitle label="Filters" focused={onFilters} width={filterW} />
          <Box height={1} flexShrink={0} />
          <FilterList
            items={items}
            active={tab}
            focused={onFilters}
            total={searchCounts.counts.all}
            full={full}
            settled={sorted}
          />
        </Box>
        <Box width={BEFORE_RULE} flexShrink={0} />
        <Rule />
        <Box width={AFTER_RULE} flexShrink={0} />
        <Box flexDirection="column" width={bodyW} flexShrink={0}>
          <PaneTitle label={bodyTitle} focused={!onFilters} width={bodyW} />
          <Box height={1} flexShrink={0} />
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
            empty={`Nothing in ${filterName} right now · tab to change filter`}
          />
        </Box>
      </Box>
      {/* The page's own counter takes a row above the keys; here it rides at
          the end of the keys' row, so the body keeps that line. */}
      <Box paddingLeft={2} paddingRight={1} flexShrink={0}>
        <Box flexGrow={1}>
          <FooterHints
            hints={fitHints(
              typing ? filterMode.hints : hints,
              hintRoom,
              onFilters ? ["r", "v", "/"] : ["s", "z", "r", "v", "/"],
            )}
            page="root"
            help={false}
          />
        </Box>
        {visible.length ? (
          <Box flexShrink={0} marginLeft={2}>
            <Text dimColor>{counter}</Text>
          </Box>
        ) : null}
      </Box>
    </Page>
  )
}
