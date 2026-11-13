import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import { Box, useInput, useWindowSize } from "ink"
import {
  FilterBar,
  Page,
  Spinner,
  Tabs,
  colors,
  useAppKeys,
  useFilterMode,
  useListCursor,
  useTabs,
  type TabItem,
} from "@kud/ink-ui"
import { isClear, worstFirst, type ServiceRecord } from "../core/index.js"
import { statusLabel } from "../labels.js"
import type { Source } from "../source.js"
import { DetailBody } from "./detail.js"
import { BoardOverview } from "./overview-board.js"
import { ListOverview } from "./overview-list.js"
import {
  FILTERS,
  glyphOf,
  hiddenParts,
  narrow,
  navOrder,
  type FilterId,
  type Row,
} from "./overview-model.js"
import type { View } from "../view.js"
import { FRAME_SIDES, TONE } from "./overview-parts.js"

// SelectableRow's gutter, kept for the detail body's indent.
const GUTTER = 4

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
        historyLoaded: true,
        historyFailed: previous.historyFailed,
      }
    : next

const Detail = ({
  record,
  width,
}: {
  record: ServiceRecord | undefined
  width: number
}) =>
  record ? (
    <Box flexDirection="column" flexGrow={1} paddingLeft={GUTTER}>
      <DetailBody record={record} width={width} />
    </Box>
  ) : (
    <Box paddingLeft={GUTTER}>
      <Spinner label="Reading the status page…" />
    </Box>
  )

const tabItems = (
  counts: Record<FilterId, number>,
  width: number,
): TabItem<FilterId>[] => {
  // The coloured status glyph rides in the marker, which never folds; when the
  // strip will not fit, the glyph moves to the icon so the tabs can fold to it.
  const strip = FILTERS.reduce(
    (sum, f) => sum + f.name.length + String(counts[f.id]).length + 8,
    0,
  )
  const fold = strip > width
  return FILTERS.map((f) => {
    const label =
      f.holds && f.id !== "trouble" ? statusLabel(f.holds.at(-1)!) : null
    const glyph = label ? glyphOf(label) : f.id === "trouble" ? "▲" : "◇"
    return fold
      ? { value: f.id, label: f.name, count: counts[f.id], icon: glyph }
      : {
          value: f.id,
          label: f.name,
          count: counts[f.id],
          marker: `${glyph} `,
          markerColor: label
            ? TONE[label.tone]
            : (FILTER_TONE[f.id] ?? colors.muted),
        }
  })
}

export const App = ({
  source,
  initialDetail,
}: {
  source: Source
  initialDetail?: string
}) => {
  const { columns } = useWindowSize()
  const [records, setRecords] = useState<Record<string, ServiceRecord>>({})
  const [loading, setLoading] = useState(true)
  const [updatedAt, setUpdatedAt] = useState<Date | null>(null)
  // Rows hold still while a read is in flight, each resolving in place, and
  // take the worst-first order only once every service has answered.
  const [order, setOrder] = useState<string[]>(() =>
    source.services.map((s) => s.id),
  )
  const [sorted, setSorted] = useState(false)
  const [view, setView] = useState<View>(source.view ?? "list")
  const [folded, setFolded] = useState(false)
  const [detailId, setDetailId] = useState<string | null>(initialDetail ?? null)
  const [detailBusy, setDetailBusy] = useState(false)
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

  const rows: Row[] = useMemo(
    () =>
      order.flatMap((id) => {
        const service = source.services.find((s) => s.id === id)
        return service ? [{ service, record: records[id] }] : []
      }),
    [order, records, source],
  )

  const atRoot = detailId === null
  const filterMode = useFilterMode({ isActive: atRoot })
  const { term, typing } = filterMode
  const searchCounts = narrow(rows, { filter: "all", folded: false, term })
  const tabWidth = columns - FRAME_SIDES
  const items = tabItems(searchCounts.counts, tabWidth)
  const { active: tab = "all" } = useTabs(items, {
    initial: "all",
    isActive: atRoot && !typing,
  })
  const narrowed = narrow(rows, { filter: tab, folded, term })
  const visible = navOrder(view, narrowed.rows)
  const hidden = hiddenParts(narrowed.hidden, { filter: tab, term })

  const { cursor, setCursor } = useListCursor(visible.length, {
    vimKeys: !typing,
    isActive: atRoot,
  })

  // The cursor holds a service, not a position: across the re-sort, a tab,
  // the fold, a search or a view switch it stays on the row it was on, and
  // only falls back to a position when that row has left the list.
  const selected = useRef<string | null>(null)
  const shape = visible.map((r) => r.service.id).join("\n")
  const lastShape = useRef(shape)
  useEffect(() => {
    if (lastShape.current !== shape) {
      lastShape.current = shape
      const at = visible.findIndex((r) => r.service.id === selected.current)
      if (at >= 0) {
        if (at !== cursor) setCursor(at)
        return
      }
      const fallback = Math.max(0, Math.min(cursor, visible.length - 1))
      if (fallback !== cursor) setCursor(fallback)
      selected.current = visible[fallback]?.service.id ?? null
      return
    }
    selected.current = visible[cursor]?.service.id ?? null
  }, [shape, cursor])

  const openDetail = (id: string) => {
    setDetailId(id)
    if (!records[id]?.historyLoaded) loadDetail(id)
  }

  const closeDetail = () => {
    detailRef.current?.abort()
    setDetailBusy(false)
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

  useInput((input, key) => {
    if (typing) return
    if (input === "r") return detailId ? loadDetail(detailId) : load()
    if (!atRoot) return
    if (input === "v") return setView((v) => (v === "list" ? "board" : "list"))
    if (input === "z") return setFolded((f) => !f)
    if (key.return && visible[cursor]) openDetail(visible[cursor].service.id)
  })

  const trouble = Object.values(records).filter((r) => !isClear(r.indicator))
  const updated = {
    text: `updated ${updatedAt?.toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit" }) ?? ""}`,
    tone: "quiet" as const,
  }
  const status = loading
    ? {
        text: updatedAt ? "↻ refreshing…" : "↻ checking…",
        tone: "busy" as const,
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
          detailBusy && record && !record.historyLoaded
            ? { text: "↻ loading history…", tone: "busy" }
            : status
        }
        page="nested"
        help={false}
        hints={[
          ["↑↓", "scroll"],
          ["r", "refresh"],
        ]}
      >
        <Detail
          record={record}
          width={Math.max(20, columns - FRAME_SIDES - GUTTER)}
        />
      </Page>
    )
  }

  const Overview = view === "board" ? BoardOverview : ListOverview
  return (
    <Page
      fill
      icon="◆"
      title="Incidents"
      count={source.services.length}
      noun="service"
      status={status}
      alert={alert}
      critical={critical}
      tabs={<Tabs active={tab} items={items} width={tabWidth} />}
      filter={
        <FilterBar
          term={term}
          typing={typing}
          caret={filterMode.caret}
          matches={term ? visible.length : undefined}
        />
      }
      counter={
        visible.length ? `${cursor + 1} of ${visible.length}` : undefined
      }
      page="root"
      help={false}
      hints={
        typing
          ? filterMode.hints
          : [
              ["↑↓", "move"],
              ["⏎", "open"],
              ["←→", "filter"],
              ["/", "search"],
              ["z", folded ? "show ok" : "fold ok"],
              ["v", view === "list" ? "board" : "list"],
              ["r", "refresh"],
            ]
      }
    >
      <Overview
        rows={visible}
        cursor={cursor}
        sorted={sorted}
        hidden={hidden}
        note={source.note}
      />
    </Page>
  )
}
