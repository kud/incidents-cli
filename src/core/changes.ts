import { isClear } from "./severity.js"
import type { ServiceRecord } from "./types.js"

// What a watcher compares between polls. `clear` folds operational,
// maintenance and manual-link rows together; an unreadable page is trouble.
export type Level = "clear" | "minor" | "major" | "critical" | "unreadable"

export type Snapshot = Record<string, Level>

export interface Change {
  service: string
  name: string
  // null on the first poll: the service was already in trouble.
  from: Level | null
  to: Level
  headline: string
  url: string
  at: string
}

export const levelOf = (
  record: Pick<ServiceRecord, "fetched" | "indicator">,
): Level => {
  if (record.fetched === "failed" || record.indicator === "unknown")
    return "unreadable"
  if (isClear(record.indicator)) return "clear"
  return record.indicator as Level
}

export const isTrouble = (level: Level): boolean => level !== "clear"

const headlineOf = (record: ServiceRecord): string =>
  record.active[0]?.title || record.description

const urlOf = (record: ServiceRecord): string =>
  record.active[0]?.link || record.url

// Previous snapshot + new records → the changes to report and the next
// snapshot. Without a previous snapshot (the first poll), only services
// already in trouble are reported.
export const diffSnapshots = (
  previous: Snapshot | null,
  records: ServiceRecord[],
  at: string,
): { snapshot: Snapshot; changes: Change[] } => {
  const snapshot: Snapshot = {}
  const changes: Change[] = []
  for (const record of records) {
    const to = levelOf(record)
    snapshot[record.id] = to
    const from = previous?.[record.id] ?? null
    const changed = from === null ? isTrouble(to) : from !== to
    if (!changed) continue
    changes.push({
      service: record.id,
      name: record.name,
      from,
      to,
      headline: headlineOf(record),
      url: urlOf(record),
      at,
    })
  }
  return { snapshot, changes }
}
