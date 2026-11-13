import assert from "node:assert/strict"
import { describe, it } from "node:test"
import { canBeInteractive } from "../src/mode.js"

const tty = { stdinTTY: true, stdoutTTY: true, env: {}, json: false }

describe("interactive mode", () => {
  it("needs a TTY on both ends", () => {
    assert.equal(canBeInteractive(tty), true)
    assert.equal(canBeInteractive({ ...tty, stdinTTY: false }), false)
    assert.equal(canBeInteractive({ ...tty, stdoutTTY: false }), false)
  })

  it("never under CI or --json", () => {
    assert.equal(canBeInteractive({ ...tty, env: { CI: "true" } }), false)
    assert.equal(canBeInteractive({ ...tty, json: true }), false)
    assert.equal(canBeInteractive({ ...tty, env: { CI: "" } }), true)
  })
})
