import assert from "node:assert/strict"
import { describe, it } from "node:test"
import { stripVTControlCharacters } from "node:util"
import chalk from "chalk"
import { render } from "ink-testing-library"
import { render as renderAt } from "ink"
import { App } from "../src/ui/app.js"
import { mockSource } from "../src/source.js"
import { terminal } from "./helpers.js"
import { FilterList, PaneTitle } from "../src/ui/filter-column.js"

// Colour is the point here, so this file forces it on.
chalk.level = 3

describe("pane title", () => {
  const ACCENT = "\u001b[38;2;255;140;0m"
  const MUTED = "\u001b[38;2;117;118;126m"

  it("marks focus with bold bright text over an accent underline, no fill", () => {
    const { lastFrame, unmount } = render(
      <PaneTitle label="History" count={40} focused width={30} />,
    )
    const out = lastFrame() ?? ""
    unmount()
    assert.ok(!out.includes("\u001b[48;"), "no background fill")
    assert.ok(out.includes("\u001b[1m"))
    assert.ok(out.includes(`${ACCENT}▔▔▔▔▔▔▔`), out)
    const [title, rule] = stripVTControlCharacters(out).split("\n")
    assert.match(title, /^ History {2}40/)
    assert.equal(rule.trimEnd(), " ▔▔▔▔▔▔▔")
  })

  it("mutes the unfocused title and leaves its underline row blank", () => {
    const { lastFrame, unmount } = render(
      <PaneTitle label="Now" focused={false} width={30} />,
    )
    const out = lastFrame() ?? ""
    unmount()
    assert.ok(!out.includes("\u001b[48;"))
    assert.ok(!out.includes("\u001b[1m"))
    assert.ok(out.includes(`${MUTED}Now`), out)
    const [title, rule] = stripVTControlCharacters(out).split("\n")
    assert.match(title, /^ Now/)
    assert.equal(rule.trim(), "")
  })

  it("starts the label on the pane's text column", () => {
    const { lastFrame, unmount } = render(
      <PaneTitle label="Filters" focused width={20} indent={3} />,
    )
    const [title, rule] = stripVTControlCharacters(lastFrame() ?? "").split(
      "\n",
    )
    unmount()
    assert.equal(title.indexOf("Filters"), 3)
    assert.equal(rule.indexOf("▔"), 3)
  })
})

describe("filter list", () => {
  const MUTED = "\u001b[38;2;117;118;126m"
  const RED = "\u001b[38;2;255;83;100m"
  const item = (count: number) => ({
    id: "major" as const,
    name: "major",
    count,
    glyph: "●",
    color: "#FF5364",
  })

  it("dims an empty filter's count, never its glyph", () => {
    const { lastFrame, unmount } = render(
      <FilterList items={[item(0)]} active="all" focused full settled />,
    )
    const out = lastFrame() ?? ""
    unmount()
    assert.ok(out.includes(`${RED}●`), out)
    assert.ok(out.includes(`${MUTED}  0`), out)
  })

  it("draws no bars, names in full", () => {
    const { lastFrame, unmount } = render(
      <FilterList items={[item(3)]} active="all" focused full settled />,
    )
    const out = stripVTControlCharacters(lastFrame() ?? "")
    unmount()
    assert.match(out, /● major\s+3$/)
    assert.doesNotMatch(out, /▪/)
  })
})

