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
]

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
    case "example-cdn":
      return record(service, {
        ...flags,
        indicator: "minor",
        description: "Minor Service Outage",
        components: [{ name: "Edge cache", status: "degraded_performance" }],
        recent,
      })
    case "demo-maintenance":
      return record(service, {
        ...flags,
        indicator: "maintenance",
        description: "Scheduled maintenance in progress",
        components: [{ name: "Database", status: "under_maintenance" }],
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
