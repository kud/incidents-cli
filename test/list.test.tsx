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

describe("list keys", () => {
  const UP = "\x1b[A"
  const LEFT = "\x1b[D"
  const RIGHT = "\x1b[C"
  const ENTER = "\r"
  const BACKSPACE = "\x7f"

  // The list, sorted and settled, with a way to press a key and read what
  // the cursor sits on after it.
  const ready = async (columns = 160) => {
    const opened = open(mockSource(2), columns)
    await until(opened.frame, /updated/)
    await tick()
    const press = async (key: string, times = 1) => {
      for (let i = 0; i < times; i++) {
        opened.stdin.press(key)
        await tick(30)
      }
      await tick()
      return opened.frame()
    }
    // The name under the cursor, read off the list alone.
    const on = () =>
      /❯ (.+?) {2}/.exec(bodyOf(selectedLine(opened.frame())))?.[1] ?? ""
    return { ...opened, press, on }
  }

  it("↓ moves one service at a time, across the blank between runs", async () => {
    const { app, press, on } = await ready()
    assert.match(on(), /Acme Cloud/)
    assert.match(await press(DOWN), /2 of 21/)
    assert.match(on(), /Placeholder Mail/)
    assert.match(await press(DOWN), /3 of 21/)
    assert.match(on(), /Brightgate Auth/)
    app.unmount()
  })

  it("↑ moves back up and holds at the top", async () => {
    const { app, press, on } = await ready()
    await press(DOWN, 2)
    assert.match(await press(UP), /2 of 21/)
    assert.match(on(), /Placeholder Mail/)
    await press(UP)
    assert.match(on(), /Acme Cloud/)
    assert.match(await press(UP), /1 of 21/)
    app.unmount()
  })

  it("← steps out to the filters and keeps the service selected", async () => {
    const { app, press, frame } = await ready()
    await press(DOWN, 2)
    const out = await press(LEFT)
    assert.match(out, /↑↓ filter/)
    assert.match(out, /3 of 21/)
    assert.doesNotMatch(out, /Services · /)
    await press(RIGHT)
    assert.match(selectedLine(frame()), /Brightgate Auth/)
    app.unmount()
  })

  it("→ in the list stays put", async () => {
    const { app, press, on } = await ready()
    await press(DOWN, 2)
    const after = await press(RIGHT)
    assert.match(after, /↑↓ move/)
    assert.match(after, /3 of 21/)
    assert.match(on(), /Brightgate Auth/)
    app.unmount()
  })

  it("tab goes to the filters and back without moving the cursor", async () => {
    const { app, press, on } = await ready()
    await press(DOWN, 3)
    assert.match(await press(TAB), /↑↓ filter/)
    assert.match(await press(TAB), /↑↓ move/)
    assert.match(on(), /Copperleaf Pay/)
    app.unmount()
  })

  it("v to the board and back keeps the service selected", async () => {
    const { app, press, on } = await ready()
    await press(DOWN, 4)
    assert.match(on(), /Example CDN/)
    assert.match(await press("v"), /v list/)
    assert.match(await press("v"), /v board/)
    assert.match(on(), /Example CDN/)
    app.unmount()
  })

  it("enter opens the selected service and backspace returns to it", async () => {
    const { app, press, frame, on } = await ready()
    await press(DOWN, 3)
    await press(ENTER)
    const detail = await until(frame, /Payouts/)
    assert.match(detail, /Incidents\s+Copperleaf Pay/)
    await press(BACKSPACE)
    const back = await until(frame, /Declared status only/)
    assert.match(back, /4 of 21/)
    assert.match(on(), /Copperleaf Pay/)
    app.unmount()
  })

  it("walks every row down and back up, folded or not, never skipping", async () => {
    const { app, press, on } = await ready()
    for (const fold of [false, true]) {
      if (fold) await press("z")
      const total = Number(/\d+ of (\d+)/.exec(await press(UP, 0))![1])
      await press(UP, total)
      const down: string[] = [on()]
      for (let i = 1; i < total; i++) {
        assert.match(await press(DOWN), new RegExp(`${i + 1} of ${total}`))
        down.push(on())
      }
      assert.equal(new Set(down).size, total)
      // Past the end it holds, as it holds at the top.
      assert.match(await press(DOWN), new RegExp(`${total} of ${total}`))
      const up: string[] = [on()]
      for (let i = total - 1; i > 0; i--) {
        assert.match(await press(UP), new RegExp(`${i} of ${total}`))
        up.unshift(on())
      }
      assert.deepEqual(up, down)
    }
    app.unmount()
  })
})

describe("list preview", () => {
  it("names the components in trouble and counts the rest on one line", async () => {
    const { app, stdin, frame } = open(mockSource(2), 230)
    await until(frame, /updated/)
    for (let i = 0; i < 4; i++) {
      stdin.press(DOWN)
      await tick(30)
    }
    const shown = await until(frame, /41 components/)
    assert.match(shown, /● degraded {2}Edge cache/)
    assert.match(shown, /● ok {8}41 components/)
    assert.doesNotMatch(shown, /Ashmere/)
    assert.doesNotMatch(shown, /ok\s*…|…\s*│/)
    app.unmount()
  })
})
