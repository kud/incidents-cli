import {
  decodeUtf16,
  fromAws,
  fromFeed,
  fromSlack,
  fromStatuspageIncidents,
  fromStatuspageSummary,
  newestFirst,
  parseRss,
  splitUpcoming,
} from "./parse.js"
import type { Adapted, ReadOptions, Service } from "./types.js"

export const DEFAULT_TIMEOUT_MS = 4000

const fetchWith = async (
  url: string,
  service: Service,
  opts: ReadOptions,
): Promise<Response> => {
  const timeout = AbortSignal.timeout(
    service.timeout ?? opts.timeout ?? DEFAULT_TIMEOUT_MS,
  )
  const signal = opts.signal ? AbortSignal.any([opts.signal, timeout]) : timeout
  const res = await (opts.fetch ?? fetch)(url, {
    signal,
    headers: opts.userAgent ? { "user-agent": opts.userAgent } : {},
  })
  if (!res.ok) throw new Error(`${res.status} from ${url}`)
  return res
}

const json = async (url: string, service: Service, opts: ReadOptions) =>
  (await fetchWith(url, service, opts)).json()

const text = async (url: string, service: Service, opts: ReadOptions) =>
  (await fetchWith(url, service, opts)).text()

// History comes from the incidents API, which lists what actually happened.
// The RSS feed is read only for what is scheduled: on a page that plans a lot
// of maintenance, its slots are all taken by future windows dated by their
// start, and the past incidents never make it in. An unreadable feed
// leaves `upcoming` null: unknown, never "nothing planned".
const readHistory = async (
  base: string,
  service: Service,
  opts: ReadOptions,
): Promise<Pick<Adapted, "recent" | "upcoming" | "historyFailed">> => {
  const [incidents, feed] = await Promise.allSettled([
    json(`${base}/api/v2/incidents.json`, service, opts),
    text(`${base}/history.rss`, service, opts),
  ])
  opts.signal?.throwIfAborted()
  const upcoming =
    feed.status === "fulfilled"
      ? splitUpcoming(parseRss(feed.value)).upcoming
      : null
  if (incidents.status === "rejected")
    return { recent: [], upcoming, historyFailed: true }
  return {
    recent: newestFirst(
      splitUpcoming(fromStatuspageIncidents(incidents.value, base)).past,
    ),
    upcoming,
    historyFailed: false,
  }
}

export const ADAPTERS: Record<
  Service["kind"],
  (service: Service, opts: ReadOptions) => Promise<Adapted>
> = {
  statuspage: async (service, opts) => {
    const base = (service.url ?? "").replace(/\/$/, "")
    const [summary, history] = await Promise.all([
      json(`${base}/api/v2/summary.json`, service, opts),
      opts.detail
        ? readHistory(base, service, opts)
        : { recent: [], upcoming: [], historyFailed: false },
    ])
    return { ...fromStatuspageSummary(summary), ...history }
  },
  rss: async (service, opts) => {
    const { past, upcoming } = splitUpcoming(
      parseRss(await text(service.feed ?? "", service, opts)),
    )
    const items = newestFirst(past)
    return {
      ...fromFeed(items, { windowHours: service.window ?? 6 }),
      recent: items,
      upcoming,
    }
  },
  slack: async (service, opts) =>
    fromSlack(
      await json("https://slack-status.com/api/v2.0.0/current", service, opts),
    ),
  aws: async (service, opts) => {
    const res = await fetchWith(
      "https://health.aws.amazon.com/public/currentevents",
      service,
      opts,
    )
    return fromAws(JSON.parse(decodeUtf16(await res.arrayBuffer())), {
      regions: service.regions,
    })
  },
  link: async () => ({
    indicator: "link",
    description: "No machine-readable status",
  }),
}
