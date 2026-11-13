import assert from "node:assert/strict"
import { describe, it } from "node:test"
import { render } from "ink-testing-library"
import { App } from "../src/ui/app.js"
import { mockSource } from "../src/source.js"

const tick = (ms = 60) => new Promise((r) => setTimeout(r, ms))

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
    const { lastFrame, unmount } = render(<App source={mockSource(5)} />)
    await tick(300)
    const frame = lastFrame() ?? ""
    assert.match(frame, /Acme Cloud/)
    assert.ok(frame.indexOf("Acme Cloud") < frame.indexOf("Sample Registry"))
    assert.match(frame, /● major/)
    unmount()
  })

  it("enter opens a detail, esc comes back, q is the app's", async () => {
    const { lastFrame, stdin, unmount } = render(<App source={mockSource(5)} />)
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
      <App source={mockSource(5)} initialDetail="example-cdn" />,
    )
    await tick(300)
    assert.match(lastFrame() ?? "", /Edge cache/)
    unmount()
  })

  it("r refreshes without dropping the rows already on screen", async () => {
    const { lastFrame, stdin, unmount } = render(<App source={mockSource(5)} />)
    await tick(300)
    stdin.write("r")
    await tick(10)
    assert.match(lastFrame() ?? "", /Acme Cloud/)
    unmount()
  })
})
