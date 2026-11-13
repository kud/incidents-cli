import assert from "node:assert/strict"
import { describe, it } from "node:test"
import { stripVTControlCharacters } from "node:util"
import type { ReactNode } from "react"
import { Box, render } from "ink"
import { App } from "../src/ui/app.js"
import { DetailBody } from "../src/ui/detail.js"
import { mockRecord } from "../src/mock.js"
import { mockSource } from "../src/source.js"
import { terminal } from "./helpers.js"

const tick = (ms = 25) => new Promise((r) => setTimeout(r, ms))
const plain = (s: string) => stripVTControlCharacters(s)

const mount = (node: ReactNode, columns: number, rows: number) => {
  const { stdout, stdin } = terminal(columns, rows)
  const app = render(node, {
    stdout: stdout as unknown as NodeJS.WriteStream,
    stdin: stdin as unknown as NodeJS.ReadStream,
    debug: true,
    patchConsole: false,
    exitOnCtrlC: false,
  })
  return { frame: () => plain(stdout.frame), app }
}

const until = async (frame: () => string, pattern: RegExp) => {
  for (let waited = 0; waited < 3000 && !pattern.test(frame()); waited += 25)
    await tick()
  return frame()
}

const acme = mockSource(1).services.find((s) => s.id === "acme-cloud")!

describe("detail page layout", () => {
  for (const columns of [160, 200]) {
    it(`splits into titled panes on the overview's gutter at ${columns} columns`, async () => {
      const { frame, app } = mount(
        <App
          source={{ ...mockSource(1), view: "list" }}
          initialDetail="acme-cloud"
        />,
        columns,
        30,
      )
      const lines = (await until(frame, /Delayed webhook/)).split("\n")
      app.unmount()
      const titles = lines.find((l) => l.includes("History"))!
      // The frame, the header's edge, then the left title on it.
      assert.match(titles, /^│ Now {2,}│ {3}History {2}2/)
      // Column, one space, the rule, two spaces, the body.
      const rule = titles.indexOf("│", 1)
      assert.equal(titles[rule - 1], " ")
      assert.equal(titles.slice(rule + 1, rule + 3), "  ")
      // Every left row starts on the header's icon column.
      const icon = lines.find((l) => l.includes("◆"))!.indexOf("◆")
      for (const text of ["Now", "● major", "status.", "Open incidents"]) {
        const row = lines.find((l) => l.includes(text))!
        assert.equal(row.indexOf(text), icon, text)
      }
      // The status page's address is whole, not cut.
      assert.match(lines.join("\n"), /status\.acme-cloud\.example\.com/)
    })
  }

  it("holds the history pane on placeholders while it loads", () => {
    const { frame, app } = mount(
      <Box width={160} flexDirection="column" height={20}>
        <DetailBody record={mockRecord(acme)} width={156} historyBusy />
      </Box>,
      160,
      20,
    )
    const lines = frame().split("\n")
    app.unmount()
    const titles = lines.find((l) => l.includes("History"))!
    assert.match(titles, / History\s*$/)
    const under = lines[lines.indexOf(titles) + 2]
    assert.match(under.slice(titles.indexOf("History") - 1), /▀/)
  })

  it("says so when a loaded history is empty", () => {
    const { frame, app } = mount(
      <Box width={160} flexDirection="column" height={20}>
        <DetailBody
          record={{ ...mockRecord(acme), historyLoaded: true }}
          width={156}
        />
      </Box>,
      160,
      20,
    )
    const out = frame()
    app.unmount()
    assert.match(out, /No past incidents on record\./)
  })

  it("stacks when the pinned side would not fit the window", async () => {
    const { frame, app } = mount(
      <App
        source={{ ...mockSource(1), view: "list" }}
        initialDetail="acme-cloud"
      />,
      160,
      12,
    )
    const out = await until(frame, /updated/)
    app.unmount()
    assert.doesNotMatch(out, /│ {3}History/)
    assert.match(out, /Open incidents/)
  })
})

