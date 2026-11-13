import assert from "node:assert/strict"
import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { describe, it } from "node:test"
import { defaultsNote, loadConfig } from "../src/config.js"
import { ConfigError } from "../src/core/index.js"

const home = () => mkdtempSync(join(tmpdir(), "incidents-"))
const envFor = (dir: string, extra: Record<string, string> = {}) => ({
  XDG_CONFIG_HOME: dir,
  ...extra,
})
const write = (dir: string, rel: string, body: string) => {
  const path = join(dir, "incidents", rel)
  mkdirSync(join(path, ".."), { recursive: true })
  writeFileSync(path, body)
  return path
}

describe("config", () => {
  it("falls back to the default set and names the config path", () => {
    const dir = home()
    const config = loadConfig(envFor(dir))
    assert.equal(config.source, "default")
    assert.deepEqual(Object.keys(config.services), [
      "github",
      "npm",
      "cloudflare",
      "claude",
    ])
    assert.match(defaultsNote(config) ?? "", /No config at .*config\.yml/)
  })

  it("reads services from config.yml and selects catalogue entries", () => {
    const dir = home()
    write(
      dir,
      "config.yml",
      "timeout: 2500\nservices:\n  vercel: {}\n  aws:\n    regions: [us-east-1]\n",
    )
    const config = loadConfig(envFor(dir))
    assert.equal(config.timeout, 2500)
    assert.deepEqual(Object.keys(config.services), ["vercel", "aws"])
    assert.deepEqual(config.services.aws.regions, ["us-east-1"])
    assert.equal(defaultsNote(config), null)
  })

  it("merges config.d files over it by id in lexical order", () => {
    const dir = home()
    write(dir, "config.yml", "services:\n  github: {}\n  npm: {}\n")
    write(dir, "config.d/20-b.yml", "services:\n  github:\n    name: Hub B\n")
    write(
      dir,
      "config.d/10-a.yml",
      "services:\n  github:\n    name: Hub A\n  npm:\n    enabled: false\n",
    )
    const config = loadConfig(envFor(dir))
    assert.equal(config.services.github.name, "Hub B")
    assert.equal(config.services.npm, undefined)
  })

  it("INCIDENTS_CONFIG replaces config.yml and config.d", () => {
    const dir = home()
    write(dir, "config.yml", "services:\n  github: {}\n")
    const only = join(dir, "only.yml")
    writeFileSync(only, "services:\n  docker: {}\n")
    const config = loadConfig(envFor(dir, { INCIDENTS_CONFIG: only }))
    assert.deepEqual(Object.keys(config.services), ["docker"])
  })

  it("a missing INCIDENTS_CONFIG file is an error, not a silent default", () => {
    assert.throws(
      () => loadConfig(envFor(home(), { INCIDENTS_CONFIG: "/nowhere/x.yml" })),
      ConfigError,
    )
  })

  it("rejects a service id named like a command", () => {
    const dir = home()
    write(
      dir,
      "config.yml",
      "services:\n  list:\n    kind: link\n    url: https://x.example\n",
    )
    assert.throws(() => loadConfig(envFor(dir)), /reserved/)
  })
})
