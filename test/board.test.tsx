import assert from "node:assert/strict"
import { describe, it } from "node:test"
import { stripVTControlCharacters } from "node:util"
import { render } from "ink"
import { App } from "../src/ui/app.js"
import { boardFits, boardShape, boardStep } from "../src/ui/overview-board.js"
import { MOCK_SERVICES, mockRecord } from "../src/mock.js"
import { boardGroups, navOrder } from "../src/ui/overview-model.js"
import { mockSource } from "../src/source.js"
import { terminal, bodyOf } from "./helpers.js"

const tick = (ms = 60) => new Promise((r) => setTimeout(r, ms))

const until = async (frame: () => string, pattern: RegExp) => {
  for (let waited = 0; waited < 3000 && !pattern.test(frame()); waited += 25)
    await tick(25)
  return frame()
}

const NAMES = mockSource().services.map((s) => s.name)
const MOCK = navOrder(
  "board",
  MOCK_SERVICES.map((service) => ({ service, record: mockRecord(service) })),
)
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
  const folded = Number(/● (\d+) ok · z show/.exec(frame)?.[1] ?? 0)
  assert.equal(
    shown.length + above + below + folded,
    NAMES.length,
    `shown ${shown.length} + above ${above} + below ${below} + folded ${folded}\n${frame}`,
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
    // The strip is folded on a window this short; z shows it, so the walk
    // can reach every service.
    stdin.press("z")
    await until(frame, /Harbour CI|more below/)
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
  it("starts grid names in the card-title column, glyphs in line", async () => {
    const { stdout, stdin } = terminal(160, 60)
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
    // Names are padded per strip column, so the glyphs line up under them.
    assert.equal(
      columnOf(frame, /Demo Feed\s+\uE0B6/) +
        /Demo Feed\s+/.exec(stripVTControlCharacters(frame))![0].length,
      columnOf(frame, /Saltmarsh Mail\s+\uE0B6/) +
        /Saltmarsh Mail\s+/.exec(stripVTControlCharacters(frame))![0].length,
      frame,
    )
    // Manual pages close the board in a group of their own.
    const lines = stripVTControlCharacters(frame).split("\n")
    const manual = lines.findIndex((l) => l.includes("Test Docs"))
    assert.equal(bodyOf(lines[manual - 1]).replace(/[│\s]/g, ""), "", frame)
    assert.ok(manual > lines.findIndex((l) => l.includes("Wicker Video")))
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
    assert.match(keys, /1 of \d+ │$/, frame)
    app.unmount()
  })
})

describe("board arrows", () => {
  // Five cards two to a line, then four grid names two to a line.
  const shape = {
    lines: [
      { first: 0, size: 2, span: 1 },
      { first: 2, size: 2, span: 1 },
      { first: 4, size: 1, span: 1 },
      { first: 5, size: 2, span: 1 },
      { first: 7, size: 2, span: 1 },
    ],
  }

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

  it("starts the manual group on a line of its own, under its column", () => {
    // Three ok names, two to a line, then one manual page: it takes a line
    // of its own rather than the free cell beside the third name.
    const rows = MOCK.filter(
      (r) => r.record?.indicator === "none" && r.record.kind !== "rss",
    ).slice(0, 3)
    const manual = MOCK.filter((r) => r.record?.indicator === "link")
    const { lines } = boardShape([...rows, ...manual], 230, true)
    assert.deepEqual(
      lines.map((l) => [l.first, l.size]),
      [
        [0, 2],
        [2, 1],
        [3, 1],
      ],
    )
    assert.equal(boardStep({ lines }, 2, "down"), 3)
    assert.equal(boardStep({ lines }, 3, "up"), 2)
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
    assert.match(frame(), /←→↑↓ move/)
    stdin.press(LEFT)
    await tick(20)
    assert.match(frame(), /↑↓ filter/)
    stdin.press(RIGHT)
    await tick(20)
    assert.match(frame(), /←→↑↓ move/)
    stdin.press(DOWN)
    await tick(20)
    stdin.press(UP)
    await tick(20)
    assert.equal(selectedOf(frame()), first)
    app.unmount()
  })

  it("heavy frames mean on fire; without colour, a marker marks the selection", async () => {
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
    // One service is on fire (Acme Cloud, major): one heavy frame.
    assert.equal(lines.filter((l) => l.includes("┏")).length, 1, done)
    // The test terminal draws no colour at all, so the selected card says
    // so in text, and only that one.
    const marked = lines.filter((l) => /[│┃] ❯ /.test(bodyOf(l)))
    assert.equal(marked.length, 1, done)
    assert.match(marked[0], /❯ Acme Cloud/)
  })
})

