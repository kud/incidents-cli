import assert from "node:assert/strict"
import { describe, it } from "node:test"
import { MOCK_SERVICES, mockRecord } from "../src/mock.js"
import {
  BAR_MAX,
  FILTER_FULL,
  FILTER_SLIM,
  barCells,
  filterWidth,
  filterCounts,
  hiddenLine,
  hiddenParts,
  narrow,
  navOrder,
  runBreaks,
  searchRows,
  type Row,
} from "../src/ui/overview-model.js"

const rows: Row[] = MOCK_SERVICES.map((service) => ({
  service,
  record: mockRecord(service),
}))
const names = (list: Row[]) => list.map((r) => r.service.name)

describe("overview filters", () => {
  it("counts every tab over the mock", () => {
    assert.deepEqual(filterCounts(rows), {
      all: 21,
      trouble: 10,
      major: 1,
      minor: 8,
      unknown: 1,
      maintenance: 1,
      none: 9,
      link: 1,
    })
  })

  it("leaves pending services in All only", () => {
    const pending = [...rows.slice(0, 20), { service: MOCK_SERVICES[20] }]
    const counts = filterCounts(pending)
    assert.equal(counts.all, 21)
    assert.equal(counts.none, 8)
  })

  it("names what each step hid and the key that brings it back", () => {
    const n = narrow(rows, { filter: "trouble", folded: true, term: null })
    assert.equal(n.rows.length, 10)
    assert.deepEqual(n.hidden, { search: 0, tab: 11, folded: 0 })
    assert.equal(
      hiddenLine(hiddenParts(n.hidden, { filter: "trouble", term: null })),
      "11 outside Trouble · tab filters",
    )
    const folded = narrow(rows, { filter: "all", folded: true, term: null })
    assert.equal(folded.rows.length, 12)
    assert.equal(
      hiddenLine(hiddenParts(folded.hidden, { filter: "all", term: null })),
      "9 operational hidden · z show",
    )
  })

  it("says nothing when nothing is hidden", () => {
    const n = narrow(rows, { filter: "all", folded: false, term: null })
    assert.deepEqual(hiddenParts(n.hidden, { filter: "all", term: null }), [])
  })

  it("search narrows on names and aliases, and the counts follow it", () => {
    assert.deepEqual(names(searchRows(rows, "kettle")), ["Kettle Metrics"])
    assert.deepEqual(names(searchRows(rows, "feed")), ["Demo Feed"])
    assert.equal(searchRows(rows, "  ").length, 21)
    const n = narrow(rows, { filter: "all", folded: false, term: "kettle" })
    assert.equal(n.counts.minor, 1)
    assert.equal(n.counts.none, 0)
    assert.equal(
      hiddenLine(hiddenParts(n.hidden, { filter: "all", term: "kettle" })),
      "20 not matching “kettle” · esc clear",
    )
  })

  it("the board walks its cards before the grid", () => {
    const order = names(navOrder("board", rows))
    assert.ok(order.indexOf("Demo Maintenance") < order.indexOf("Demo Feed"))
    assert.ok(order.indexOf("Wicker Video") > order.indexOf("Mossline DNS"))
  })

  it("breaks between severity runs only once sorted", () => {
    assert.equal(runBreaks(rows, false).size, 0)
    assert.ok(runBreaks(rows, true).size > 0)
    assert.equal(runBreaks(rows, true, "name").size, 0)
  })
})

describe("filter column", () => {
  it("reads in full from 160 columns and collapses below", () => {
    assert.equal(filterWidth(200), FILTER_FULL)
    assert.equal(filterWidth(160), FILTER_FULL)
    assert.equal(filterWidth(159), FILTER_SLIM)
    assert.equal(filterWidth(120), FILTER_SLIM)
    assert.equal(FILTER_SLIM, 8)
    assert.equal(FILTER_FULL, 28)
  })

  it("sizes each bar to its share of every service", () => {
    assert.equal(barCells(21, 21, "none"), BAR_MAX)
    assert.equal(barCells(14, 21, "none"), 5)
    assert.equal(barCells(3, 21, "trouble"), 1)
  })

  it("keeps a single service visible and draws nothing for empty or All", () => {
    assert.equal(barCells(1, 200, "major"), 1)
    assert.equal(barCells(0, 21, "major"), 0)
    assert.equal(barCells(21, 21, "all"), 0)
    assert.equal(barCells(5, 0, "minor"), 0)
  })
})
