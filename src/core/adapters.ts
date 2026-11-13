import {
  decodeUtf16,
  fromAws,
  fromFeed,
  fromSlack,
  fromStatuspageSummary,
  newestFirst,
  parseRss,
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

const readHistory = async (
  url: string,
  service: Service,
  opts: ReadOptions,
): Promise<Pick<Adapted, "recent" | "historyFailed">> => {
  try {
    return {
      recent: newestFirst(parseRss(await text(url, service, opts))),
      historyFailed: false,
    }
  } catch (error) {
    if (opts.signal?.aborted) throw error
    return { recent: [], historyFailed: true }
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
        ? readHistory(`${base}/history.rss`, service, opts)
        : { recent: [], historyFailed: false },
    ])
    return { ...fromStatuspageSummary(summary), ...history }
  },
  rss: async (service, opts) => {
    const items = newestFirst(
      parseRss(await text(service.feed ?? "", service, opts)),
    )
    return {
      ...fromFeed(items, { windowHours: service.window ?? 6 }),
      recent: items,
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
