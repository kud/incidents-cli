import assert from "node:assert/strict"
import { describe, it } from "node:test"
import { stripVTControlCharacters } from "node:util"
import { render } from "ink-testing-library"
import { MOCK_SERVICES, mockRecord } from "../src/mock.js"
import { Header, fitHeader } from "../src/ui/frame.js"
import { overviewSegments } from "../src/ui/header.js"

const records = MOCK_SERVICES.map((s) => mockRecord(s))
const at = new Date(2026, 0, 1, 14, 35)
const segments = overviewSegments({
  records,
  total: records.length,
  sort: "status",
  loading: false,
  at,
})
const BRAND = "◆ Incidents"

const line = (width: number, crumb?: string) => {
  const { lastFrame, unmount } = render(
    <Header brand={BRAND} crumb={crumb} segments={segments} width={width} />,
  )
  const out = stripVTControlCharacters(lastFrame() ?? "")
  unmount()
  return out.trimEnd()
}

describe("header", () => {
  it("leads with the answer, unreadable apart from trouble, · between pairs", () => {
    const texts = segments.map((s) => s.text)
    assert.deepEqual(texts.slice(0, 4), [
      "9 in trouble",
      "1 unreadable",
      "21 services",
      "by status ↓",
    ])
    assert.match(texts[4], /^updated \d\d:\d\d/)
    assert.match(
      line(100),
      /^ ◆ Incidents · 9 in trouble · 1 unreadable · 21 services · by status ↓ · updated \S+ {2}╌{4,}/,
    )
  })

  it("drops the rule first, then the sort, then the time", () => {
    const room = (w: number) => fitHeader(BRAND, segments, w)
    const full =
      BRAND.length + segments.reduce((n, s) => n + 3 + s.text.length, 0)
    assert.ok(room(full + 6).rule > 0)
    assert.equal(room(full + 5).rule, 0)
    assert.equal(room(full).segments.length, 5)
    const noSort = room(full - 1).segments.map((s) => s.text)
    assert.ok(!noSort.includes("by status ↓"))
    assert.ok(noSort.some((t) => t.startsWith("updated")))
    const noTime = room(full - 15).segments.map((s) => s.text)
    assert.deepEqual(noTime, ["9 in trouble", "1 unreadable", "21 services"])
  })

  it("never cuts the product name, however short the terminal", () => {
    for (const width of [80, 60, 40, 24, 16])
      assert.match(line(width), /^ ◆ Incidents/, `${width} columns`)
    assert.doesNotMatch(line(80), /╌/)
    assert.doesNotMatch(line(80), /by status/)
  })

  it("says all clear when nothing is in trouble or unreadable", () => {
    const clear = overviewSegments({
      records: records.filter((r) => r.indicator === "none"),
      total: 9,
      sort: "name",
      loading: false,
      at,
    })
    assert.equal(clear[0].text, "all clear")
    assert.equal(clear[2].text, "by name")
  })

  it("reads as a breadcrumb on a service's page", () => {
    const { lastFrame, unmount } = render(
      <Header
        brand={BRAND}
        crumb="Acme Cloud"
        segments={[{ text: "updated 14:36" }]}
        width={120}
      />,
    )
    const out = stripVTControlCharacters(lastFrame() ?? "")
    unmount()
    assert.match(out, /^ ◆ Incidents › Acme Cloud · updated 14:36 {2}╌+/)
  })
})