describe("board paging", () => {
  it("G reaches the last service, g the first", async () => {
    const { stdout, stdin } = terminal(160, 60)
    const app = render(<App source={{ ...mockSource(2), view: "board" }} />, {
      stdout: stdout as unknown as NodeJS.WriteStream,
      stdin: stdin as unknown as NodeJS.ReadStream,
      debug: true,
      patchConsole: false,
      exitOnCtrlC: false,
    })
    const frame = () => stripVTControlCharacters(stdout.frame)
    await until(frame, /updated/)
    stdin.press("G")
    assert.match(await until(frame, /21 of 21/), /❯ Test Docs/)
    stdin.press("g")
    await until(frame, /1 of 21/)
    assert.equal(selectedOf(frame()), "Acme Cloud")
    stdin.press("\x1b[6~")
    const paged = await until(frame, /\b(?!1 of)\d+ of 21/)
    assert.ok(Number(/(\d+) of 21/.exec(paged)![1]) > 2, paged)
    app.unmount()
  })
})

describe("first load", () => {
  // The skeleton has the shape of what replaces it: cards in the board's
  // grid on the board, rows in the list's columns in the list.
  const load = async (view: "board" | "list") => {
    const { stdout, stdin } = terminal(160, 40)
    const app = render(<App source={{ ...mockSource(300), view }} />, {
      stdout: stdout as unknown as NodeJS.WriteStream,
      stdin: stdin as unknown as NodeJS.ReadStream,
      debug: true,
      patchConsole: false,
      exitOnCtrlC: false,
    })
    const frame = () => stripVTControlCharacters(stdout.frame)
    const loading = await until(frame, /checking/)
    const done = await until(frame, /updated/)
    app.unmount()
    return { loading, done }
  }
  const lineWith = (frame: string, text: string) =>
    frame.split("\n").find((l) => l.includes(text)) ?? ""

  it("board: every service is a card while loading, in config order", () => {
    // The loading render goes through the same card layout as the loaded
    // one: no strip, no third layout, and the order is the config's.
    const pending = MOCK_SERVICES.map((service) => ({ service }))
    const groups = boardGroups(pending, false)
    assert.equal(groups.cards, pending)
    assert.deepEqual(groups.strip, [])
    assert.deepEqual(groups.manual, [])
    const lines = boardShape(pending, 132, false).lines
    assert.ok(lines.every((l) => l.span === 1 && l.size <= 2))
  })

  it("board: skeleton cards in the real grid, same tile and gutters", async () => {
    const { loading, done } = await load("board")
    // A card per service, its name known, a shimmer for what it will say.
    assert.match(loading, /[┃│] (❯ )?Acme Cloud\s+◌ checking [┃│]/, loading)
    assert.match(loading, /▀/)
    // Status words are never cut, loading or loaded.
    for (const f of [loading, done])
      assert.doesNotMatch(f, /◌ checki?…|● mi?n?…|\? unrea…|◌ mainten?…/)
    assert.doesNotMatch(loading, /◌ checking\s+\S+ {2,}◌ checking/)
    // The top edges of the first card line sit where the real ones land.
    const edges = (f: string) =>
      [...(f.split("\n").find((l) => /[┏╭]/.test(bodyOf(l))) ?? "")].flatMap(
        (c, i) => (/[┏┓╭╮]/.test(c) ? [i] : []),
      )
    assert.deepEqual(edges(loading), edges(done), `${loading}\n${done}`)
  })

  it("board: an ok service stays a card until the sort lands", async () => {
    const { stdout, stdin } = terminal(160, 40)
    const app = render(<App source={{ ...mockSource(120), view: "board" }} />, {
      stdout: stdout as unknown as NodeJS.WriteStream,
      stdin: stdin as unknown as NodeJS.ReadStream,
      debug: true,
      patchConsole: false,
      exitOnCtrlC: false,
    })
    const frame = () => stripVTControlCharacters(stdout.frame)
    // Sample Registry, third in config order, is ok and answers early.
    const mid = await until(frame, /Sample Registry\s+\uE0B6ok\uE0B4/)
    app.unmount()
    assert.match(mid, /checking/, mid)
    assert.doesNotMatch(mid, /ok · z show/, mid)
    assert.match(mid, /[│┃] Sample Registry\s+\uE0B6ok\uE0B4 [│┃]/, mid)
  })

  it("list: skeleton rows in the list's columns, so nothing shifts", async () => {
    const { loading, done } = await load("list")
    const at = (f: string, re: RegExp) => lineWith(f, "Acme Cloud").search(re)
    assert.ok(at(loading, /▀/) > 0, loading)
    assert.equal(at(loading, /▀/), at(done, /Elevated/), `${loading}\n${done}`)
    // The pill starts with its rounded cap, one cell before the word.
    assert.equal(at(loading, /◌/), at(done, /major/) - 1)
  })
})

