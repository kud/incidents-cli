import type { Service, ServiceRecord } from "./core/index.js"

const ago = (minutes: number): string =>
  new Date(Date.now() - minutes * 60_000).toISOString()

const base = (id: string, name: string): Service => ({
  id,
  name,
  kind: "statuspage",
  url: `https://status.${id}.example.com`,
  aliases: [],
})

export const MOCK_SERVICES: Service[] = [
  base("acme-cloud", "Acme Cloud"),
  base("example-cdn", "Example CDN"),
  base("sample-registry", "Sample Registry"),
  base("demo-maintenance", "Demo Maintenance"),
  { ...base("demo-feed", "Demo Feed"), kind: "rss", aliases: ["feed"] },
  base("placeholder-mail", "Placeholder Mail"),
  { ...base("test-docs", "Test Docs"), kind: "link" },
  base("brightgate-auth", "Brightgate Auth"),
  base("copperleaf-pay", "Copperleaf Pay"),
  base("ferrous-storage", "Ferrous Storage"),
  base("kettle-metrics", "Kettle Metrics"),
  base("larkspur-search", "Larkspur Search"),
  base("mossline-dns", "Mossline DNS"),
  { ...base("orbitly-push", "Orbitly Push"), kind: "rss" },
  base("quillpad-notes", "Quillpad Notes"),
  base("tidewater-queue", "Tidewater Queue"),
  base("driftwood-logs", "Driftwood Logs"),
  base("harbour-ci", "Harbour CI"),
  base("saltmarsh-mail", "Saltmarsh Mail"),
  base("thimble-chat", "Thimble Chat"),
  base("wicker-video", "Wicker Video"),
]

// Minor trouble: title, minutes since it started, the components it touches.
const MINOR: Record<string, [string, number, string[]]> = {
  "example-cdn": [
    "Slow cache purges in Europe",
    194,
    ["Edge cache", "Purge API"],
  ],
  "brightgate-auth": ["Delayed SSO logins for some workspaces", 38, ["SSO"]],
  "copperleaf-pay": ["Elevated payout latency", 412, ["Payouts"]],
  "ferrous-storage": [
    "Intermittent upload failures in us-east",
    75,
    ["Uploads", "Multipart API"],
  ],
  "kettle-metrics": [
    "Ingestion delays of up to 10 minutes",
    1630,
    ["Ingestion"],
  ],
  "larkspur-search": ["Search results may be stale", 22, ["Indexing"]],
  "mossline-dns": ["Propagation delays for new records", 263, ["DNS updates"]],
}

const record = (
  service: Service,
  fields: Partial<ServiceRecord>,
): ServiceRecord => ({
  id: service.id,
  name: service.name,
  url: service.url ?? "",
  kind: service.kind,
  fetched: "ok",
  indicator: "none",
  description: "All Systems Operational",
  components: [],
  active: [],
  recent: [],
  historyLoaded: false,
  historyFailed: false,
  note: "",
  ...fields,
})

const history = (
  id: string,
): { title: string; link: string; date: string }[] => [
  {
    title: "Delayed webhook delivery",
    link: `https://status.${id}.example.com/incidents/h1`,
    date: ago(3 * 24 * 60),
  },
  {
    title: "Elevated latency in the EU region",
    link: `https://status.${id}.example.com/incidents/h2`,
    date: ago(11 * 24 * 60),
  },
]

export const mockRecord = (service: Service, detail = false): ServiceRecord => {
  const recent = detail ? history(service.id) : []
  const flags = { historyLoaded: detail }
  switch (service.id) {
    case "acme-cloud":
      return record(service, {
        ...flags,
        indicator: "major",
        description: "Partial System Outage",
        components: [
          { name: "API", status: "major_outage" },
          { name: "Dashboard", status: "degraded_performance" },
          { name: "Webhooks", status: "operational" },
          { name: "Storage", status: "operational" },
        ],
        active: [
          {
            title: "Elevated API error rates",
            link: "https://status.acme-cloud.example.com/incidents/a1",
            date: ago(72),
            impact: "major",
          },
        ],
        recent,
      })
    case "orbitly-push":
      return record(service, {
        ...flags,
        indicator: "minor",
        description: "Posted 42m ago: Push delivery delayed on Android",
        recent: [
          {
            title: "Push delivery delayed on Android",
            link: "https://status.orbitly-push.example.com/p1",
            date: ago(42),
          },
          ...recent,
        ],
      })
    case "demo-maintenance":
      return record(service, {
        ...flags,
        indicator: "maintenance",
        description: "Scheduled maintenance in progress",
        components: [{ name: "Database", status: "under_maintenance" }],
        active: [
          {
            title: "Database engine upgrade",
            link: "https://status.demo-maintenance.example.com/incidents/w1",
            date: ago(25),
            impact: "maintenance",
          },
        ],
        recent,
      })
    case "demo-feed":
      return record(service, {
        ...flags,
        description: "Last post 3h ago",
        recent,
      })
    case "placeholder-mail":
      return record(service, {
        ...flags,
        fetched: "failed",
        indicator: "unknown",
        description: "Could not read the page (timed out)",
      })
    case "test-docs":
      return record(service, {
        ...flags,
        indicator: "link",
        description: "No machine-readable status",
        historyLoaded: false,
      })
    default:
      if (MINOR[service.id]) {
        const [title, minutes, hit] = MINOR[service.id]
        return record(service, {
          ...flags,
          indicator: "minor",
          description: "Partially Degraded Service",
          components: [
            ...hit.map((name) => ({ name, status: "degraded_performance" })),
            { name: "Dashboard", status: "operational" },
          ],
          active: [
            {
              title,
              link: `https://status.${service.id}.example.com/incidents/m1`,
              date: ago(minutes),
              impact: "minor",
            },
          ],
          recent,
        })
      }
      return record(service, {
        ...flags,
        components: [
          { name: "Install", status: "operational" },
          { name: "Search", status: "operational" },
        ],
        recent,
      })
  }
}