describe("colour roles", () => {
  const ORANGE = "\u001b[38;2;255;140;0m"
  const RED = "\u001b[38;2;255;83;100m"
  const MUTED_AMBER = "\u001b[38;2;143;105;23m"
  const BAND = "\u001b[48;2;34;34;50m"

  it("keeps orange off the spinner while services are read", async () => {
    const { stdout, stdin } = terminal(160, 40)
    const app = renderAt(
      <App source={{ ...mockSource(400), view: "board" }} />,
      {
        stdout: stdout as unknown as NodeJS.WriteStream,
        stdin: stdin as unknown as NodeJS.ReadStream,
        debug: true,
        patchConsole: false,
        exitOnCtrlC: false,
      },
    )
    for (let i = 0; i < 120 && !/checking/.test(stdout.frame); i++)
      await new Promise((r) => setTimeout(r, 25))
    const frame = stdout.frame
    app.unmount()
    assert.match(stripVTControlCharacters(frame), /checking/)
    for (const c of frame
      .split(ORANGE)
      .slice(1)
      .map((s) => stripVTControlCharacters(s)[0]))
      assert.match(c, /[◆▔]/, frame)
  })

  for (const view of ["board", "list"] as const)
    it(`${view}: orange only on the brand and the focus underline`, async () => {
      const { stdout, stdin } = terminal(160, 40)
      const app = renderAt(<App source={{ ...mockSource(2), view }} />, {
        stdout: stdout as unknown as NodeJS.WriteStream,
        stdin: stdin as unknown as NodeJS.ReadStream,
        debug: true,
        patchConsole: false,
        exitOnCtrlC: false,
      })
      for (let i = 0; i < 120 && !/updated/.test(stdout.frame); i++)
        await new Promise((r) => setTimeout(r, 25))
      const frame = stdout.frame
      app.unmount()
      const after = frame
        .split(ORANGE)
        .slice(1)
        .map((s) => stripVTControlCharacters(s)[0])
      assert.ok(after.length > 0, frame)
      for (const c of after) assert.match(c, /[◆▔]/, frame)
      assert.ok(
        view === "board"
          ? // The selected card (Acme Cloud, major) in full red, the rest
            // in muted versions of their own hues.
            frame.includes(`${RED}┏`) && frame.includes(`${MUTED_AMBER}╭`)
          : // A row: the bright foreground, bold, on the faintest band.
            frame.includes(`\u001b[1m${BAND}❯`),
        frame,
      )
    })
})

describe("selection without colour", () => {
  it("under NO_COLOR, the selected card's title is drawn in inverse", async () => {
    process.env.NO_COLOR = "1"
    try {
      const { stdout, stdin } = terminal(160, 40)
      const app = renderAt(
        <App source={{ ...mockSource(2), view: "board" }} />,
        {
          stdout: stdout as unknown as NodeJS.WriteStream,
          stdin: stdin as unknown as NodeJS.ReadStream,
          debug: true,
          patchConsole: false,
          exitOnCtrlC: false,
        },
      )
      for (let i = 0; i < 120 && !/updated/.test(stdout.frame); i++)
        await new Promise((r) => setTimeout(r, 25))
      const frame = stdout.frame
      app.unmount()
      const inverted = frame.split("\u001b[7m").slice(1)
      assert.equal(inverted.length, 1, frame)
      assert.match(stripVTControlCharacters(inverted[0]), /^Acme Cloud/)
    } finally {
      delete process.env.NO_COLOR
    }
  })
})

describe("selection on a neutral card", () => {
  it("a selected pinned ok card takes the bright grey frame", async () => {
    const GREY = "\u001b[38;2;153;153;153m"
    const base = mockSource(2)
    const source = {
      ...base,
      view: "board" as const,
      services: base.services.map((s) =>
        s.id === "sample-registry" ? { ...s, pinned: true } : s,
      ),
    }
    const { stdout, stdin } = terminal(160, 40)
    const app = renderAt(<App source={source} />, {
      stdout: stdout as unknown as NodeJS.WriteStream,
      stdin: stdin as unknown as NodeJS.ReadStream,
      debug: true,
      patchConsole: false,
      exitOnCtrlC: false,
    })
    for (let i = 0; i < 120 && !/updated/.test(stdout.frame); i++)
      await new Promise((r) => setTimeout(r, 25))
    const frame = stdout.frame
    app.unmount()
    // The pin leads, so the cursor starts on it.
    assert.ok(frame.includes(`${GREY}╭`), frame)
  })
})
