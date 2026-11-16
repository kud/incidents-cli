import assert from "node:assert/strict"
import { describe, it } from "node:test"
import type { StyledLine } from "@kud/ink-ui"
import type { ServiceRecord } from "../src/core/index.js"
import { MOCK_SERVICES, mockRecord } from "../src/mock.js"
import { stripEscapes } from "../src/render.js"
import { historyLines, sectionsLines } from "../src/ui/detail.js"

const ago = (hours: number): string =>
  new Date(Date.now() - hours * 3_600_000).toISOString()

// What the line reads as: hyperlinks are escapes around their text.
const text = (line: StyledLine): string =>
  stripEscapes(line.spans ? line.spans.map((s) => s.text).join("") : line.text)

// A busy page: two open incidents, four hit components and 24 past incidents
// spread over two months, the shape that made the old flat list unreadable.
const busy: ServiceRecord = {
  id: "acme-cloud",
  name: "Acme Cloud",
  url: "https://status.acme-cloud.example.com",
  kind: "statuspage",
  fetched: "ok",
  indicator: "major",
  description: "Partial System Outage",
  components: [
    { name: "API", status: "major_outage" },
    { name: "Dashboard", status: "partial_outage" },
    { name: "Webhooks", status: "degraded_performance" },
    { name: "Storage", status: "operational" },
  ],
  active: [
    {
      title: "Elevated API error rates across every region",
      link: "https://status.acme-cloud.example.com/incidents/a1",
      date: ago(1),
      impact: "major",
    },
    {
      title: "Webhook delays",
      link: "https://status.acme-cloud.example.com/incidents/a2",
      date: ago(20),
      impact: "minor",
    },
  ],
  recent: Array.from({ length: 24 }, (_, i) => ({
    title: `Past incident number ${i + 1}`,
    link: `https://status.acme-cloud.example.com/incidents/h${i}`,
    date: ago(2 + i * 60),
  })),
  upcoming: [],
  historyLoaded: true,
  historyFailed: false,
  note: "",
}

describe("detail view", () => {
  it("stacks open incidents, affected components, then history", () => {
    const lines = sectionsLines(busy, 120).map(text)
    const at = (heading: RegExp) => lines.findIndex((l) => heading.test(l))
    assert.ok(at(/^ Open incidents\s+2$/) > 0)
    assert.ok(at(/^ Affected components\s+3$/) > at(/^ Open incidents/))
    assert.ok(at(/^ History\s+24$/) > at(/^ Affected components/))
  })

  it("starts every heading on the header's edge, rows two further in", () => {
    const lines = sectionsLines(busy, 120).map(text).filter(Boolean)
    const starts = new Set(lines.map((l) => l.length - l.trimStart().length))
    assert.deepEqual([...starts].sort(), [1, 3, 5])
  })

  it("gives the status page its own line, never cut", () => {
    const lines = sectionsLines(busy, 120).map(text)
    assert.equal(lines[1].trim(), "status.acme-cloud.example.com")
  })

  it("right-aligns every time to one edge, open and past alike", () => {
    const lines = sectionsLines(busy, 120).map(text)
    const timed = lines.filter((l) =>
      /(\d+[mhd]|ago|\d{1,2} \w{3,4}|\w{3,4} \d{1,2})$/.test(l),
    )
    assert.ok(timed.length >= 26)
    const edges = new Set(timed.map((l) => l.length))
    assert.equal(edges.size, 1, `edges: ${[...edges].join(", ")}`)
    assert.ok([...edges][0] <= 120)
  })

  it("names each period once rather than on every row", () => {
    const lines = historyLines(busy, 80).map(text)
    const labels = lines.filter((l) => /^ \S/.test(l))
    assert.ok(labels.length >= 2)
    assert.equal(new Set(labels).size, labels.length)
  })

  it("counts scheduled maintenance under the history, never dated as now", () => {
    const upcoming = Array.from({ length: 8 }, (_, i) => ({
      title: `ZZ${i} maintenance`,
      link: "",
      date: new Date(Date.now() + (i + 3) * 86_400_000).toISOString(),
    }))
    const lines = historyLines({ ...busy, upcoming }, 80).map(text)
    assert.ok(lines.every((l) => !/ZZ\d/.test(l)))
    assert.match(lines.at(-1) ?? "", /^ 8 upcoming maintenances$/)
    const empty = sectionsLines({ ...busy, recent: [], upcoming }, 120).map(
      text,
    )
    assert.ok(empty.some((l) => /No past incidents on record/.test(l)))
    assert.ok(empty.some((l) => /8 upcoming maintenances/.test(l)))
  })

  it("shows an undated incident with no age at all", () => {
    const recent = [{ title: "Undated incident", link: "", date: "" }]
    const row = historyLines({ ...busy, recent }, 80)
      .map(text)
      .find((l) => /Undated incident/.test(l))
    assert.equal(row?.trimEnd(), "   Undated incident")
  })

  it("groups the history pane under period headings", () => {
    const lines = historyLines(busy, 80).map(text)
    const rows = lines.filter((l) => /Past incident/.test(l))
    assert.equal(rows.length, 24)
    assert.ok(rows.every((l) => l.startsWith("   P") && l.length <= 80))
  })
})

describe("declared-status caveat", () => {
  const of = (id: string) =>
    sectionsLines(
      mockRecord(
        MOCK_SERVICES.find((s) => s.id === id)!,
        true,
      ),
      120,
    )
      .map(text)
      .join("\n")

  it("sits under an ok service's address", () => {
    assert.match(
      of("sample-registry"),
      /status\.sample-registry\.example\.com\n {1}Declared status only/,
    )
  })

  it("stays off a service in trouble", () => {
    assert.doesNotMatch(of("acme-cloud"), /Declared status only/)
  })
})

describe("detail vocabulary", () => {
  const acme = sectionsLines(
    mockRecord(
      MOCK_SERVICES.find((s) => s.id === "acme-cloud")!,
      true,
    ),
    120,
  ).map(text)

  it("gives every status word its glyph", () => {
    const out = acme.join("\n")
    assert.match(out, /● major {2}Partial System Outage/)
    assert.match(out, / {3}● major {5}Elevated API error rates/)
    assert.match(out, / {3}● outage {4}API/)
    assert.match(out, / {3}● degraded {2}Dashboard/)
  })

  it("counts the healthy rest under the components, indented", () => {
    const at = acme.findIndex((l) => /Dashboard/.test(l))
    assert.equal(acme[at + 1].trimEnd(), "   + 2 operational")
  })

  it("says a duration one way: started at, then for how long", () => {
    const out = acme.join("\n")
    assert.match(out, /started \d\d:\d\d · 1h 12m/)
    assert.doesNotMatch(out, /\bfor \d|since|going/)
  })
})
