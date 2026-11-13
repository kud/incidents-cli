import { age } from "./age.js"
import { SEVERITY } from "./severity.js"
import type { Adapted, HistoryItem, Indicator } from "./types.js"

const tag = (block: string, name: string): string =>
  block
    .match(
      new RegExp(
        `<${name}>(?:<!\\[CDATA\\[)?([\\s\\S]*?)(?:\\]\\]>)?<\\/${name}>`,
      ),
    )?.[1]
    ?.trim() ?? ""

export const parseRss = (xml: string): HistoryItem[] =>
  [...xml.matchAll(/<item>([\s\S]*?)<\/item>/g)].map(([, block]) => ({
    title: tag(block, "title"),
    link: tag(block, "link"),
    date: tag(block, "pubDate"),
  }))

const timeOf = (raw: string): number => new Date(raw).getTime()

export const newestFirst = <T extends { date: string }>(items: T[]): T[] =>
  [...items].sort((a, b) => {
    const ta = timeOf(a.date)
    const tb = timeOf(b.date)
    if (Number.isNaN(ta) && Number.isNaN(tb)) return 0
    if (Number.isNaN(ta)) return 1
    if (Number.isNaN(tb)) return -1
    return tb - ta
  })

// Statuspage dates a scheduled maintenance by when it starts, so a feed that
// carries them holds items from the future. Those are not history; an undated
// item stays in it, shown without an age.
export const splitUpcoming = <T extends { date: string }>(
  items: T[],
  now = Date.now(),
): { past: T[]; upcoming: T[] } => {
  const ahead = (i: T) => timeOf(i.date) > now
  return {
    past: items.filter((i) => !ahead(i)),
    upcoming: items
      .filter(ahead)
      .sort((a, b) => timeOf(a.date) - timeOf(b.date)),
  }
}

interface StatuspageIncidents {
  incidents?: {
    id?: string
    name: string
    shortlink?: string | null
    started_at?: string | null
    created_at?: string | null
  }[]
}

export const fromStatuspageIncidents = (
  list: StatuspageIncidents,
  base: string,
): HistoryItem[] =>
  (list?.incidents ?? []).map((i) => ({
    title: i.name,
    link: i.id ? `${base}/incidents/${i.id}` : (i.shortlink ?? ""),
    date: i.started_at ?? i.created_at ?? "",
  }))

interface StatuspageSummary {
  status?: { indicator?: string; description?: string }
  components?: { name: string; status: string; group?: boolean }[]
  incidents?: {
    name: string
    shortlink?: string
    started_at?: string
    created_at?: string
    impact?: string
  }[]
}

export const fromStatuspageSummary = (summary: StatuspageSummary): Adapted => ({
  indicator: (summary?.status?.indicator ?? "unknown") as Indicator,
  description: summary?.status?.description ?? "No description",
  components: (summary?.components ?? [])
    .filter((c) => !c.group && !/^Visit /i.test(c.name))
    .map((c) => ({ name: c.name, status: c.status })),
  active: (summary?.incidents ?? []).map((i) => ({
    title: i.name,
    link: i.shortlink ?? "",
    date: i.started_at ?? i.created_at ?? "",
    impact: i.impact,
  })),
})

export const fromFeed = (
  items: HistoryItem[],
  { now = Date.now(), windowHours = 6 } = {},
): Adapted => {
  const latest = newestFirst(items)[0]
  if (!latest) return { indicator: "none", description: "No incidents posted" }
  const since = now - timeOf(latest.date)
  if (Number.isNaN(since))
    return { indicator: "unknown", description: "Feed has no dates" }
  return since < windowHours * 3_600_000
    ? {
        indicator: "minor",
        description: `Posted ${age(since)} ago: ${latest.title}`,
      }
    : { indicator: "none", description: `Last post ${age(since)} ago` }
}

const SLACK_IMPACT: Record<string, Indicator> = {
  outage: "major",
  incident: "minor",
  notice: "minor",
}

interface SlackCurrent {
  status?: string
  active_incidents?: {
    type?: string
    title: string
    url?: string
    date_created?: string
    services?: string[]
  }[]
}

export const fromSlack = (current: SlackCurrent): Adapted => {
  const incidents = current?.active_incidents ?? []
  if (current?.status === "ok" || incidents.length === 0)
    return {
      indicator: "none",
      description: "All systems operational",
      active: [],
    }
  const indicator = incidents
    .map((i) => SLACK_IMPACT[i.type ?? ""] ?? "minor")
    .sort((a, b) => SEVERITY[b] - SEVERITY[a])[0]
  return {
    indicator,
    description: incidents[0].title,
    components: [...new Set(incidents.flatMap((i) => i.services ?? []))].map(
      (name) => ({
        name,
        status: indicator === "major" ? "major_outage" : "degraded_performance",
      }),
    ),
    active: incidents.map((i) => ({
      title: i.title,
      link: i.url ?? "",
      date: i.date_created ?? "",
    })),
  }
}

interface AwsEvent {
  arn?: string
  status?: string | number
  service_name?: string
  region_name?: string
  summary?: string
  date?: string | number
  event_log?: { status?: string | number }[]
}

const AWS_STATUS: Record<string, Indicator> = {
  "1": "minor",
  "2": "minor",
  "3": "major",
}

export const fromAws = (
  events: AwsEvent[],
  { regions }: { regions?: string[] } = {},
): Adapted => {
  const regionOf = (e: AwsEvent): string =>
    String(e.arn ?? "").split(":")[3] || "global"
  const wanted = regions?.length ? new Set(regions.map(String)) : null
  const open = (events ?? []).filter(
    (e) => !wanted || wanted.has(regionOf(e)) || regionOf(e) === "global",
  )
  if (open.length === 0)
    return {
      indicator: "none",
      description: wanted
        ? `No open events in ${[...wanted].join(", ")}`
        : "No open events",
    }
  const level = (e: AwsEvent): Indicator =>
    AWS_STATUS[String(e.event_log?.at(-1)?.status ?? e.status)] ?? "minor"
  const indicator = open.map(level).sort((a, b) => SEVERITY[b] - SEVERITY[a])[0]
  const first = open[0]
  return {
    indicator,
    description:
      `${first.service_name}, ${first.region_name}: ${first.summary}` +
      (open.length > 1 ? ` (+${open.length - 1} more)` : ""),
    components: open.map((e) => ({
      name: `${e.service_name} (${regionOf(e)})`,
      status: level(e) === "major" ? "major_outage" : "degraded_performance",
    })),
    active: open.map((e) => ({
      title: `${e.service_name}, ${e.region_name}: ${e.summary}`,
      link: "https://health.aws.amazon.com/health/status",
      date: e.date ? new Date(Number(e.date) * 1000).toISOString() : "",
    })),
  }
}

export const decodeUtf16 = (buf: ArrayBuffer): string => {
  const bytes = new Uint8Array(buf)
  const le = bytes[0] === 0xff && bytes[1] === 0xfe
  return new TextDecoder(le ? "utf-16le" : "utf-16be").decode(bytes)
}
