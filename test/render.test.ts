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

  it("writes severity as a word, worst first", () => {
    const order = lines
      .filter((l) => /●|◌|\?|→/.test(l))
      .map((l) => l.trim().split(/\s{2,}/)[1])
    assert.deepEqual(order.slice(0, 3), [
      "Acme Cloud",
      "Placeholder Mail",
      "Example CDN",
    ])
    assert.match(out, /● major\s+Acme Cloud/)
    assert.match(out, /\? unreadable\s+Placeholder Mail/)
    assert.match(out, /◌ maintenance/)
  })

  it("says what a healthy, a quiet and a link row know", () => {
    assert.match(out, /● ok\s+Sample Registry\s+operational/)
    assert.match(out, /Demo Feed\s+quiet · last post 3h ago/)
    assert.match(out, /→ manual\s+Test Docs\s+no feed, open the page/)
  })

  it("carries the declared-status footer and an optional note", () => {
    assert.match(
      out,
      /Declared status only: green is not proof your calls work\./,
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

  it("lists broken components and active incidents together", () => {
    assert.match(out, /outage\s+API\s+now/)
    assert.match(out, /degraded\s+Dashboard\s+now/)
    assert.match(out, /major\s+Elevated API error rates\s+since 1h 12m/)
    assert.equal(out.includes("Webhooks"), false)
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
