import assert from "node:assert/strict"
import {
  existsSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  writeFileSync,
} from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { describe, it } from "node:test"
import { stripVTControlCharacters } from "node:util"
import { render } from "ink"
import { App } from "../src/ui/app.js"
import { mockSource } from "../src/source.js"
import { fileState, statePath, type ViewState } from "../src/state.js"
import type { View } from "../src/view.js"
import { terminal } from "./helpers.js"

const dir = () => mkdtempSync(join(tmpdir(), "incidents-state-"))
const tick = (ms = 40) => new Promise((r) => setTimeout(r, ms))

describe("view state file", () => {
  it("lives under XDG_STATE_HOME, else ~/.local/state", () => {
    assert.equal(
      statePath({ XDG_STATE_HOME: "/x/state" }),
      "/x/state/incidents/state.json",
    )
    assert.match(statePath({}), /\/\.local\/state\/incidents\/state\.json$/)
  })

  it("remembers the view, writes atomically, keeps other keys", () => {
    const path = join(dir(), "incidents", "state.json")
    const state = fileState(path)
    assert.equal(state.load(), undefined)
    state.save("board")
    assert.equal(state.load(), "board")
    writeFileSync(path, JSON.stringify({ view: "board", other: 1 }))
    state.save("list")
    assert.deepEqual(JSON.parse(readFileSync(path, "utf8")), {
      view: "list",
      other: 1,
    })
    assert.deepEqual(readdirSync(join(path, "..")), ["state.json"])
  })

  it("ignores a corrupt or unexpected file", () => {
    const path = join(dir(), "state.json")
    for (const body of ["{not json", "[]", '"board"', '{"view":"grid"}']) {
      writeFileSync(path, body)
      assert.equal(fileState(path).load(), undefined, body)
    }
  })

  it("never throws when it cannot write", () => {
    const blocker = join(dir(), "file")
    writeFileSync(blocker, "")
    const state = fileState(join(blocker, "incidents", "state.json"))
    assert.doesNotThrow(() => state.save("board"))
    assert.equal(state.load(), undefined)
  })
})

describe("remembered view", () => {
  const spy = (stored?: View) => {
    const saved: View[] = []
    const state: ViewState = { load: () => stored, save: (v) => saved.push(v) }
    return { state, saved }
  }
  const open = (source: Parameters<typeof App>[0]["source"]) => {
    const { stdout, stdin } = terminal(160, 40)
    const app = render(<App source={source} />, {
      stdout: stdout as unknown as NodeJS.WriteStream,
      stdin: stdin as unknown as NodeJS.ReadStream,
      debug: true,
      patchConsole: false,
      exitOnCtrlC: false,
    })
    return { app, stdin, frame: () => stripVTControlCharacters(stdout.frame) }
  }

  it("wins over the config's view", async () => {
    const { state } = spy("board")
    const { app, frame } = open({ ...mockSource(2), view: "list", state })
    await tick()
    // On the board, the key offers the list.
    assert.match(frame(), /v list/)
    app.unmount()
  })

  it("leaves the config's view in charge until v has been pressed", async () => {
    const { state, saved } = spy(undefined)
    const { app, stdin, frame } = open({
      ...mockSource(2),
      view: "list",
      state,
    })
    await tick()
    assert.match(frame(), /v board/)
    assert.deepEqual(saved, [])
    stdin.press("v")
    await tick()
    assert.match(frame(), /v list/)
    assert.deepEqual(saved, ["board"])
    app.unmount()
  })

  it("the mock never reads or writes the real file", async () => {
    assert.equal(mockSource().state, undefined)
    const home = dir()
    const was = process.env.XDG_STATE_HOME
    process.env.XDG_STATE_HOME = home
    try {
      const { app, stdin, frame } = open({ ...mockSource(2), view: "list" })
      await tick()
      stdin.press("v")
      await tick()
      assert.match(frame(), /v list/)
      app.unmount()
      assert.equal(existsSync(join(home, "incidents")), false)
    } finally {
      if (was === undefined) delete process.env.XDG_STATE_HOME
      else process.env.XDG_STATE_HOME = was
    }
  })
})
