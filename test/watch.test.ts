import assert from "node:assert/strict"
import { spawn, spawnSync } from "node:child_process"
import { mkdtempSync, readFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { describe, it } from "node:test"
import { fileURLToPath } from "node:url"
import {
  diffSnapshots,
  levelOf,
  type Change,
  type ServiceRecord,
} from "../src/core/index.js"
import { mockWatchSource } from "../src/source.js"
import { formatChange, runExec, watch } from "../src/watch.js"

const AT = "2026-01-01T10:00:00.000Z"

const rec = (id: string, over: Partial<ServiceRecord> = {}): ServiceRecord => ({
  id,
  name: id.toUpperCase(),
  url: `https://status.${id}.example`,
  kind: "statuspage",
  fetched: "ok",
  indicator: "none",
  description: "All Systems Operational",
  components: [],
  active: [],
  recent: [],
  historyLoaded: false,
  historyFailed: false,
  note: "",
  ...over,
})

const down = (id: string, indicator: ServiceRecord["indicator"] = "major") =>
  rec(id, {
    indicator,
    description: "Partial System Outage",
    active: [{ title: "API errors", link: `https://x/${id}`, date: AT }],
  })

const unreadable = (id: string) =>
  rec(id, {
    fetched: "failed",
    indicator: "unknown",
    description: "Could not read the page (timed out)",
  })

const moves = (changes: Change[]) =>
  changes.map((c) => `${c.service}:${c.from}>${c.to}`)

describe("levelOf", () => {
  it("folds clear indicators and treats an unread page as unreadable", () => {
    assert.equal(levelOf(rec("a")), "clear")
    assert.equal(levelOf(rec("a", { indicator: "maintenance" })), "clear")
    assert.equal(levelOf(rec("a", { indicator: "link" })), "clear")
    assert.equal(levelOf(down("a", "minor")), "minor")
    assert.equal(levelOf(down("a", "critical")), "critical")
    assert.equal(levelOf(unreadable("a")), "unreadable")
    assert.equal(levelOf(rec("a", { indicator: "unknown" })), "unreadable")
  })
})

describe("diffSnapshots", () => {
  it("the first poll reports only services already in trouble", () => {
    const { changes, snapshot } = diffSnapshots(
      null,
      [rec("a"), down("b"), unreadable("c")],
      AT,
    )
    assert.deepEqual(moves(changes), ["b:null>major", "c:null>unreadable"])
    assert.deepEqual(snapshot, { a: "clear", b: "major", c: "unreadable" })
    assert.deepEqual(changes[0], {
      service: "b",
      name: "B",
      from: null,
      to: "major",
      headline: "API errors",
      url: "https://x/b",
      at: AT,
    })
  })

  it("reports each transition once", () => {
    const step = (prev: ReturnType<typeof diffSnapshots>, r: ServiceRecord) =>
      diffSnapshots(prev.snapshot, [r], AT)
    const base = diffSnapshots(null, [rec("a")], AT)
    const trouble = step(base, down("a", "minor"))
    assert.deepEqual(moves(trouble.changes), ["a:clear>minor"])
    const worse = step(trouble, down("a", "major"))
    assert.deepEqual(moves(worse.changes), ["a:minor>major"])
    const lost = step(worse, unreadable("a"))
    assert.deepEqual(moves(lost.changes), ["a:major>unreadable"])
    const back = step(lost, rec("a"))
    assert.deepEqual(moves(back.changes), ["a:unreadable>clear"])
    assert.equal(back.changes[0].headline, "All Systems Operational")
    assert.equal(back.changes[0].url, "https://status.a.example")
  })

  it("is silent when nothing changed, even if the details did", () => {
    const first = diffSnapshots(null, [down("a"), rec("b")], AT)
    const again = diffSnapshots(
      first.snapshot,
      [
        rec("a", { indicator: "major", description: "Other words" }),
        rec("b", { indicator: "maintenance" }),
      ],
      AT,
    )
    assert.deepEqual(again.changes, [])
  })

  it("an unreadable page is a change, never silence", () => {
    const first = diffSnapshots(null, [rec("a")], AT)
    const next = diffSnapshots(first.snapshot, [unreadable("a")], AT)
    assert.deepEqual(moves(next.changes), ["a:clear>unreadable"])
  })
})

describe("formatChange", () => {
  it("names the move, the headline and the link", () => {
    const [change] = diffSnapshots({ a: "clear" }, [down("a")], AT).changes
    assert.match(
      formatChange(change),
      /^\d\d:\d\d:\d\d {2}A {2}clear → major {2}API errors {2}https:\/\/x\/a$/,
    )
    const [first] = diffSnapshots(null, [down("a")], AT).changes
    assert.match(formatChange(first), /A {2}already major/)
  })
})

const change: Change = {
  service: "a",
  name: "A",
  from: "clear",
  to: "major",
  headline: "API errors",
  url: "https://x/a",
  at: AT,
}

describe("runExec", () => {
  it("passes the change on stdin and as variables", async () => {
    const dir = mkdtempSync(join(tmpdir(), "incidents-exec-"))
    const file = join(dir, "out")
    const result = await runExec(
      `cat > "${file}"; printf '%s|%s|%s|%s' "$INCIDENTS_SERVICE" "$INCIDENTS_FROM" "$INCIDENTS_TO" "$INCIDENTS_HEADLINE" >> "${file}"`,
      change,
      { shell: "/bin/sh" },
    )
    assert.deepEqual(result, { ok: true })
    const [json, vars] = readFileSync(file, "utf8").split("\n")
    assert.deepEqual(JSON.parse(json), change)
    assert.equal(vars, "a|clear|major|API errors")
  })

  it("reports a failing command without throwing", async () => {
    const result = await runExec("exit 3", change, { shell: "/bin/sh" })
    assert.deepEqual(result, { ok: false, reason: "exit 3" })
  })

  it("kills a hanging command at the timeout", async () => {
    const started = Date.now()
    const result = await runExec("sleep 10", change, {
      shell: "/bin/sh",
      timeoutMs: 200,
    })
    assert.deepEqual(result, { ok: false, reason: "timed out after 0.2s" })
    assert.ok(Date.now() - started < 2000)
  })
})

describe("watch", () => {
  const collect = async (opts: Partial<Parameters<typeof watch>[0]> = {}) => {
    const out: string[] = []
    const err: string[] = []
    await watch({
      source: mockWatchSource(),
      intervalMs: 1,
      polls: 4,
      signal: new AbortController().signal,
      out: (line) => out.push(line),
      err: (line) => err.push(line),
      ...opts,
    })
    return { out, err }
  }

  it("prints one JSON line per flip in the mock scenario, none on a quiet poll", async () => {
    const { out } = await collect({ json: true, polls: 3 })
    const changes = out.map((line) => JSON.parse(line) as Change)
    const later = changes.filter((c) => c.from !== null)
    assert.deepEqual(moves(later), [
      "sample-registry:clear>major",
      "placeholder-mail:unreadable>clear",
    ])
    assert.ok(changes.every((c) => c.from !== null || c.to !== "clear"))
  })

  it("a failing --exec is reported per change and the watch carries on", async () => {
    const { out, err } = await collect({ exec: "exit 1" })
    assert.equal(err.length, out.length)
    assert.match(err[0], /^--exec failed for acme-cloud \(exit 1\)$/)
    assert.ok(out.some((line) => line.includes("unreadable → clear")))
    assert.ok(out.some((line) => line.includes("clear → unreadable")))
  })

  it("stops at once when aborted", async () => {
    const controller = new AbortController()
    const started = Date.now()
    setTimeout(() => controller.abort(), 50)
    await collect({
      intervalMs: 60_000,
      polls: Infinity,
      signal: controller.signal,
    })
    assert.ok(Date.now() - started < 2000)
  })
})

describe("incidents watch", () => {
  const bin = fileURLToPath(new URL("../bin/incidents.ts", import.meta.url))
  const env = {
    ...process.env,
    XDG_CONFIG_HOME: mkdtempSync(join(tmpdir(), "incidents-cli-")),
    INCIDENTS_CONFIG: "",
    NO_COLOR: "1",
  }
  const args = (...rest: string[]) => [
    "--import",
    "tsx",
    bin,
    "watch",
    "--mock",
    ...rest,
  ]

  it("runs --exec once per change across polls with --mock", () => {
    const dir = mkdtempSync(join(tmpdir(), "incidents-watch-"))
    const file = join(dir, "log")
    const r = spawnSync(
      process.execPath,
      args(
        "--json",
        "--interval-seconds",
        "0.1",
        "--polls",
        "4",
        "--exec",
        `printf '%s>%s\\n' "$INCIDENTS_FROM" "$INCIDENTS_TO" >> "${file}"`,
      ),
      { encoding: "utf8", timeout: 15_000, env },
    )
    assert.equal(r.status, 0)
    const lines = r.stdout.trim().split("\n")
    const ran = readFileSync(file, "utf8").trim().split("\n")
    assert.equal(ran.length, lines.length)
    const later = lines
      .map((line) => JSON.parse(line) as Change)
      .filter((c) => c.from !== null)
    assert.deepEqual(moves(later), [
      "sample-registry:clear>major",
      "placeholder-mail:unreadable>clear",
      "acme-cloud:major>clear",
      "sample-registry:major>minor",
      "placeholder-mail:clear>unreadable",
    ])
  })

  it("rejects a bad interval as a usage error", () => {
    const r = spawnSync(process.execPath, args("--interval", "0"), {
      encoding: "utf8",
      timeout: 15_000,
      env,
    })
    assert.equal(r.status, 2)
    assert.match(r.stderr, /--interval needs a number greater than 0/)
  })

  it("exits 0 on SIGINT", async () => {
    const child = spawn(process.execPath, args("--interval", "5"), { env })
    let stdout = ""
    child.stdout.on("data", (chunk) => {
      const first = !stdout.includes("Acme Cloud")
      stdout += chunk
      if (first && stdout.includes("Acme Cloud")) child.kill("SIGINT")
    })
    const code = await new Promise((resolve) => child.on("exit", resolve))
    assert.equal(code, 0)
    assert.match(stdout, /Acme Cloud {2}already major/)
  })
})
