import assert from "node:assert/strict"
import { describe, it } from "node:test"
import { stripVTControlCharacters } from "node:util"
import { render } from "ink"
import { App } from "../src/ui/app.js"
import { boardStep } from "../src/ui/overview-board.js"
import { mockSource } from "../src/source.js"
import { terminal, bodyOf } from "./helpers.js"

const tick = (ms = 60) => new Promise((r) => setTimeout(r, ms))

const until = async (frame: () => string, pattern: RegExp) => {
  for (let waited = 0; waited < 3000 && !pattern.test(frame()); waited += 25)
    await tick(25)
  return frame()
}

const NAMES = mockSource().services.map((s) => s.name)
const RIGHT = "\u001b[C"
const LEFT = "\u001b[D"
const DOWN = "\u001b[B"
const UP = "\u001b[A"

// The selected service: a grid line's marker, or the card drawn in the bold
// border, whose name sits one row under its top-left corner.
const selectedOf = (frame: string): string | undefined => {
  const lines = stripVTControlCharacters(frame).split("\n")
  const marked = lines.find((l) => bodyOf(l).includes("❯"))
  if (marked) return NAMES.find((n) => marked.includes(`❯ ${n}`))
  const top = lines.findIndex((l) => l.includes("┏"))
  if (top < 0) return undefined
  const under = lines[top + 1].slice(lines[top].indexOf("┏") + 2)
  return NAMES.find((n) => under.startsWith(n))
}

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
    const at = () => {
      const name = selectedOf(frame())
      assert.ok(name, `no selected service on screen\n${frame()}`)
      reached.add(name)
      accountsForAll(frame())
      return name
    }
    const press = async (key: string) => {
      stdin.press(key)
      await tick(20)
    }
    // Row by row: right to the end of the row, back to its first column,
    // then down; the walk ends when down no longer moves.
    for (let row = 0; row < NAMES.length; row++) {
      let steps = 0
      for (let before = at(); ; steps++) {
        await press(RIGHT)
        if (at() === before) break
        before = at()
      }
      for (let i = 0; i < steps; i++) await press(LEFT)
      const before = at()
      await press(DOWN)
      if (at() === before) break
    }
    assert.equal(reached.size, NAMES.length)
    app.unmount()
  })
})

// Where a text starts on its line, in cells: stripped of colour, the frame is
// all single-cell glyphs, so the string index is the column.
const columnOf = (frame: string, text: string | RegExp): number => {
  const line = stripVTControlCharacters(frame)
    .split("\n")
    .find((l) => l.search(text) >= 0)
  assert.ok(line, `${text} on screen\n${frame}`)
  return line.search(text)
}

describe("board alignment", () => {
  it("starts grid names, notes and the footer in the card-title column", async () => {
    const { stdout, stdin } = terminal(160, 40)
    const app = render(<App source={{ ...mockSource(2), view: "board" }} />, {
      stdout: stdout as unknown as NodeJS.WriteStream,
      stdin: stdin as unknown as NodeJS.ReadStream,
      debug: true,
      patchConsole: false,
      exitOnCtrlC: false,
    })
    const frame = await until(() => stdout.frame, /updated/)
    // Left column: a card below the selected one, then the grid under it.
    const left = columnOf(frame, "Brightgate Auth")
    assert.equal(columnOf(frame, "Demo Feed"), left, frame)
    assert.equal(columnOf(frame, /\d+ more below/), left, frame)
    assert.equal(columnOf(frame, "Declared status only"), left, frame)
    // Right column: the same snap under the second card.
    assert.equal(
      columnOf(frame, "Driftwood Logs"),
      columnOf(frame, "Copperleaf Pay"),
      frame,
    )
    app.unmount()
  })

  it("keeps the counter on the keys' row", async () => {
    const { stdout, stdin } = terminal(160, 40)
    const app = render(<App source={{ ...mockSource(2), view: "board" }} />, {
      stdout: stdout as unknown as NodeJS.WriteStream,
      stdin: stdin as unknown as NodeJS.ReadStream,
      debug: true,
      patchConsole: false,
      exitOnCtrlC: false,
    })
    const frame = await until(() => stdout.frame, /updated/)
    const keys =
      stripVTControlCharacters(frame)
        .split("\n")
        .find((l) => l.includes("q quit")) ?? ""
    assert.match(keys, /1 of 21 │$/, frame)
    app.unmount()
  })
})

