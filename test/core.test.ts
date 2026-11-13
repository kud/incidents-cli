import assert from "node:assert/strict"
import { describe, it } from "node:test"
import {
  ageOf,
  ConfigError,
  decodeUtf16,
  exitCode,
  fromAws,
  fromFeed,
  fromSlack,
  fromStatuspageIncidents,
  fromStatuspageSummary,
  mergeRegistry,
  parseRss,
  readAll,
  readService,
  resolveService,
  selectServices,
  splitUpcoming,
  worstFirst,
  type Indicator,
} from "../src/core/index.js"
import { fakeFetch, fixture, service } from "./helpers.js"

const rec = (name: string, indicator: Indicator) => ({ name, indicator })

describe("registry", () => {
  it("adds, overrides one field, and switches a service off", () => {
    const r = mergeRegistry(
      { a: { name: "A", kind: "statuspage" }, b: { name: "B", kind: "rss" } },
      {
        b: { enabled: false },
        c: { name: "C", kind: "link" },
        a: { url: "u" },
      },
    )
    assert.deepEqual(Object.keys(r).sort(), ["a", "c"])
    assert.equal(r.a.kind, "statuspage")
    assert.equal(r.a.url, "u")
  })

  it("resolves aliases case-insensitively and not unknown words", () => {
    const r = mergeRegistry({ github: { name: "GitHub", aliases: ["gh"] } })
    assert.equal(resolveService(r, "GH")?.id, "github")
    assert.equal(resolveService(r, "nope"), undefined)
  })

  it("takes the catalogue entry for a bare id and overrides fields on top", () => {
    const r = selectServices({
      github: {},
      aws: { regions: ["us-east-1"] },
    })
    assert.equal(r.github.url, "https://www.githubstatus.com")
    assert.deepEqual(r.aws.regions, ["us-east-1"])
    assert.equal(r.aws.kind, "aws")
  })

  it("defines a new service from a full entry and drops a disabled one", () => {
    const r = selectServices({
      acme: { name: "Acme", kind: "statuspage", url: "https://s.acme.example" },
      npm: { enabled: false },
    })
    assert.deepEqual(Object.keys(r), ["acme"])
  })

  it("rejects an unknown id with no kind, bad urls and missing feeds", () => {
    assert.throws(() => selectServices({ nope: {} }), ConfigError)
    assert.throws(
      () => selectServices({ x: { kind: "statuspage", url: "http://x" } }),
      /https url/,
    )
    assert.throws(
      () => selectServices({ x: { kind: "rss", url: "https://x" } }),
      /needs a feed/,
    )
  })

  it("rejects reserved words as an id or an alias", () => {
    assert.throws(() => selectServices({ list: {} }), /reserved/)
    assert.throws(() => selectServices({ watch: {} }), /reserved/)
    assert.throws(
      () =>
        selectServices({
          github: { aliases: ["services"] },
        }),
      /reserved/,
    )
  })

  it("every catalogue entry is a valid service", () => {
    const ids = [
      "github",
      "claude",
      "openai",
      "vercel",
      "cloudflare",
      "npm",
      "docker",
      "figma",
      "linear",
      "notion",
      "gandi",
      "todoist",
      "bluesky",
      "jira",
      "confluence",
      "bitbucket",
      "sentry",
      "harness",
      "datadog",
      "slack",
      "aws",
    ]
    const r = selectServices(Object.fromEntries(ids.map((id) => [id, {}])))
    assert.deepEqual(Object.keys(r).sort(), [...ids].sort())
  })
})

