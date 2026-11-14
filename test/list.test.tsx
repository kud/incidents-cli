import assert from "node:assert/strict"
import { describe, it } from "node:test"
import { stripVTControlCharacters } from "node:util"
import { render } from "ink"
import { App } from "../src/ui/app.js"
import { scrollTop } from "../src/ui/overview-list.js"
import { mockSource, type Source } from "../src/source.js"
import { bodyOf, terminal } from "./helpers.js"

const tick = (ms = 60) => new Promise((r) => setTimeout(r, ms))

const plain = (s: string) => stripVTControlCharacters(s)

const until = async (frame: () => string, pattern: RegExp) => {
  for (let waited = 0; waited < 3000 && !pattern.test(frame()); waited += 25)
    await tick(25)
  return frame()
}

const TAB = "\t"
const DOWN = "\x1b[B"

const open = (source: Source, columns = 160) => {
  const { stdout, stdin } = terminal(columns, 34)
  const app = render(<App source={{ ...source, view: "list" }} />, {
    stdout: stdout as unknown as NodeJS.WriteStream,
    stdin: stdin as unknown as NodeJS.ReadStream,
    debug: true,
    patchConsole: false,
    exitOnCtrlC: false,
  })
  return { app, stdin, frame: () => plain(stdout.frame) }
}

const selectedLine = (frame: string): string =>
  frame.split("\n").find((line) => bodyOf(line).includes("❯")) ?? ""

// The column of the divider between the list and the preview: the frame's
// own left edge is the first rule on the line, the filter column's the
// second, the divider the third.
const dividerAt = (line: string): number =>
  [...line].flatMap((c, i) => (c === "│" ? [i] : []))[2] ?? -1

describe("list overview", () => {
  it("holds the divider in place as services answer and across tabs", async () => {
    const { app, stdin, frame } = open(mockSource(20))
    await until(frame, /❯/)
    const loading = dividerAt(selectedLine(frame()))
    assert.ok(loading > 0, frame())
    await until(frame, /updated/)
    const seen = new Set([loading, dividerAt(selectedLine(frame()))])
    stdin.press(TAB)
    await tick(40)
    for (let i = 0; i < 7; i++) {
      stdin.press(DOWN)
      await tick(40)
      const line = selectedLine(frame())
      if (line) seen.add(dividerAt(line))
    }
    assert.deepEqual([...seen], [loading])
    app.unmount()
  })

  it("an empty tab keeps the column and says so on one line", async () => {
    const { app, stdin, frame } = open(mockSource(5))
    await until(frame, /updated/)
    const width = dividerAt(selectedLine(frame()))
    stdin.press("/")
    for (const ch of "zzzz") {
      await tick(20)
      stdin.press(ch)
    }
    const empty = await until(frame, /Nothing in All right now/)
    const line = empty.split("\n").find((l) => l.includes("Nothing in All"))!
    assert.equal(dividerAt(line), width, empty)
    app.unmount()
  })

  it("rows stop a gap short of the divider, skeletons included", async () => {
    const { app, frame } = open(mockSource(40))
    const loading = await until(frame, /▀/)
    const bar = loading.split("\n").find((l) => l.includes("▀"))!
    const chars = [...bar]
    const at = dividerAt(bar)
    assert.equal(chars.slice(at - 2, at).join(""), "  ", bar)
    app.unmount()
  })

  it("lands on the worst service, not the config's first, when the sort arrives", async () => {
    const base = mockSource(5)
    const healthy = base.services.find((s) => s.name === "Sample Registry")!
    const source = {
      ...base,
      services: [healthy, ...base.services.filter((s) => s !== healthy)],
    }
    const { app, frame } = open(source)
    const done = await until(frame, /updated/)
    assert.match(selectedLine(done), /Acme Cloud/)
    assert.match(done, /1 of 21/)
    app.unmount()
  })
})

describe("list alignment", () => {
  it("starts names in the footer's column, the marker in the gutter", async () => {
    const { app, frame } = open(mockSource(2))
    const done = await until(frame, /updated/)
    const at = (text: string) => {
      const line = done.split("\n").find((l) => l.includes(text)) ?? ""
      return line.indexOf(text)
    }
    const name = at("Brightgate Auth")
    assert.ok(name > 0, done)
    assert.equal(at("Declared status only"), name, done)
    assert.equal(at("❯ Acme Cloud"), name - 2, done)
    // The pane title's pill starts in the pane's first column, its label
    // one cell in.
    assert.equal(at("Services"), name - 1, done)
    app.unmount()
  })
})

describe("list scroll", () => {
  // Ten rows with a run break before the sixth.
  const lines = [0, 1, 2, 3, 4, undefined, 5, 6, 7, 8, 9].map((holds) => ({
    holds,
  }))
  const lineOf = (row: number) => lines.findIndex((l) => l.holds === row)

  it("holds the window still while the cursor moves inside it", () => {
    assert.equal(scrollTop(0, lines, lineOf(0), 6), 0)
    assert.equal(scrollTop(0, lines, lineOf(2), 6), 0)
    assert.equal(scrollTop(0, lines, lineOf(3), 6), 0)
  })

  it("scrolls one line at a time near the bottom edge", () => {
    assert.equal(scrollTop(0, lines, lineOf(4), 6), 1)
    assert.equal(scrollTop(1, lines, lineOf(3), 6), 1)
  })

  it("never opens the window on a run's blank line", () => {
    const start = scrollTop(0, lines, lineOf(8), 6)
    assert.notEqual(lines[start].holds, undefined)
  })

  it("shows everything from the top when it fits", () => {
    assert.equal(scrollTop(3, lines, lineOf(9), 20), 0)
  })
})
