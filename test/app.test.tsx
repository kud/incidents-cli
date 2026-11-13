import assert from "node:assert/strict"
import { describe, it } from "node:test"
import { render } from "ink-testing-library"
import { App } from "../src/ui/app.js"
import { mockSource } from "../src/source.js"
import { bodyOf } from "./helpers.js"

const tick = (ms = 60) => new Promise((r) => setTimeout(r, ms))

const selectedLine = (frame: string | undefined): string =>
  (frame ?? "").split("\n").find((line) => bodyOf(line).includes("❯")) ?? ""

const until = async (frame: () => string | undefined, pattern: RegExp) => {
  for (
    let waited = 0;
    waited < 3000 && !pattern.test(frame() ?? "");
    waited += 25
  )
    await tick(25)
  return frame() ?? ""
}

describe("interactive view", () => {
  it("fills rows in as services answer, worst first", async () => {
    const { lastFrame, unmount } = render(
      <App source={{ ...mockSource(5), view: "list" }} />,
    )
    await tick(300)
    const frame = lastFrame() ?? ""
    assert.match(frame, /Acme Cloud/)
    assert.ok(frame.indexOf("Acme Cloud") < frame.indexOf("Placeholder Mail"))
    assert.ok(
      frame.indexOf("Placeholder Mail") < frame.indexOf("Brightgate Auth"),
    )
    assert.match(frame, /Acme Cloud\s+● {2}Elevated API error rates/)
    unmount()
  })

  it("enter opens a detail, esc comes back, q is the app's", async () => {
    const { lastFrame, stdin, unmount } = render(
      <App source={{ ...mockSource(5), view: "list" }} />,
    )
    await tick(300)
    stdin.write("\r")
    const detail = await until(lastFrame, /Delayed webhook delivery/)
    assert.match(detail, /Elevated API error rates/)
    assert.match(detail, /Delayed webhook delivery/)
    stdin.write(String.fromCharCode(27))
    await tick(150)
    assert.match(lastFrame() ?? "", /Declared status only/)
    unmount()
  })

  it("opens straight on a service when asked", async () => {
    const { lastFrame, unmount } = render(
      <App
        source={{ ...mockSource(5), view: "list" }}
        initialDetail="example-cdn"
      />,
    )
    await tick(300)
    assert.match(lastFrame() ?? "", /Edge cache/)
    unmount()
  })

  it("r refreshes without dropping the rows already on screen", async () => {
    const { lastFrame, stdin, unmount } = render(
      <App source={{ ...mockSource(5), view: "list" }} />,
    )
    await tick(300)
    stdin.write("r")
    await tick(10)
    assert.match(lastFrame() ?? "", /Acme Cloud/)
    unmount()
  })

  it("the cursor follows the service, not the row, across the re-sort", async () => {
    const { lastFrame, stdin, unmount } = render(
      <App source={{ ...mockSource(15), view: "list" }} />,
    )
    await tick(40)
    stdin.write("j")
    await tick(20)
    stdin.write("j")
    await tick(20)
    assert.match(selectedLine(lastFrame()), /Sample Registry/)
    await until(lastFrame, /updated/)
    await tick(60)
    assert.match(selectedLine(lastFrame()), /Sample Registry/)
    unmount()
  })

  it("z folds the healthy rows and says how to bring them back", async () => {
    const { lastFrame, stdin, unmount } = render(
      <App source={{ ...mockSource(2), view: "list" }} />,
    )
    await until(lastFrame, /updated/)
    stdin.write("z")
    const frame = await until(lastFrame, /operational hidden/)
    assert.match(frame, /9 operational hidden · z show/)
    assert.doesNotMatch(frame, /Harbour CI/)
    stdin.write("z")
    await tick(60)
    assert.doesNotMatch(lastFrame() ?? "", /operational hidden/)
    unmount()
  })

  it("/ narrows by name, the tabs count what is left, esc clears", async () => {
    const { lastFrame, stdin, unmount } = render(
      <App source={{ ...mockSource(2), view: "list" }} />,
    )
    await until(lastFrame, /updated/)
    stdin.write("/")
    await tick(30)
    stdin.write("mossline")
    const frame = await until(lastFrame, /not matching/)
    assert.match(frame, /Mossline DNS/)
    assert.doesNotMatch(frame, /Acme Cloud/)
    assert.match(frame, /20 not matching “mossline” · esc clear/)
    stdin.write(String.fromCharCode(27))
    await tick(60)
    stdin.write(String.fromCharCode(27))
    await until(lastFrame, /Acme Cloud/)
    assert.doesNotMatch(lastFrame() ?? "", /not matching/)
    unmount()
  })

  it("v switches to the board and back", async () => {
    const { lastFrame, stdin, unmount } = render(
      <App source={{ ...mockSource(2), view: "list" }} />,
    )
    await until(lastFrame, /updated/)
    stdin.write("v")
    assert.match(await until(lastFrame, /v list/), /v list/)
    stdin.write("v")
    await tick(60)
    assert.match(lastFrame() ?? "", /v board/)
    unmount()
  })

  it("starts on the board when the source asks for it", async () => {
    const { lastFrame, unmount } = render(
      <App source={{ ...mockSource(2), view: "board" }} />,
    )
    await until(lastFrame, /updated/)
    assert.match(lastFrame() ?? "", /v list/)
    unmount()
  })

  // The list's lines on screen, between the tabs and the footer, edge blanks
  // trimmed: a blank left inside is a break between severity runs.
  const isBlank = (line: string) => line.replace(/[│\s]/g, "") === ""
  const listLines = (frame: string): string[] => {
    const lines = frame.split("\n")
    const from = lines.findIndex((l) => l.includes("Services")) + 1
    const to = lines.findIndex((l) => l.includes("Declared status only"))
    const body = lines.slice(from, to).map(bodyOf)
    while (body.length && isBlank(body[0])) body.shift()
    while (body.length && isBlank(body.at(-1)!)) body.pop()
    return body
  }

  it("s sorts by name with no severity runs, and back to worst first", async () => {
    const { lastFrame, stdin, unmount } = render(
      <App source={{ ...mockSource(2), view: "list" }} />,
    )
    await until(lastFrame, /updated/)
    assert.ok(listLines(lastFrame() ?? "").some(isBlank))
    stdin.write("s")
    const named = await until(lastFrame, /s by status/)
    assert.match(named, /by name/)
    assert.match(selectedLine(named), /Acme Cloud/)
    assert.ok(!listLines(named).some(isBlank))
    for (let i = 0; i < 20; i++) {
      stdin.write("j")
      await tick(10)
    }
    const end = await until(lastFrame, /21 of 21/)
    assert.match(selectedLine(end), /Wicker Video/)
    assert.ok(!listLines(end).some(isBlank))
    stdin.write("s")
    const back = await until(lastFrame, /s by name/)
    assert.match(back, /by status ↓/)
    assert.ok(listLines(back).some(isBlank))
    unmount()
  })

  it("starts alphabetical when the source asks for it", async () => {
    const { lastFrame, unmount } = render(
      <App source={{ ...mockSource(2), sort: "name" }} />,
    )
    const frame = lastFrame() ?? ""
    assert.ok(frame.indexOf("Acme Cloud") < frame.indexOf("Brightgate Auth"))
    assert.ok(
      frame.indexOf("Brightgate Auth") < frame.indexOf("Copperleaf Pay"),
    )
    unmount()
  })
})