describe("adapters", () => {
  it("statuspage drops group rows and the Visit pseudo-component", () => {
    const r = fromStatuspageSummary(
      JSON.parse(fixture("summary-degraded.json")),
    )
    assert.equal(r.indicator, "minor")
    assert.deepEqual(
      r.components?.map((c) => c.name),
      ["API", "Dashboard"],
    )
    assert.equal(r.active?.[0].title, "Elevated API errors")
  })

  const now = Date.parse("2026-11-13T12:00:00Z")

  it("a feed post inside the window reads as minor", () => {
    const items = [
      { title: "Outage", link: "", date: "Fri, 13 Nov 2026 10:00:00 GMT" },
    ]
    assert.equal(fromFeed(items, { now }).indicator, "minor")
  })

  it("a feed post outside the window reads as clear", () => {
    const items = [
      { title: "Old", link: "", date: "Mon, 09 Nov 2026 10:00:00 GMT" },
    ]
    assert.equal(fromFeed(items, { now }).indicator, "none")
  })

  it("an undated feed is unknown, never clear", () => {
    const items = [{ title: "X", link: "", date: "garbage" }]
    assert.equal(fromFeed(items, { now }).indicator, "unknown")
  })

  it("a feed in any order is judged by its newest post", () => {
    const items = parseRss(fixture("history.rss"))
    assert.equal(items[0].title, "Older incident")
    const recent = fromFeed(items, { now: Date.parse("2026-11-12T12:00:00Z") })
    assert.equal(recent.indicator, "minor")
    assert.match(recent.description ?? "", /Newest incident/)
  })

  it("splits future-dated items off, keeping undated ones as history", () => {
    const now = Date.parse("2026-11-13T12:00:00Z")
    const { past, upcoming } = splitUpcoming(
      [
        { title: "Later", link: "", date: "Tue, 24 Nov 2026 18:00:00 +0000" },
        { title: "Done", link: "", date: "Thu, 12 Nov 2026 10:00:00 GMT" },
        { title: "Undated", link: "", date: "" },
        { title: "Sooner", link: "", date: "Mon, 16 Nov 2026 08:00:00 +0000" },
      ],
      now,
    )
    assert.deepEqual(
      past.map((i) => i.title),
      ["Done", "Undated"],
    )
    assert.deepEqual(
      upcoming.map((i) => i.title),
      ["Sooner", "Later"],
    )
  })

  it("statuspage incidents take their start, then their creation", () => {
    const items = fromStatuspageIncidents(
      JSON.parse(fixture("incidents.json")),
      "https://status.acme.example",
    )
    assert.deepEqual(
      items.map((i) => i.date),
      [
        "2026-01-01T10:00:00Z",
        "2025-12-30T13:54:00Z",
        "2025-12-28T22:39:00Z",
        "",
      ],
    )
  })

  it("a date ahead of now has no age, a missing one neither", () => {
    const now = Date.parse("2026-11-13T12:00:00Z")
    assert.equal(ageOf("2026-11-24T18:00:00Z", now), "")
    assert.equal(ageOf("", now), "")
    assert.equal(ageOf("2026-11-13T12:00:30Z", now), "1m")
    assert.equal(ageOf("2026-11-13T10:00:00Z", now), "2h")
  })

  it("rss items unwrap CDATA", () => {
    const items = parseRss(
      "<rss><item><title><![CDATA[A & B]]></title><link>l</link><pubDate>d</pubDate></item></rss>",
    )
    assert.equal(items[0].title, "A & B")
    assert.equal(items[0].link, "l")
  })

  it("slack ok is clear and takes its worst active incident", () => {
    assert.equal(
      fromSlack({ status: "ok", active_incidents: [] }).indicator,
      "none",
    )
    const r = fromSlack({
      status: "active",
      active_incidents: [
        { type: "incident", title: "Slow", services: ["Messaging"] },
        { type: "outage", title: "Down", services: ["Calls"] },
      ],
    })
    assert.equal(r.indicator, "major")
  })

  it("aws takes the newest log status and narrows by region", () => {
    const events = JSON.parse(fixture("aws-events.json"))
    assert.equal(fromAws(events).indicator, "major")
    assert.equal(fromAws(events, { regions: ["eu-west-1"] }).indicator, "minor")
    assert.equal(fromAws(events, { regions: ["us-east-1"] }).indicator, "none")
  })

  it("decodes the UTF-16 feed with a byte-order mark", () => {
    const body = Buffer.concat([
      Buffer.from([0xff, 0xfe]),
      Buffer.from(fixture("aws-events.json"), "utf16le"),
    ])
    const text = decodeUtf16(
      body.buffer.slice(body.byteOffset, body.byteOffset + body.length),
    )
    assert.equal(JSON.parse(text).length, 2)
  })
})