describe("detail page height", () => {
  const DOWN = "\u001b[B"
  for (const columns of [160, 120]) {
    it(`never runs past the terminal at ${columns} columns, and scrolls`, async () => {
      const rows = 30
      const { stdout, stdin } = terminal(columns, rows)
      const app = render(
        <App
          source={{ ...mockSource(1), view: "board" }}
          initialDetail="harbour-ci"
        />,
        {
          stdout: stdout as unknown as NodeJS.WriteStream,
          stdin: stdin as unknown as NodeJS.ReadStream,
          debug: true,
          patchConsole: false,
          exitOnCtrlC: false,
        },
      )
      const frame = () => plain(stdout.frame)
      const first = await until(frame, /more below · ↑↓ scroll/)
      const lines = first.trimEnd().split("\n")
      assert.ok(lines.length <= rows, `${lines.length} lines\n${first}`)
      // The frame closes on the last row, the keys just above it.
      assert.match(lines.at(-1)!, /^╰/)
      assert.match(lines.at(-2)!, /scroll/)
      // A blank row under the title row.
      assert.match(lines[2], /^│\s+│$/)
      const below = Number(/(\d+) more below/.exec(first)![1])
      for (let i = 0; i < 12; i++) {
        stdin.press(DOWN)
        await tick(30)
      }
      const moved = frame()
      app.unmount()
      assert.match(moved, /\d+ more above/)
      assert.ok(Number(/(\d+) more below/.exec(moved)![1]) < below, moved)
      assert.ok(moved.trimEnd().split("\n").length <= rows)
    })
  }
})

describe("components at scale", () => {
  const many = {
    ...mockRecord(acme, true),
    components: [
      ...Array.from({ length: 20 }, (_, i) => ({
        name: `Maint ${String(i).padStart(2, "0")}`,
        status: "under_maintenance",
      })),
      ...Array.from({ length: 12 }, (_, i) => ({
        name: `Zone ${String(i).padStart(2, "0")}`,
        status: i % 3 ? "partial_outage" : "degraded_performance",
      })),
      { name: "Core API", status: "major_outage" },
      { name: "Edge", status: "operational" },
    ],
  }

  it("leads with counts, worst first, and keeps maintenance apart", () => {
    const { frame, app } = mount(
      <Box width={160} flexDirection="column" height={44}>
        <DetailBody record={many} width={156} height={44} />
      </Box>,
      160,
      44,
    )
    const out = frame()
    app.unmount()
    assert.match(
      out,
      /33 affected · 1 outage · 8 partial · 4 degraded · 20 maintenance/,
    )
    const lines = out.split("\n")
    const rows = lines.filter((l) =>
      /^ {3}(outage|partial|degraded) /.test(l.split("│")[0]),
    )
    // Eight breakage rows, the outage first, then the rest counted.
    assert.equal(rows.length, 8, out)
    assert.match(rows[0], /outage\s+Core API/)
    assert.match(out, /\+5 more/)
    assert.match(out, /In maintenance/)
    assert.match(out, /\+17 more/)
    // Side by side: the history pane is still there.
    assert.match(out, /History/)
    assert.match(out, /Delayed webhook delivery/)
  })

  it("counts the rows it cuts, on the content column", () => {
    const { frame, app } = mount(
      <Box width={120} flexDirection="column" height={20}>
        <DetailBody
          record={mockRecord(
            mockSource(1).services.find((s) => s.id === "harbour-ci")!,
            true,
          )}
          width={116}
          height={20}
        />
      </Box>,
      120,
      20,
    )
    const out = frame()
    app.unmount()
    const lines = out.split("\n")
    const note = lines.find((l) => /more below/.test(l))!
    // 18 rows of room, the last one the note: every row past it is counted.
    assert.ok(Number(/(\d+) more below/.exec(note)![1]) > 17, note)
    assert.equal(
      note.search(/\d/),
      lines.find((l) => /● ok/.test(l))!.indexOf("●"),
    )
  })
})
