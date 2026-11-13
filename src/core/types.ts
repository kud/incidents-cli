export type Kind = "statuspage" | "rss" | "slack" | "aws" | "link"

export type Indicator =
  "critical" | "major" | "unknown" | "minor" | "maintenance" | "none" | "link"

export interface Service {
  id: string
  name: string
  kind: Kind
  url?: string
  feed?: string
  window?: number
  regions?: string[]
  aliases: string[]
  note?: string
  timeout?: number
}

export interface ServiceComponent {
  name: string
  status: string
}

export interface Incident {
  title: string
  link: string
  date: string
  impact?: string
}

export interface HistoryItem {
  title: string
  link: string
  date: string
}

export interface ServiceRecord {
  id: string
  name: string
  url: string
  kind: Kind
  fetched: "ok" | "failed"
  indicator: Indicator
  description: string
  components: ServiceComponent[]
  active: Incident[]
  recent: HistoryItem[]
  upcoming: HistoryItem[] | null
  historyLoaded: boolean
  historyFailed: boolean
  note: string
}

export type Adapted = Partial<
  Pick<
    ServiceRecord,
    | "indicator"
    | "description"
    | "components"
    | "active"
    | "recent"
    | "upcoming"
    | "historyFailed"
  >
> &
  Pick<ServiceRecord, "indicator" | "description">

export interface ReadOptions {
  detail?: boolean
  signal?: AbortSignal
  timeout?: number
  userAgent?: string
  fetch?: typeof fetch
}