describe("scroll note", () => {
  // When cards still overflow with the strip folded, the count of what is off
  // screen sits at the bottom right of the card grid, on the row under it.
  for (const [columns, rows] of [
    [100, 30],
    [230, 24],
  ])
    it(`sits at the card grid's bottom right at ${columns} columns`, async () => {
      const { stdout, stdin } = terminal(columns, rows)
      const app = render(<App source={{ ...mockSource(2), view: "board" }} />, {
        stdout: stdout as unknown as NodeJS.WriteStream,
        stdin: stdin as unknown as NodeJS.ReadStream,
        debug: true,
        patchConsole: false,
        exitOnCtrlC: false,
      })
      const frame = () => stripVTControlCharacters(stdout.frame)
      await until(frame, /updated/)
      const done = await until(frame, /more below/)
      const lines = done.split("\n")
      const note = lines.findIndex((l) => /more below/.test(l))
      assert.ok(note > 1, done)
      const cards = lines[note - 1]
      assert.match(bodyOf(cards), /[┛╯]/, done)
      const edge = Math.max(cards.lastIndexOf("╯"), cards.lastIndexOf("┛"))
      assert.equal(
        lines[note].indexOf("scroll") + "scroll".length - 1,
        edge,
        done,
      )
      // The fold came first: no ok name is left in the strip.
      assert.match(done, /● 9 ok · z show/)
      accountsForAll(done)
      app.unmount()
    })
})

describe("ok strip", () => {
  const board = async (columns: number, rows: number) => {
    const { stdout, stdin } = terminal(columns, rows)
    const app = render(<App source={{ ...mockSource(2), view: "board" }} />, {
      stdout: stdout as unknown as NodeJS.WriteStream,
      stdin: stdin as unknown as NodeJS.ReadStream,
      debug: true,
      patchConsole: false,
      exitOnCtrlC: false,
    })
    const frame = () => stripVTControlCharacters(stdout.frame)
    await until(frame, /updated/)
    await tick(100)
    return { app, stdin, frame }
  }

  it("folds to one line before any card scrolls off", async () => {
    const { app, frame } = await board(160, 48)
    const done = frame()
    assert.match(done, /● 9 ok · z show/)
    assert.doesNotMatch(done, /more below|Harbour CI/)
    for (const name of ["Acme Cloud", "Orbitly Push", "Demo Maintenance"])
      assert.match(done, new RegExp(name), done)
    app.unmount()
  })

  it("stays open when everything fits, and z hides it, then shows it", async () => {
    const { app, stdin, frame } = await board(160, 60)
    assert.match(frame(), /Harbour CI/)
    assert.doesNotMatch(frame(), /ok · z show/)
    stdin.press("z")
    assert.match(await until(frame, /ok · z show/), /● 9 ok · z show/)
    stdin.press("z")
    assert.match(await until(frame, /Harbour CI/), /Harbour CI/)
    app.unmount()
  })

  it("z on a folded strip shows it, and the cards scroll instead", async () => {
    const { app, stdin, frame } = await board(160, 48)
    stdin.press("z")
    const shown = await until(frame, /Harbour CI|more below/)
    assert.doesNotMatch(shown, /ok · z show/)
    accountsForAll(shown)
    app.unmount()
  })

  it("decides on the cards and the strip alone", () => {
    // 132 is the body beside the filters at 160 columns: two cards a line.
    assert.ok(boardFits(MOCK, 132, true, 44))
    assert.ok(!boardFits(MOCK, 132, true, 43))
  })
})
