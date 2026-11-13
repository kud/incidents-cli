import assert from "node:assert/strict"
import { EventEmitter } from "node:events"
import { describe, it } from "node:test"
import { render } from "ink"
import { App } from "../src/ui/app.js"
import { mockSource } from "../src/source.js"

const tick = (ms = 60) => new Promise((r) => setTimeout(r, ms))

// A terminal of a chosen size: ink-testing-library fixes the width and leaves
// the height unset, and the board's overflow only shows on a short window.
const terminal = (columns: number, rows: number) => {
  const stdout = Object.assign(new EventEmitter(), {
    columns,
    rows,
    isTTY: true,
    frame: "",
    write(frame: string) {
      stdout.frame = frame
      return true
    },
  })
  const stdin = Object.assign(new EventEmitter(), {
    isTTY: true,
    data: null as string | null,
    setEncoding() {},
    setRawMode() {},
    resume() {},
    pause() {},
    ref() {},
    unref() {},
    read() {
      const data = stdin.data
      stdin.data = null
      return data
    },
    press(data: string) {
      stdin.data = data
      stdin.emit("readable")
      stdin.emit("data", data)
    },
  })
  return { stdout, stdin }
}

const until = async (frame: () => string, pattern: RegExp) => {
  for (let waited = 0; waited < 3000 && !pattern.test(frame()); waited += 25)
    await tick(25)
  return frame()
}

const NAMES = mockSource().services.map((s) => s.name)

// Every service is on screen or counted in the scroll note, and none is drawn
// over another: each name shows at most once, and a cell's trailing text only
// ever sits beside its own service.
const accountsForAll = (frame: string) => {
  const shown = NAMES.filter((name) => frame.includes(name))
  for (const name of shown)
    assert.equal(frame.split(name).length - 1, 1, `${name} drawn once`)
  const above = Number(/(\d+) more above/.exec(frame)?.[1] ?? 0)
  const below = Number(/(\d+) more below/.exec(frame)?.[1] ?? 0)
  assert.equal(
    shown.length + above + below,
    NAMES.length,
    `shown ${shown.length} + above ${above} + below ${below}\n${frame}`,
  )
  for (const line of frame.split("\n").filter((l) => /no feed/.test(l)))
    assert.match(line, /Test Docs/, line)
}

describe("board on a short window", () => {
  for (const rows of [24, 30, 36]) {
    it(`accounts for every service at ${rows} rows, both sorts`, async () => {
      const { stdout, stdin } = terminal(140, rows)
      const app = render(<App source={{ ...mockSource(2), view: "board" }} />, {
        stdout: stdout as unknown as NodeJS.WriteStream,
        stdin: stdin as unknown as NodeJS.ReadStream,
        debug: true,
        patchConsole: false,
        exitOnCtrlC: false,
      })
      const frame = () => stdout.frame
      accountsForAll(await until(frame, /updated/))
      stdin.press("s")
      accountsForAll(await until(frame, /s by status/))
      stdin.press("s")
      accountsForAll(await until(frame, /s by name/))
      app.unmount()
    })
  }

  it("the cursor reaches every service and keeps it in view", async () => {
    const { stdout, stdin } = terminal(140, 24)
    const app = render(<App source={{ ...mockSource(2), view: "board" }} />, {
      stdout: stdout as unknown as NodeJS.WriteStream,
      stdin: stdin as unknown as NodeJS.ReadStream,
      debug: true,
      patchConsole: false,
      exitOnCtrlC: false,
    })
    const frame = () => stdout.frame
    await until(frame, /updated/)
    const reached = new Set<string>()
    for (let i = 0; i < NAMES.length; i++) {
      const selected =
        frame()
          .split("\n")
          .find((l) => l.includes("❯")) ?? ""
      const name = NAMES.find((n) => selected.includes(`❯ ${n}`))
      assert.ok(name, `step ${i}: no selected service on screen\n${frame()}`)
      reached.add(name)
      accountsForAll(frame())
      stdin.press("j")
      await tick(20)
    }
    assert.equal(reached.size, NAMES.length)
    app.unmount()
  })
})
