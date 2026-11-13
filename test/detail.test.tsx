import assert from "node:assert/strict"
import { describe, it } from "node:test"
import type { StyledLine } from "@kud/ink-ui"
import type { ServiceRecord } from "../src/core/index.js"
import { historyLines, sectionsLines } from "../src/ui/detail.js"

const ago = (hours: number): string =>
  new Date(Date.now() - hours * 3_600_000).toISOString()

const text = (line: StyledLine): string =>
  line.spans ? line.spans.map((s) => s.text).join("") : line.text

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
      /(for \d+[mhd]|ago|\d{1,2} \w{3,4}|\w{3,4} \d{1,2})$/.test(l),
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

  it("groups the history pane under period headings", () => {
    const lines = historyLines(busy, 80).map(text)
    const rows = lines.filter((l) => /Past incident/.test(l))
    assert.equal(rows.length, 24)
    assert.ok(rows.every((l) => l.startsWith("   P") && l.length <= 80))
  })
})
