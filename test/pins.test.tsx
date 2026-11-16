import assert from "node:assert/strict"
import { mkdtempSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { describe, it } from "node:test"
import { stripVTControlCharacters } from "node:util"
import { render } from "ink"
import { App } from "../src/ui/app.js"
import { ConfigError, selectServices } from "../src/core/index.js"
import { MOCK_SERVICES, mockRecord } from "../src/mock.js"
import { mockSource } from "../src/source.js"
import { fileState, type Pins, type ViewState } from "../src/state.js"
import {
  boardGroups,
  narrow,
  pinFirst,
  pinnedIds,
  runBreaks,
  type Row,
} from "../src/ui/overview-model.js"
import { terminal } from "./helpers.js"

const tick = (ms = 40) => new Promise((r) => setTimeout(r, ms))
const until = async (frame: () => string, pattern: RegExp) => {
  for (let waited = 0; waited < 3000 && !pattern.test(frame()); waited += 20)
    await tick(20)
  return frame()
}
const none: Pins = { set: {}, order: [] }
const rows: Row[] = MOCK_SERVICES.map((service) => ({
  service,
  record: mockRecord(service),
}))
const ids = (rs: Row[]) => rs.map((r) => r.service.id)

// Sample Registry is ok, Brightgate Auth minor, Acme Cloud major.
const OK = "sample-registry"
const MINOR = "brightgate-auth"
const MAJOR = "acme-cloud"

describe("which services are pinned", () => {
  const services = MOCK_SERVICES.map((s) =>
    [OK, MINOR].includes(s.id) ? { ...s, pinned: true } : s,
  )

  it("takes the config's, in config order, then toggles in toggle order", () => {
    assert.deepEqual(pinnedIds(services, none), [OK, MINOR])
    assert.deepEqual(
      pinnedIds(services, {
        set: { [MAJOR]: true, "test-docs": true },
        order: ["test-docs", MAJOR],
      }),
      [OK, MINOR, "test-docs", MAJOR],
    )
  })

  it("lets a toggle override the config until it is toggled again", () => {
    assert.deepEqual(pinnedIds(services, { set: { [OK]: false }, order: [] }), [
      MINOR,
    ])
    assert.deepEqual(
      pinnedIds(services, { set: { [OK]: true }, order: [OK] }),
      [OK, MINOR],
    )
  })

  it("refuses a config value that is not true or false", () => {
    assert.throws(
      () =>
        selectServices({
          acme: {
            name: "Acme",
            kind: "link",
            url: "https://status.acme.example",
            pinned: "yes",
          },
        }),
      (e: unknown) =>
        e instanceof ConfigError && /pinned must be/.test(e.message),
    )
  })
})

describe("the pinned group", () => {
  const pinned = pinFirst(rows, [OK, MINOR, MAJOR], true)

  it("comes first, worst status first, then pin order", () => {
    assert.deepEqual(ids(pinned).slice(0, 3), [MAJOR, MINOR, OK])
    assert.ok(pinned.slice(0, 3).every((r) => r.pinned))
    assert.ok(!pinned.slice(3).some((r) => r.pinned))
    // Until the sort lands, pin order alone.
    assert.deepEqual(ids(pinFirst(rows, [OK, MAJOR], false)).slice(0, 2), [
      OK,
      MAJOR,
    ])
  })

  it("is shown once: on the board a group of its own, every pin a card", () => {
    const groups = boardGroups(pinned, true)
    assert.deepEqual(ids(groups.pinned), [MAJOR, MINOR, OK])
    for (const g of [groups.cards, groups.strip, groups.manual])
      assert.ok(!g.some((r) => r.pinned))
  })

  it("all and trouble keep it whole; a status filter is strict", () => {
    const shown = (filter: "all" | "trouble" | "minor" | "none") =>
      ids(narrow(pinned, { filter, folded: false, term: null }).rows)
    assert.deepEqual(shown("all").slice(0, 3), [MAJOR, MINOR, OK])
    assert.deepEqual(shown("trouble").slice(0, 3), [MAJOR, MINOR, OK])
    // A pin shows under a status only when it matches, still first.
    assert.equal(shown("minor")[0], MINOR)
    assert.ok(!shown("minor").includes(OK))
    assert.equal(shown("none")[0], OK)
  })

  it("never folds a pin with z", () => {
    const folded = ids(
      narrow(pinned, { filter: "all", folded: true, term: null }).rows,
    )
    assert.ok(folded.includes(OK))
    assert.ok(!folded.includes("harbour-ci"))
  })

  it("is set apart by a break, in either order", () => {
    assert.ok(runBreaks(pinned, true, "status").has(3))
    assert.ok(runBreaks(pinned, true, "name").has(3))
  })
})

describe("pins remembered", () => {
  it("are saved beside the view and read back; anything else is ignored", () => {
    const path = join(mkdtempSync(join(tmpdir(), "incidents-pins-")), "s.json")
    const state = fileState(path)
    assert.deepEqual(state.loadPins(), none)
    state.save("board")
    state.savePins({ set: { [OK]: true }, order: [OK] })
    assert.equal(state.load(), "board")
    assert.deepEqual(state.loadPins(), { set: { [OK]: true }, order: [OK] })
    writeFileSync(
      path,
      '{"pins":{"set":{"a":"yes","b":false},"order":[1,"b"]}}',
    )
    assert.deepEqual(state.loadPins(), { set: { b: false }, order: ["b"] })
  })
})

describe("pinning in the app", () => {
  const open = (view: "list" | "board", pinnedInConfig: string[] = []) => {
    const saved: Pins[] = []
    const state: ViewState = {
      load: () => undefined,
      save: () => undefined,
      loadPins: () => none,
      savePins: (p) => saved.push(p),
    }
    const base = mockSource(2)
    const source = {
      ...base,
      view,
      state,
      services: base.services.map((s) =>
        pinnedInConfig.includes(s.id) ? { ...s, pinned: true } : s,
      ),
    }
    const { stdout, stdin } = terminal(160, 60)
    const app = render(<App source={source} />, {
      stdout: stdout as unknown as NodeJS.WriteStream,
      stdin: stdin as unknown as NodeJS.ReadStream,
      debug: true,
      patchConsole: false,
      exitOnCtrlC: false,
    })
    return {
      app,
      stdin,
      saved,
      frame: () => stripVTControlCharacters(stdout.frame),
    }
  }

  it("list: a Pinned heading leads, each pin marked with ◆", async () => {
    const { app, frame } = open("list", [OK])
    const done = await until(frame, /updated/)
    app.unmount()
    const lines = done.split("\n")
    const head = lines.findIndex((l) => /│ {4}Pinned {2}1/.test(l))
    assert.ok(head > 0, done)
    assert.match(lines[head + 1], /◆ Sample Registry/)
    // Shown once: not again further down.
    assert.equal(done.split("Sample Registry").length - 1, 2, done)
  })

  it("board: an ok pin is a card under its heading, not in the strip", async () => {
    const { app, frame } = open("board", [OK])
    const done = await until(frame, /updated/)
    app.unmount()
    assert.match(done, /Pinned {2}1/)
    assert.match(done, /[│┃] (❯ )?◆ Sample Registry\s+\S*ok\S* [│┃]/, done)
  })

  it("p pins the selected service, says so, and remembers; p again unpins", async () => {
    const { app, stdin, frame, saved } = open("list")
    await until(frame, /updated/)
    stdin.press("j")
    await tick()
    stdin.press("p")
    const pinned = await until(frame, /Pinned Placeholder Mail/)
    assert.match(pinned, /Pinned {2}1/)
    assert.deepEqual(saved.at(-1), {
      set: { "placeholder-mail": true },
      order: ["placeholder-mail"],
    })
    // The cursor follows the service to the top; p unpins it.
    stdin.press("p")
    const unpinned = await until(frame, /Unpinned Placeholder Mail/)
    assert.doesNotMatch(unpinned, /Pinned {2}\d/)
    assert.deepEqual(saved.at(-1), {
      set: { "placeholder-mail": false },
      order: [],
    })
    app.unmount()
  })
})
