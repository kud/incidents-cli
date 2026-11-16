import assert from "node:assert/strict"
import { describe, it } from "node:test"
import { stripVTControlCharacters } from "node:util"
import { render } from "ink"
import { App } from "../src/ui/app.js"
import { MOCK_SERVICES, mockRecord } from "../src/mock.js"
import { mockSource } from "../src/source.js"
import {
  COLLAPSE,
  FRAME_MS,
  canAnimate,
  collapseHeights,
  filterFrames,
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
  it("steps a card to its line in three frames of at least 50ms", () => {
    assert.ok(FRAME_MS >= 50)
    assert.deepEqual(COLLAPSE.slice(1), [5, 3, 1])
    assert.ok((COLLAPSE.length - 1) * FRAME_MS <= 200)
    assert.deepEqual(collapseHeights({ a: 1, b: 2, c: 9 }), {
      a: 5,
      b: 3,
      c: 1,
    })
  })

  it("closes leaving cards, then opens arriving ones, within 200ms", () => {
    const trouble = rows.filter((r) => r.record?.indicator !== "maintenance")
    const out = filterFrames(rows, trouble, isCard)
    assert.ok(out.length * FRAME_MS <= 200)
    assert.deepEqual(
      out.map((f) => Object.values(f.motion.heights ?? {})),
      [[3], [1]],
    )
    assert.deepEqual(filterFrames(rows, rows, isCard), [])
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
  const open = () => {
    const { stdout, stdin } = terminal(160, 40)
    const app = render(
      <App source={{ ...mockSource(120), view: "board" }} animate />,
      {
        stdout: stdout as unknown as NodeJS.WriteStream,
        stdin: stdin as unknown as NodeJS.ReadStream,
        debug: true,
        patchConsole: false,
        exitOnCtrlC: false,
      },
    )
    return { app, stdin, frame: () => stripVTControlCharacters(stdout.frame) }
  }
  const until = async (frame: () => string, pattern: RegExp) => {
    for (let waited = 0; waited < 4000 && !pattern.test(frame()); waited += 5)
      await tick(5)
    return frame()
  }
  // Sample Registry, third in config order, is ok.
  const asLine = /^│[^│]*│ {4}Sample Registry {2}● ok/m
  const asCard = /[│┃] Sample Registry\s+● ok [│┃]/

  it("collapses an ok card to its line in place while others still load", async () => {
    const { app, frame } = open()
    const card = await until(frame, asCard)
    assert.match(card, /checking/)
    const line = await until(frame, asLine)
    app.unmount()
    assert.match(line, asLine, line)
    // The others hold still: the major card is still first, nothing sorted.
    assert.match(line, /checking/, line)
    assert.ok(line.indexOf("Acme Cloud") < line.indexOf("Sample Registry"))
  })

  it("a key press lands on the final state at once", async () => {
    const { app, stdin, frame } = open()
    await until(frame, asCard)
    stdin.press("j")
    await tick(15)
    const after = frame()
    app.unmount()
    assert.match(after, asLine, after)
  })
})
