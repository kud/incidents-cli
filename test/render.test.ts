import assert from "node:assert/strict"
import { describe, it } from "node:test"
import { mockRecord, MOCK_SERVICES } from "../src/mock.js"
import { renderDetail, renderOverview, stripEscapes } from "../src/render.js"

const plain = { color: false, links: false }
const records = MOCK_SERVICES.map((s) => mockRecord(s))
const byId = (id: string) =>
  mockRecord(
    MOCK_SERVICES.find((s) => s.id === id)!,
    true,
  )

describe("overview", () => {
  const out = renderOverview(records, plain)
  const lines = out.split("\n")

  it("reads as a TUI row: name, status, age, headline, worst first", () => {
    const order = lines
      .filter((l) => /●|◌|\?|↗/.test(l))
      .map((l) => l.trim().split(/\s{2,}/)[0])
    assert.deepEqual(order.slice(0, 3), [
      "Acme Cloud",
      "Placeholder Mail",
      "Brightgate Auth",
    ])
    assert.match(
      out,
      /Acme Cloud\s+● major\s+1h 12m {2}Elevated API error rates/,
    )
    assert.match(out, /Placeholder Mail\s+\? unreadable\s+Could not read/)
    assert.match(out, /Demo Maintenance\s+◌ maintenance\s+25m {2}Database/)
    // Ages right-aligned to one edge.
    const ends = lines.flatMap((l) => {
      const m = /(\d+[mhd]) {2}\S/.exec(l)
      return m ? [m.index + m[1].length] : []
    })
    assert.ok(ends.length >= 10)
    assert.equal(new Set(ends).size, 1, out)
    assert.doesNotMatch(out, /\bfor \d|Status\s+Service/)
  })

  it("says what a healthy, a quiet and a link row know", () => {
    assert.match(out, /Sample Registry\s+● ok\s*$/m)
    assert.match(out, /Demo Feed\s+● ok\s+quiet · last post 3h ago/)
    assert.match(out, /Test Docs\s+↗ manual\s+no feed, open the page/)
  })

  it("carries the declared-status footer and the hint on lines of their own", () => {
    assert.match(
      out,
      /^ {2}Declared status only: green is not proof your calls work\.$/m,
    )
    assert.match(out, /^ {2}incidents list <service> for detail\.$/m)
    assert.ok(
      renderOverview(records, { color: true, links: false }).includes(
        "\u001b[1mincidents list <service>\u001b[22m",
      ),
    )
    assert.match(
      renderOverview(records, { ...plain, note: "No config at ~/x" }),
      /No config at ~\/x/,
    )
  })

  it("emits no escape codes when colour is off", () => {
    assert.equal(out.includes("\u001B"), false)
  })

  it("wraps names in hyperlinks only when asked, without breaking alignment", () => {
    const linked = renderOverview(records, { color: true, links: true })
    assert.ok(
      linked.includes(
        `${String.fromCharCode(27)}]8;;https://status.acme-cloud.example.com`,
      ),
    )
    const stripped = stripEscapes(linked)
    assert.equal(stripped, out)
  })
})

describe("detail", () => {
  const out = renderDetail(byId("acme-cloud"), { ...plain, now: Date.now() })

  it("names the service first, then incidents and components as two tables", () => {
    assert.match(out, /^ {2}Acme Cloud$/m)
    assert.match(out, /Status\s+Open incident\s+For/)
    assert.match(out, /● major\s+Elevated API error rates\s+1h 12m/)
    assert.match(out, /Status\s+Component/)
    assert.match(out, /● outage\s+API/)
    assert.match(out, /● degraded\s+Dashboard\n {2}\+ 2 operational/)
    assert.equal(out.includes("Webhooks"), false)
    assert.doesNotMatch(out, /since|\bnow\b/)
  })

  it("keeps history apart and never repeats an active incident in it", () => {
    assert.match(out, /Earlier\s+When/)
    assert.match(out, /Delayed webhook delivery\s+3d ago/)
    const rec = byId("acme-cloud")
    rec.recent.push({ ...rec.active[0], date: rec.active[0].date })
    const again = renderDetail(rec, plain)
    assert.equal(again.match(/Elevated API error rates/g)?.length, 1)
  })

  it("counts healthy components when nothing is broken", () => {
    assert.match(
      renderDetail(byId("sample-registry"), plain),
      /2 components operational/,
    )
  })

  it("says so when the history feed could not be read", () => {
    const rec = { ...byId("sample-registry"), historyFailed: true, recent: [] }
    assert.match(renderDetail(rec, plain), /History unavailable/)
  })
})
