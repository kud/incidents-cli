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
      assert.match(titles, /^│ Now {2,}│ {2}▍History {2}2/)
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
    assert.match(titles, /▍History\s*$/)
    const under = lines[lines.indexOf(titles) + 2]
    assert.match(under.slice(titles.indexOf("▍")), /▀/)
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
    assert.doesNotMatch(out, /▍History/)
    assert.match(out, /Open incidents/)
  })
})