describe("unknown is not green", () => {
  it("a service the engine cannot read is unknown", async () => {
    const r = await readService({ ...service(), kind: "nonsense" as never })
    assert.equal(r.indicator, "unknown")
  })

  it("a failed fetch is unknown and exits 1", async () => {
    const r = await readService(service(), {
      fetch: fakeFetch({
        "https://status.acme.example/api/v2/summary.json": {
          status: 503,
          body: "",
        },
      }),
    })
    assert.equal(r.indicator, "unknown")
    assert.equal(r.fetched, "failed")
    assert.equal(exitCode([r]), 1)
  })

  it("sorts worst first with unknown above minor and links last", () => {
    const sorted = worstFirst([
      rec("Fine", "none"),
      rec("Link", "link"),
      rec("Gone", "unknown"),
      rec("Slow", "minor"),
      rec("Down", "major"),
    ])
    assert.deepEqual(
      sorted.map((r) => r.name),
      ["Down", "Gone", "Slow", "Fine", "Link"],
    )
  })

  it("exit code is 0 for clear, link-only and maintenance, 1 otherwise", () => {
    assert.equal(
      exitCode([
        rec("a", "none"),
        rec("b", "link"),
        rec("c", "maintenance"),
      ] as never),
      0,
    )
    assert.equal(exitCode([rec("a", "none"), rec("b", "unknown")] as never), 1)
  })
})

