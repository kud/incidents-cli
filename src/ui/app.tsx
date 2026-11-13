import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import { Box, Text, useInput, useStdout } from "ink"
import {
  PAGE_CHROME,
  Page,
  SelectableRow,
  Spinner,
  colors,
  useAppKeys,
  useListCursor,
} from "@kud/ink-ui"
import {
  ageOf,
  isClear,
  whenLabel,
  worstFirst,
  type Service,
  type ServiceRecord,
} from "../core/index.js"
import { declaredText, statusLabel, wordLabel, type Tone } from "../labels.js"
import type { Source } from "../source.js"

const TONE: Record<Tone, string> = {
  error: colors.error,
  warning: colors.warning,
  info: colors.info,
  success: colors.success,
  muted: colors.muted,
}

const MAX_DETAIL_ROWS = 12
const FOOTER_AND_COUNTER_ROWS = 3

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

const OverviewRow = ({
  row,
  active,
  nameWidth,
}: {
  row: Row
  active: boolean
  nameWidth: number
}) => {
  if (!row.record)
    return (
      <SelectableRow active={active}>
        <Box>
          <Box width={16} flexShrink={0}>
            <Text color={colors.muted}>◌ checking</Text>
          </Box>
          <Box width={nameWidth} flexShrink={0}>
            <Text>{row.service.name}</Text>
          </Box>
        </Box>
      </SelectableRow>
    )
  const label = statusLabel(row.record.indicator)
  const loud =
    row.record.indicator !== "none" && row.record.indicator !== "link"
  return (
    <SelectableRow active={active}>
      <Box>
        <Box width={16} flexShrink={0}>
          <Text color={TONE[label.tone]}>{label.text}</Text>
        </Box>
        <Box width={nameWidth} flexShrink={0}>
          <Text bold={loud}>{row.service.name}</Text>
        </Box>
        <Text
          bold={loud}
          color={loud ? undefined : colors.muted}
          wrap="truncate-end"
        >
          {declaredText(row.record)}
        </Text>
      </Box>
    </SelectableRow>
  )
}

