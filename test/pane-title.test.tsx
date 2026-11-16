import assert from "node:assert/strict"
import { describe, it } from "node:test"
import { stripVTControlCharacters } from "node:util"
import chalk from "chalk"
import { render } from "ink-testing-library"
import { FilterList, PaneTitle } from "../src/ui/filter-column.js"

// Colour is the point here, so this file forces it on.
chalk.level = 3

describe("pane title", () => {
  it("fills the focused title as an accent pill in the base colour", () => {
    const { lastFrame, unmount } = render(
      <PaneTitle label="History" count={40} focused width={30} />,
    )
    const out = lastFrame() ?? ""
    unmount()
    // Accent #FF8C00 behind, base #1A1B27 on top, bold, a space either side.
    assert.ok(out.includes("\u001b[48;2;255;140;0m"))
    assert.ok(out.includes("\u001b[38;2;26;27;39m"))
    assert.ok(out.includes("\u001b[1m"))
    assert.doesNotMatch(out, /▍/)
    assert.match(stripVTControlCharacters(out), /^ History {2}40/)
  })

  it("leaves the unfocused title plain, in the terminal's foreground", () => {
    const { lastFrame, unmount } = render(
      <PaneTitle label="Now" focused={false} width={30} />,
    )
    const out = lastFrame() ?? ""
    unmount()
    assert.ok(!out.includes("\u001b[48;"))
    assert.ok(!out.includes("\u001b[1m"))
    // The terminal's own foreground: no colour of its own.
    assert.ok(!out.includes("\u001b[38;"))
    assert.match(stripVTControlCharacters(out), /^ Now/)
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
