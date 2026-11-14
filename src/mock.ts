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
  "example-cdn": ["Slow cache purges in Europe", 194, ["Edge cache"]],
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

// A busy page: one component in trouble among dozens of points of presence
// that are fine, the shape a large CDN's status page takes. Invented places.
const POPS = [
  "Ashmere",
  "Brackenford",
  "Caldwick",
  "Dunhollow",
  "Eastreach",
  "Fennimore",
  "Glasswater",
  "Harrowgate",
  "Ivybridge",
  "Juniper Bay",
  "Kestrel Point",
  "Larchmont",
  "Marrowby",
  "Northwold",
  "Oakhaven",
  "Pellmoor",
  "Quarry Hill",
  "Ravensholt",
  "Saltcombe",
  "Thornbury",
  "Underfell",
  "Valewood",
  "Westmarch",
  "Yarrowdale",
  "Amberley",
  "Birchcombe",
  "Coldharbour",
  "Dovecote",
  "Elmstead",
  "Foxley",
  "Greywell",
  "Hazelmere",
  "Inchcape",
  "Kingsfold",
  "Lowmoor",
  "Millbrook",
  "Nettlecombe",
  "Otterburn",
  "Pinewick",
  "Rushmere",
].map((place) => `${place} - (${place.slice(0, 3).toUpperCase()})`)
const BUSY = new Set(["example-cdn"])

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
  upcoming: [],
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

// A long record, for the detail page's scroll: forty past incidents spread
// over several months, so the history runs well past any terminal's height.
const LONG_TITLES = [
  "Delayed build starts on hosted runners",
  "Elevated error rates on artifact uploads",
  "Webhook deliveries delayed",
  "Degraded log streaming",
  "Scheduled pipelines not triggering",
  "Slow cache restores in eu-west",
  "Intermittent checkout failures",
  "Status checks not reported to pull requests",
  "Increased queue times for macOS runners",
  "Dashboard loading slowly",
]
const longHistory = (
  id: string,
): { title: string; link: string; date: string }[] =>
  Array.from({ length: 40 }, (_, i) => ({
    title: LONG_TITLES[(i * 3) % LONG_TITLES.length],
    link: `https://status.${id}.example.com/incidents/l${i + 1}`,
    date: ago(Math.round((i * 3.7 + 1.5) * 24 * 60)),
  }))
const LONG = new Set(["harbour-ci"])

export const mockRecord = (service: Service, detail = false): ServiceRecord => {
  const recent = !detail
    ? []
    : LONG.has(service.id)
      ? longHistory(service.id)
      : history(service.id)
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
            ...(BUSY.has(service.id)
              ? POPS.map((name) => ({ name, status: "operational" }))
              : []),
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

// A scenario for `watch --mock`: each poll moves one step, so services flip
// between polls. Step 0 is the plain fixture set; step 1 brings Sample
// Registry down and Placeholder Mail back; step 2 changes nothing; step 3
// eases the registry to minor, clears Acme Cloud and loses Placeholder Mail
// again; the next poll returns to step 0 and the cycle repeats.
const SCENARIO: Record<string, (service: Service) => ServiceRecord>[] = [
  {},
  {
    "sample-registry": (service) =>
      record(service, {
        indicator: "major",
        description: "Major Service Outage",
        components: [{ name: "Install", status: "major_outage" }],
        active: [
          {
            title: "Package installs failing",
            link: "https://status.sample-registry.example.com/incidents/r1",
            date: ago(2),
            impact: "major",
          },
        ],
      }),
    "placeholder-mail": (service) => record(service, {}),
  },
]
SCENARIO.push(SCENARIO[1], {
  "sample-registry": (service) =>
    record(service, {
      indicator: "minor",
      description: "Partially Degraded Service",
      components: [{ name: "Install", status: "degraded_performance" }],
      active: [
        {
          title: "Package installs recovering",
          link: "https://status.sample-registry.example.com/incidents/r1",
          date: ago(12),
          impact: "minor",
        },
      ],
    }),
  "acme-cloud": (service) =>
    record(service, { description: "All Systems Operational" }),
})

export const mockWatchRecord = (
  service: Service,
  poll: number,
): ServiceRecord => {
  const step = SCENARIO[poll % SCENARIO.length]
  return step[service.id]?.(service) ?? mockRecord(service)
}