describe("reading", () => {
  const base = "https://status.acme.example"
  const summary = { status: 200, body: fixture("summary-degraded.json") }

  it("sends the user agent it is given", async () => {
    let seen = ""
    const spy: typeof fetch = (async (_url: unknown, init?: RequestInit) => {
      seen = new Headers(init?.headers).get("user-agent") ?? ""
      return new Response(summary.body)
    }) as typeof fetch
    await readService(service(), {
      fetch: spy,
      userAgent: "incidents-cli/9.9.9",
    })
    assert.equal(seen, "incidents-cli/9.9.9")
  })

  // A page that schedules a lot of maintenance: its RSS feed is all future
  // windows dated by their start, and its past incidents only in the API.
  const maintenancePage = (over: Record<string, unknown> = {}) =>
    fakeFetch({
      [`${base}/api/v2/summary.json`]: summary,
      [`${base}/api/v2/incidents.json`]: { body: fixture("incidents.json") },
      [`${base}/history.rss`]: { body: fixture("maintenance-history.rss") },
      ...over,
    })

  it("fetches history only on detail, newest first", async () => {
    const f = maintenancePage()
    const overview = await readService(service(), { fetch: f })
    assert.equal(overview.historyLoaded, false)
    assert.equal(overview.recent.length, 0)
    assert.equal(overview.upcoming.length, 0)
    const detail = await readService(service(), { fetch: f, detail: true })
    assert.equal(detail.historyLoaded, true)
    assert.deepEqual(
      detail.recent.map((i) => i.title),
      [
        "Elevated API errors",
        "Slow worker start-up",
        "Queue delays in one region",
        "Dashboard login loop",
      ],
    )
  })

  it("keeps scheduled maintenance out of history, counted apart", async () => {
    const detail = await readService(service(), {
      fetch: maintenancePage(),
      detail: true,
    })
    assert.ok(detail.recent.every((i) => !/^ZZ/.test(i.title)))
    assert.ok(detail.recent.every((i) => !(Date.parse(i.date) > Date.now())))
    assert.deepEqual(
      detail.upcoming.map((i) => i.title),
      [
        "ZZC (Gammaford) on 2099-11-17",
        "ZZB (Betatown) on 2099-11-23",
        "ZZA (Alphaville) on 2099-11-24",
      ],
    )
  })

  it("dates an incident by its start, never by now", async () => {
    const detail = await readService(service(), {
      fetch: maintenancePage(),
      detail: true,
    })
    const by = Object.fromEntries(detail.recent.map((i) => [i.title, i]))
    assert.equal(by["Slow worker start-up"].date, "2025-12-30T13:54:00Z")
    assert.equal(by["Queue delays in one region"].date, "2025-12-28T22:39:00Z")
    assert.equal(by["Dashboard login loop"].date, "")
    assert.equal(ageOf(by["Dashboard login loop"].date), "")
    assert.equal(by["Slow worker start-up"].link, `${base}/incidents/i3`)
  })

  it("flags a failed history read instead of swallowing it", async () => {
    const detail = await readService(service(), {
      detail: true,
      fetch: maintenancePage({
        [`${base}/api/v2/incidents.json`]: { status: 500, body: "" },
      }),
    })
    assert.equal(detail.fetched, "ok")
    assert.equal(detail.historyFailed, true)
    assert.deepEqual(detail.recent, [])
    assert.equal(detail.upcoming.length, 3)
  })

  it("an unreadable feed costs the maintenance count, not the history", async () => {
    const detail = await readService(service(), {
      detail: true,
      fetch: maintenancePage({
        [`${base}/history.rss`]: { status: 500, body: "" },
      }),
    })
    assert.equal(detail.historyFailed, false)
    assert.equal(detail.recent.length, 4)
    assert.deepEqual(detail.upcoming, [])
  })

  it("a plain feed of scheduled windows is not a fresh post", async () => {
    const feed = "https://feed.acme.example/rss"
    const detail = await readService(service({ kind: "rss", feed }), {
      fetch: fakeFetch({
        [feed]: { body: fixture("maintenance-history.rss") },
      }),
    })
    assert.equal(detail.indicator, "none")
    assert.deepEqual(detail.recent, [])
    assert.equal(detail.upcoming.length, 3)
  })

  it("reports each record as it lands, in the order they answer", async () => {
    const order: string[] = []
    const f = fakeFetch({
      "https://slow.example/api/v2/summary.json": summary,
      "https://fast.example/api/v2/summary.json": summary,
    })
    const delayed: typeof fetch = (async (
      url: RequestInfo | URL,
      init?: RequestInit,
    ) => {
      if (String(url).startsWith("https://slow"))
        await new Promise((r) => setTimeout(r, 40))
      return f(url, init)
    }) as typeof fetch
    const all = await readAll(
      [
        service({ id: "slow", url: "https://slow.example" }),
        service({ id: "fast", url: "https://fast.example" }),
      ],
      { fetch: delayed, onRecord: (r) => order.push(r.id) },
    )
    assert.deepEqual(order, ["fast", "slow"])
    assert.deepEqual(
      all.map((r) => r.id),
      ["slow", "fast"],
    )
  })

  it("aborts a read in flight without reporting records", async () => {
    const controller = new AbortController()
    const hang: typeof fetch = ((_url: unknown, init?: RequestInit) =>
      new Promise((_resolve, reject) =>
        init?.signal?.addEventListener("abort", () =>
          reject(init.signal?.reason),
        ),
      )) as typeof fetch
    const seen: string[] = []
    const pending = readAll([service()], {
      fetch: hang,
      signal: controller.signal,
      onRecord: (r) => seen.push(r.id),
    })
    controller.abort()
    await assert.rejects(pending)
    assert.deepEqual(seen, [])
  })

  it("times out a hanging page as unknown", async () => {
    // A real hanging socket keeps the event loop alive; AbortSignal.timeout's
    // timer is unref'd, so the fake has to hold a ref of its own.
    const hang: typeof fetch = ((_url: unknown, init?: RequestInit) =>
      new Promise((_resolve, reject) => {
        const socket = setInterval(() => {}, 1000)
        init?.signal?.addEventListener("abort", () => {
          clearInterval(socket)
          reject(init.signal?.reason)
        })
      })) as typeof fetch
    const r = await readService(service(), { fetch: hang, timeout: 20 })
    assert.equal(r.indicator, "unknown")
    assert.match(r.description, /timed out/)
  })
})
