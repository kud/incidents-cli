import assert from "node:assert/strict"
import { spawnSync } from "node:child_process"
import { mkdtempSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { describe, it } from "node:test"
import { fileURLToPath } from "node:url"

const bin = fileURLToPath(new URL("../bin/incidents.ts", import.meta.url))
const home = mkdtempSync(join(tmpdir(), "incidents-cli-"))

const run = (...args: string[]) =>
  spawnSync(process.execPath, ["--import", "tsx", bin, ...args], {
    encoding: "utf8",
    timeout: 15_000,
    env: {
      ...process.env,
      XDG_CONFIG_HOME: home,
      INCIDENTS_CONFIG: "",
      NO_COLOR: "1",
      CI: "",
    },
  })

describe("cli without a terminal", () => {
  it("a bare call prints the classic overview and exits 1 when degraded", () => {
    const r = run("--mock")
    assert.equal(r.status, 1)
    assert.match(r.stdout, /Status\s+Service\s+Declared/)
  })

  it("list prints the same overview", () => {
    const r = run("list", "--mock")
    assert.equal(r.status, 1)
    assert.match(r.stdout, /● major\s+Acme Cloud/)
  })

  it("a service word renders its detail, never the interactive view", () => {
    const r = run("acme-cloud", "--mock")
    assert.equal(r.status, 1)
    assert.match(r.stdout, /Elevated API error rates/)
  })

  it("list <service> accepts an alias and exits 0 when it is clear", () => {
    const r = run("list", "sample-registry", "--mock")
    assert.equal(r.status, 0)
    assert.match(r.stdout, /operational/)
  })

  it("--json gives records on any form", () => {
    const all = JSON.parse(run("list", "--json", "--mock").stdout)
    assert.equal(all[0].id, "acme-cloud")
    assert.equal(typeof all[0].historyFailed, "boolean")
    const one = JSON.parse(run("acme-cloud", "--json", "--mock").stdout)
    assert.equal(one.id, "acme-cloud")
    assert.equal(one.historyLoaded, true)
    assert.equal(run("--json", "--mock").status, 1)
  })

  it("an unknown service is a usage error", () => {
    const r = run("list", "nope", "--mock")
    assert.equal(r.status, 2)
    assert.match(r.stderr, /no service 'nope'/)
  })

  it("services prints id, name and aliases, one service per line", () => {
    const r = run("services", "--mock")
    assert.equal(r.status, 0)
    const lines = r.stdout.trim().split("\n")
    assert.equal(lines.length, 7)
    assert.equal(lines[4], "demo-feed\tDemo Feed\tfeed")
    assert.equal(lines[0], "acme-cloud\tAcme Cloud\t")
  })

  it("CI set prints the plain detail, like list <service>", () => {
    const a = run("acme-cloud", "--mock")
    const b = run("list", "acme-cloud", "--mock")
    assert.equal(a.stdout, b.stdout)
    assert.equal(a.status, 1)
  })

  it("--screen list prints the screen names", () => {
    const r = run("--screen", "list")
    assert.equal(r.status, 0)
    assert.equal(r.stdout, "overview\ndetail\n")
  })

  it("a configured service called list is refused", () => {
    const r = spawnSync(process.execPath, ["--import", "tsx", bin, "list"], {
      encoding: "utf8",
      env: {
        ...process.env,
        INCIDENTS_CONFIG: fileURLToPath(
          new URL("./fixtures/reserved.yml", import.meta.url),
        ),
      },
    })
    assert.equal(r.status, 2)
    assert.match(r.stderr, /reserved/)
  })
})
