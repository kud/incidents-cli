import assert from "node:assert/strict"
import { describe, it } from "node:test"
import { stripVTControlCharacters } from "node:util"
import { render } from "ink"
import { App } from "../src/ui/app.js"
import { MOCK_SERVICES, mockRecord } from "../src/mock.js"
import { mockSource } from "../src/source.js"
import {
  FRAME_MS,
  canAnimate,
  filterFrames,
  settleFrames,
  stripFrames,
} from "../src/ui/motion.js"
import { isCard, type Row } from "../src/ui/overview-model.js"
import { terminal } from "./helpers.js"

const tick = (ms = 10) => new Promise((r) => setTimeout(r, ms))
const rows: Row[] = MOCK_SERVICES.map((service) => ({
  service,
  record: mockRecord(service),
}))

describe("motion rules", () => {
  it("settles the first load in one dim-out, dim-in pass within 300ms", () => {
    assert.ok(FRAME_MS >= 50)
    const ok = rows.filter((r) => !isCard(r))
    const sorted = [...rows].reverse()
    const board = settleFrames(rows, sorted, ok)
    assert.ok(board.length * FRAME_MS <= 300)
    // The old layout, unsorted, all of it dim, its ok cards closing to lines.
    assert.deepEqual(
      board
        .slice(0, 3)
        .map((f) => [f.sorted, new Set(Object.values(f.motion.heights ?? {}))]),
      [
        [false, new Set([5])],
        [false, new Set([3])],
        [false, new Set([1])],
      ],
    )
    for (const f of board.slice(0, 3))
      assert.equal(Object.keys(f.motion.faded ?? {}).length, rows.length)
    // Then the new layout, all of it dim, before the final frame.
    const last = board.at(-1)!
    assert.equal(last.rows, sorted)
    assert.equal(last.sorted, undefined)
    assert.equal(Object.keys(last.motion.faded ?? {}).length, rows.length)
    // The list has nothing to collapse: one frame out, one in.
    const list = settleFrames(rows, sorted, [])
    assert.deepEqual(
      list.map((f) => f.rows),
      [rows, sorted],
    )
  })

  it("dims and closes what leaves, then fades in what arrives, within 300ms", () => {
    const trouble = rows.filter((r) => r.record?.indicator !== "maintenance")
    const out = filterFrames(rows, trouble, isCard)
    assert.ok(out.length * FRAME_MS <= 300)
    assert.deepEqual(
      out.map((f) => Object.values(f.motion.heights ?? {})),
      [[5], [3], [1]],
    )
    const gone = rows.filter((r) => !trouble.includes(r))
    for (const f of out)
      assert.deepEqual(
        Object.keys(f.motion.faded ?? {}).sort(),
        gone.map((r) => r.service.id).sort(),
      )
    const back = filterFrames(trouble, rows, isCard)
    assert.deepEqual(
      back.map((f) => Object.values(f.motion.heights ?? {})),
      [[1], [3], [6]],
    )
    assert.deepEqual(filterFrames(rows, rows, isCard), [])
  })

  it("fades lines on a filter change even when no card moves", () => {
    const lines = rows.filter((r) => !isCard(r))
    const out = filterFrames(rows, rows.filter(isCard), isCard)
    assert.ok(out.length > 0)
    assert.equal(Object.keys(out[0].motion.faded ?? {}).length, lines.length)
  })

  it("folds the strip through half and one line, and back", () => {
    assert.deepEqual(
      stripFrames(rows, 5, true).map((f) => f.motion.stripLines),
      [3, 1],
    )
    assert.deepEqual(
      stripFrames(rows, 5, false).map((f) => f.motion.stripLines),
      [1, 3],
    )
    assert.deepEqual(stripFrames(rows, 1, true), [])
  })

  it("never animates without a terminal, under NO_COLOR, TERM=dumb or CI", () => {
    const keep = { ...process.env }
    try {
      // The test runner\x27s stdout is not a terminal.
      assert.equal(canAnimate(), false)
      const tty = process.stdout.isTTY
      Object.defineProperty(process.stdout, "isTTY", {
        value: true,
        configurable: true,
      })
      try {
        delete process.env.NO_COLOR
        delete process.env.CI
        delete process.env.NO_MOTION
        delete process.env.REDUCE_MOTION
        process.env.TERM = "xterm-256color"
        assert.equal(canAnimate(), true)
        for (const [k, v] of [
          ["NO_COLOR", "1"],
          ["TERM", "dumb"],
          ["CI", "1"],
        ]) {
          const was = process.env[k]
          process.env[k] = v
          assert.equal(canAnimate(), false, k)
          if (was === undefined) delete process.env[k]
          else process.env[k] = was
        }
      } finally {
        Object.defineProperty(process.stdout, "isTTY", {
          value: tty,
          configurable: true,
        })
      }
    } finally {
      process.env = keep
    }
  })
})

describe("first load, moving", () => {
  const open = (view: "board" | "list" = "board") => {
    // Tall enough that the ok strip shows whole rather than folding.
    const { stdout, stdin } = terminal(160, 60)
    const app = render(<App source={{ ...mockSource(120), view }} animate />, {
      stdout: stdout as unknown as NodeJS.WriteStream,
      stdin: stdin as unknown as NodeJS.ReadStream,
      debug: true,
      patchConsole: false,
      exitOnCtrlC: false,
    })
    return { app, stdin, frame: () => stripVTControlCharacters(stdout.frame) }
  }
  const until = async (frame: () => string, pattern: RegExp) => {
    for (let waited = 0; waited < 5000 && !pattern.test(frame()); waited += 5)
      await tick(5)
    return frame()
  }
  // Sample Registry, third in config order, is ok.
  const asLine = /Sample Registry +\uE0B6ok\uE0B4(?! [│┃])/
  const asCard = /[│┃] Sample Registry\s+\uE0B6ok\uE0B4 [│┃]/

  it("keeps ok cards as cards until every service has answered, then lines", async () => {
    const { app, frame } = open()
    await until(frame, asCard)
    // Watch the load to its end: while anything is still being read, the
    // ok card stays a card.
    let early = ""
    while (!/updated/.test(frame())) {
      const f = frame()
      if (/checking/.test(f) && asLine.test(f)) early = f
      await tick(5)
    }
    assert.equal(early, "", early)
    const done = await until(frame, asLine)
    app.unmount()
    assert.match(done, asLine, done)
    assert.doesNotMatch(done, asCard)
  })

  it("a key press lands on the final state at once", async () => {
    const { app, stdin, frame } = open()
    await until(frame, /updated/)
    stdin.press("j")
    await tick(15)
    const after = frame()
    app.unmount()
    assert.match(after, asLine, after)
    assert.doesNotMatch(after, asCard)
  })
})
