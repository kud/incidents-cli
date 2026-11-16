import assert from "node:assert/strict"
import { describe, it } from "node:test"
import { stripVTControlCharacters } from "node:util"
import chalk from "chalk"
import { render } from "ink-testing-library"
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
