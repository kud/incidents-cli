import assert from "node:assert/strict"
import { describe, it } from "node:test"
import { stripVTControlCharacters } from "node:util"
import { render } from "ink"
import { App } from "../src/ui/app.js"
import { linkTarget } from "../src/open-url.js"
import { mockSource } from "../src/source.js"
import { terminal } from "./helpers.js"

const tick = (ms = 60) => new Promise((r) => setTimeout(r, ms))
const until = async (frame: () => string, pattern: RegExp) => {
  for (let waited = 0; waited < 3000 && !pattern.test(frame()); waited += 25)
    await tick(25)
  return frame()
}

const INCIDENT = "https://status.acme-cloud.example.com/incidents/a1"
const UP = "\x1b[A"
const ENTER = "\r"

const open = async (view: "list" | "board", columns = 160) => {
  const opened: string[] = []
  const { stdout, stdin } = terminal(columns, 40)
  const app = render(
    <App
      source={{ ...mockSource(2), view }}
      openUrl={(url) => opened.push(url)}
    />,
    {
      stdout: stdout as unknown as NodeJS.WriteStream,
      stdin: stdin as unknown as NodeJS.ReadStream,
      debug: true,
      patchConsole: false,
      exitOnCtrlC: false,
    },
  )
  const frame = () => stripVTControlCharacters(stdout.frame)
  await until(frame, /updated/)
  const press = async (key: string) => {
    stdin.press(key)
    await tick(40)
  }
  return { app, opened, press, frame, raw: () => stdout.frame }
}

describe("o opens in the browser", () => {
  it("prefers the open incident, else the status page", () => {
    const service = { url: "https://status.example.com" }
    assert.equal(linkTarget(service), "https://status.example.com")
    assert.equal(
      linkTarget(service, {
        url: "https://status.example.com",
        active: [
          { title: "t", link: "https://status.example.com/i/1", date: "" },
        ],
      }),
      "https://status.example.com/i/1",
    )
    assert.equal(
      linkTarget(service, { url: "https://status.example.com", active: [] }),
      "https://status.example.com",
    )
  })

  for (const view of ["list", "board"] as const)
    it(`${view}: the incident on an incident row, the page on a quiet one`, async () => {
      const { app, opened, press } = await open(view)
      await press("o")
      assert.deepEqual(opened, [INCIDENT])
      // The last service by status is healthy, with no incident to open.
      for (let i = 0; i < 30; i++) await press("\x1b[B")
      await press("o")
      assert.equal(opened.length, 2)
      assert.doesNotMatch(opened[1], /\/incidents\//)
      app.unmount()
    })

  it("answers on a service's page too", async () => {
    const { app, opened, press, frame } = await open("list")
    await press(ENTER)
    await until(frame, /Incidents › Acme Cloud/)
    await press("o")
    assert.deepEqual(opened, [INCIDENT])
    assert.match(frame(), /o browser/)
    app.unmount()
  })

  it("does nothing with the keys overlay open", async () => {
    const { app, opened, press } = await open("list")
    await press("?")
    await press("o")
    assert.deepEqual(opened, [])
    await press(UP)
    app.unmount()
  })

  it("prints status-page addresses as OSC 8 hyperlinks", async () => {
    const { app, raw } = await open("list", 230)
    assert.ok(
      raw().includes("\u001B]8;;https://status.acme-cloud.example.com"),
      raw(),
    )
    app.unmount()
  })
})