const Overview = ({
  rows,
  cursor,
  height,
  note,
}: {
  rows: Row[]
  cursor: number
  height: number
  note: string | null
}) => {
  const nameWidth = Math.max(...rows.map((r) => r.service.name.length), 7) + 2
  const start = Math.max(
    0,
    Math.min(cursor - Math.floor(height / 2), rows.length - height),
  )
  return (
    <Box flexDirection="column">
      {rows.slice(start, start + height).map((row, i) => (
        <OverviewRow
          key={row.service.id}
          row={row}
          active={start + i === cursor}
          nameWidth={nameWidth}
        />
      ))}
      <Box marginTop={1} flexDirection="column">
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
  busy,
}: {
  record: ServiceRecord | undefined
  busy: boolean
}) => {
  if (!record)
    return (
      <Box>
        <Spinner label="Reading the status page…" />
      </Box>
    )
  const status = statusLabel(record.indicator)
  const broken = record.components.filter((c) => c.status !== "operational")
  const healthy = record.components.length - broken.length
  const happening = [
    ...broken.map((c) => ({
      word: wordLabel(c.status),
      what: c.name,
      when: "now",
    })),
    ...record.active.map((i) => {
      const since = ageOf(i.date)
      return {
        word: wordLabel(i.impact),
        what: i.title,
        when: since ? `since ${since}` : "",
      }
    }),
  ]
  const current = new Set(
    record.active.flatMap((i) => [i.link, i.title]).filter(Boolean),
  )
  const earlier = record.recent
    .filter((i) => !current.has(i.link) && !current.has(i.title))
    .slice(0, 7)
  return (
    <Box flexDirection="column">
      <Box>
        <Text color={TONE[status.tone]}>{status.text}</Text>
        <Text bold>{`  ${record.description}  `}</Text>
        <Text color={colors.muted}>
          {record.url.replace(/^https:\/\//, "")}
        </Text>
      </Box>
      {happening.length > 0 ? (
        <Box flexDirection="column" marginTop={1}>
          <Box>
            <Box width={14} flexShrink={0}>
              <Text color={colors.muted}>Status</Text>
            </Box>
            <Box width={44} flexShrink={0}>
              <Text color={colors.muted}>What</Text>
            </Box>
            <Text color={colors.muted}>When</Text>
          </Box>
          {happening.slice(0, MAX_DETAIL_ROWS).map((h, i) => (
            <Box key={i}>
              <Box width={14} flexShrink={0}>
                <Text color={TONE[h.word.tone]}>{h.word.text}</Text>
              </Box>
              <Box width={44} flexShrink={0}>
                <Text wrap="truncate-end">{h.what}</Text>
              </Box>
              <Text>{h.when}</Text>
            </Box>
          ))}
          {happening.length > MAX_DETAIL_ROWS ? (
            <Text color={colors.muted}>
              {`+${happening.length - MAX_DETAIL_ROWS} more`}
            </Text>
          ) : null}
        </Box>
      ) : null}
      {broken.length === 0 && healthy > 0 ? (
        <Box marginTop={1}>
          <Text
            color={colors.muted}
          >{`${healthy} components operational`}</Text>
        </Box>
      ) : null}
      {earlier.length > 0 ? (
        <Box flexDirection="column" marginTop={1}>
          <Box>
            <Box width={58} flexShrink={0}>
              <Text color={colors.muted}>Earlier</Text>
            </Box>
            <Text color={colors.muted}>When</Text>
          </Box>
          {earlier.map((i, n) => (
            <Box key={n}>
              <Box width={58} flexShrink={0}>
                <Text color={colors.muted} wrap="truncate-end">
                  {i.title}
                </Text>
              </Box>
              <Text color={colors.muted}>{whenLabel(i.date)}</Text>
            </Box>
          ))}
        </Box>
      ) : null}
      {busy && !record.historyLoaded ? (
        <Box marginTop={1}>
          <Spinner label="Loading history…" />
        </Box>
      ) : null}
      {record.historyFailed ? (
        <Box marginTop={1}>
          <Text color={colors.muted}>
            History unavailable: its feed could not be read.
          </Text>
        </Box>
      ) : null}
      {record.note ? (
        <Box marginTop={1}>
          <Text color={colors.muted}>{record.note}</Text>
        </Box>
      ) : null}
    </Box>
  )
}

export const App = ({
  source,
  initialDetail,
}: {
  source: Source
  initialDetail?: string
}) => {
  const { stdout } = useStdout()
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
  const status = loading
    ? {
        text: Object.keys(records).length ? "↻ refreshing…" : "↻ checking…",
        tone: "busy" as const,
      }
    : {
        text: `updated ${updatedAt?.toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit" }) ?? ""}`,
        tone: "quiet" as const,
      }
  const alert = trouble.length
    ? `${trouble.length} declaring trouble`
    : undefined
  const critical = trouble.some((r) =>
    ["major", "critical"].includes(r.indicator),
  )

  if (detailId !== null) {
    const service = source.services.find((s) => s.id === detailId)
    return (
      <Page
        icon="◆"
        title="Incidents"
        scope={service?.name}
        status={status}
        alert={alert}
        critical={critical}
        page="nested"
        help={false}
        hints={[["r", "refresh"]]}
      >
        <Detail record={records[detailId]} busy={detailBusy} />
      </Page>
    )
  }

  const height = Math.max(
    3,
    (stdout?.rows || 30) - PAGE_CHROME - FOOTER_AND_COUNTER_ROWS - 4,
  )
  return (
    <Page
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
      <Overview
        rows={rows}
        cursor={cursor}
        height={height}
        note={source.note}
      />
    </Page>
  )
}
