import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type RefObject,
} from "react"
import {
  Box,
  Text,
  measureElement,
  useInput,
  useWindowSize,
  type DOMElement,
} from "ink"
import {
  Page,
  SelectableRow,
  Spinner,
  colors,
  useAppKeys,
  useListCursor,
} from "@kud/ink-ui"
import {
  isClear,
  worstFirst,
  type Service,
  type ServiceRecord,
} from "../core/index.js"
import { declaredText, statusLabel, type Label, type Tone } from "../labels.js"
import { visibleLength } from "../render.js"
import type { Source } from "../source.js"
import { DetailBody } from "./detail.js"

const TONE: Record<Tone, string> = {
  error: colors.error,
  warning: colors.warning,
  info: colors.info,
  success: colors.success,
  muted: colors.muted,
}

const GAP = 2
// SelectableRow's gutter: two spaces, the marker, a space.
const GUTTER = 4
// The round border on each side and the air Page leaves inside it.
const FRAME_SIDES = 4
const CHECKING: Label = { text: "◌ checking", tone: "muted" }

type Row = { service: Service; record?: ServiceRecord }

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

const widest = (cells: string[]): number =>
  Math.max(0, ...cells.map(visibleLength))

// The rows the body actually gets from its flex parent, measured after layout
// rather than derived from a chrome constant, so a wrapped hint line or a
// resized terminal never pushes the list past the frame.
const useMeasuredHeight = (): [RefObject<DOMElement | null>, number] => {
  const ref = useRef<DOMElement | null>(null)
  const [height, setHeight] = useState(0)
  useLayoutEffect(() => {
    if (!ref.current) return
    const measured = measureElement(ref.current).height
    if (measured !== height) setHeight(measured)
  })
  return [ref, height]
}

const OverviewRow = ({
  row,
  active,
  statusWidth,
  nameWidth,
}: {
  row: Row
  active: boolean
  statusWidth: number
  nameWidth: number
}) => {
  const label = row.record ? statusLabel(row.record.indicator) : CHECKING
  const loud =
    row.record !== undefined &&
    row.record.indicator !== "none" &&
    row.record.indicator !== "link"
  return (
    <SelectableRow active={active}>
      <Box width={statusWidth + GAP} flexShrink={0}>
        <Text color={TONE[label.tone]}>{label.text}</Text>
      </Box>
      <Box width={nameWidth + GAP} flexShrink={0}>
        <Text bold={loud || active} wrap="truncate-end">
          {row.service.name}
        </Text>
      </Box>
      <Box flexGrow={1} flexShrink={1}>
        <Text
          bold={loud}
          color={loud ? undefined : colors.muted}
          wrap="truncate-end"
        >
          {row.record ? declaredText(row.record) : ""}
        </Text>
      </Box>
    </SelectableRow>
  )
}

const Overview = ({
  rows,
  cursor,
  note,
}: {
  rows: Row[]
  cursor: number
  note: string | null
}) => {
  const [ref, height] = useMeasuredHeight()
  const statusWidth = widest([
    "Status",
    CHECKING.text,
    ...rows.map(
      (r) => (r.record ? statusLabel(r.record.indicator) : CHECKING).text,
    ),
  ])
  const nameWidth = widest(["Service", ...rows.map((r) => r.service.name)])
  const visible = Math.max(1, height)
  const start = Math.max(
    0,
    Math.min(cursor - Math.floor(visible / 2), rows.length - visible),
  )
  return (
    <Box flexDirection="column" flexGrow={1}>
      <Box paddingLeft={GUTTER}>
        <Box width={statusWidth + GAP} flexShrink={0}>
          <Text color={colors.muted}>Status</Text>
        </Box>
        <Box width={nameWidth + GAP} flexShrink={0}>
          <Text color={colors.muted}>Service</Text>
        </Box>
        <Text color={colors.muted}>Declared</Text>
      </Box>
      <Box ref={ref} flexDirection="column" flexGrow={1} overflow="hidden">
        {rows.slice(start, start + visible).map((row, i) => (
          <OverviewRow
            key={row.service.id}
            row={row}
            active={start + i === cursor}
            statusWidth={statusWidth}
            nameWidth={nameWidth}
          />
        ))}
      </Box>
      <Box flexDirection="column" paddingLeft={GUTTER} marginTop={1}>
        <Text color={colors.muted}>
          Declared status only: green is not proof your calls work.
        </Text>
        {note ? <Text color={colors.muted}>{note}</Text> : null}
      </Box>
    </Box>
  )
}

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
      .then(() => {
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

  const rows: Row[] = useMemo(() => {
    const known = worstFirst(Object.values(records))
    const pending = source.services.filter((s) => !(s.id in records))
    return [
      ...known.map((record) => ({
        record,
        service: source.services.find((s) => s.id === record.id) as Service,
      })),
      ...pending.map((service) => ({ service })),
    ]
  }, [records, source])

  const { cursor } = useListCursor(rows.length, {
    vimKeys: true,
    isActive: detailId === null,
  })

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
    onBack: () => {
      if (detailId === null) return false
      closeDetail()
      return true
    },
  })

  useInput((input, key) => {
    if (input === "r") return detailId ? loadDetail(detailId) : load()
    if (key.return && detailId === null && rows[cursor])
      openDetail(rows[cursor].service.id)
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
      counter={rows.length ? `${cursor + 1} of ${rows.length}` : undefined}
      page="root"
      help={false}
      hints={[
        ["↑↓", "move"],
        ["⏎", "open"],
        ["r", "refresh"],
      ]}
    >
      <Overview rows={rows} cursor={cursor} note={source.note} />
    </Page>
  )
}