describe("board arrows", () => {
  // Five cards two to a line, then four grid names two to a line.
  const shape = { cards: 5, perLine: 2, across: 2, span: 1, total: 9 }

  it("moves along a row with ←→ and down a column with ↑↓", () => {
    assert.equal(boardStep(shape, 0, "right"), 1)
    assert.equal(boardStep(shape, 1, "right"), 1)
    assert.equal(boardStep(shape, 1, "left"), 0)
    assert.equal(boardStep(shape, 0, "down"), 2)
    assert.equal(boardStep(shape, 2, "up"), 0)
    assert.equal(boardStep(shape, 0, "up"), 0)
    // A short last row of cards: down from above it lands on its last card.
    assert.equal(boardStep(shape, 3, "down"), 4)
  })

  it("crosses between the cards and the grid by column", () => {
    assert.equal(boardStep(shape, 4, "down"), 5)
    assert.equal(boardStep(shape, 5, "up"), 4)
    assert.equal(boardStep(shape, 6, "up"), 4)
    assert.equal(boardStep(shape, 5, "down"), 7)
    assert.equal(boardStep(shape, 8, "right"), 8)
    assert.equal(boardStep(shape, 8, "down"), 8)
  })

  it("leaves for the filters off the first column, card or grid", () => {
    assert.equal(boardStep(shape, 0, "left"), "filters")
    assert.equal(boardStep(shape, 2, "left"), "filters")
    assert.equal(boardStep(shape, 7, "left"), "filters")
    assert.equal(boardStep(shape, 6, "left"), 5)
  })

  it("takes ← from the first card to Filters and → back", async () => {
    const { stdout, stdin } = terminal(160, 40)
    const app = render(<App source={{ ...mockSource(2), view: "board" }} />, {
      stdout: stdout as unknown as NodeJS.WriteStream,
      stdin: stdin as unknown as NodeJS.ReadStream,
      debug: true,
      patchConsole: false,
      exitOnCtrlC: false,
    })
    const frame = () => stripVTControlCharacters(stdout.frame)
    await until(frame, /updated/)
    const first = selectedOf(frame())
    stdin.press(RIGHT)
    await tick(20)
    const second = selectedOf(frame())
    assert.notEqual(second, first)
    stdin.press(LEFT)
    await tick(20)
    assert.equal(selectedOf(frame()), first)
    assert.match(frame(), /tab filters/)
    stdin.press(LEFT)
    await tick(20)
    assert.match(frame(), /tab services/)
    stdin.press(RIGHT)
    await tick(20)
    assert.match(frame(), /tab filters/)
    stdin.press(DOWN)
    await tick(20)
    stdin.press(UP)
    await tick(20)
    assert.equal(selectedOf(frame()), first)
    app.unmount()
  })

  it("marks the selected card by its border, with no marker", async () => {
    const { stdout, stdin } = terminal(160, 40)
    const app = render(<App source={{ ...mockSource(2), view: "board" }} />, {
      stdout: stdout as unknown as NodeJS.WriteStream,
      stdin: stdin as unknown as NodeJS.ReadStream,
      debug: true,
      patchConsole: false,
      exitOnCtrlC: false,
    })
    const frame = () => stripVTControlCharacters(stdout.frame)
    const done = await until(frame, /updated/)
    app.unmount()
    const lines = done.split("\n")
    assert.equal(lines.filter((l) => l.includes("┏")).length, 1, done)
    const top = lines.findIndex((l) => l.includes("┏"))
    for (const l of lines.slice(top, top + 6))
      assert.doesNotMatch(bodyOf(l), /❯/)
  })
})

describe("grid while loading", () => {
  it("cuts a long name with an ellipsis rather than wrapping it", async () => {
    const { stdout, stdin } = terminal(120, 40)
    const app = render(<App source={{ ...mockSource(400), view: "board" }} />, {
      stdout: stdout as unknown as NodeJS.WriteStream,
      stdin: stdin as unknown as NodeJS.ReadStream,
      debug: true,
      patchConsole: false,
      exitOnCtrlC: false,
    })
    const frame = () => stripVTControlCharacters(stdout.frame)
    await until(frame, /checking/)
    await tick(1500)
    const out = frame()
    app.unmount()
    // Every name a line holds starts it: no name's second word on its own.
    for (const name of NAMES.filter((n) => n.includes(" "))) {
      const [, rest] = name.split(" ")
      const alone = out
        .split("\n")
        .some((l) => new RegExp(`│\\s+${rest}\\s`).test(l) && !l.includes(name))
      assert.ok(!alone, `${name} wrapped\n${out}`)
    }
  })
})
