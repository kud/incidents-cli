import { spawn } from "node:child_process"
import {
  diffSnapshots,
  type Change,
  type Level,
  type Snapshot,
} from "./core/index.js"
import type { Source } from "./source.js"

export const EXEC_TIMEOUT_MS = 30_000

const two = (n: number) => String(n).padStart(2, "0")
const time = (d: Date): string =>
  `${two(d.getHours())}:${two(d.getMinutes())}:${two(d.getSeconds())}`
const day = (d: Date): string =>
  `${d.getFullYear()}-${two(d.getMonth() + 1)}-${two(d.getDate())}`

const LEVELS: Level[] = ["clear", "minor", "major", "critical", "unreadable"]
// The widest move a line can show, so every headline starts in one column.
const MOVE_W = Math.max(
  ...LEVELS.flatMap((a) =>
    LEVELS.filter((b) => b !== a).map((b) => `${a} → ${b}`.length),
  ),
)

// One line per change, in columns: the time, the service, `old → new`, then
// the headline and the link. Once the watch has run past midnight, the date
// leads, so a line read the next morning says which night it was.
export const formatChange = (
  change: Change,
  { nameWidth = 0, since }: { nameWidth?: number; since?: Date } = {},
): string => {
  const at = new Date(change.at)
  const stamp =
    since && day(at) !== day(since) ? `${day(at)} ${time(at)}` : time(at)
  const move = `${change.from ?? "new"} → ${change.to}`
  const tail = [change.headline, change.url].filter(Boolean).join("  ")
  return [
    stamp,
    change.name.padEnd(nameWidth),
    tail ? move.padEnd(MOVE_W) : move,
    tail,
  ]
    .filter(Boolean)
    .join("  ")
}

// "every 5m", "every 30s", "every 1h 30m".
const every = (ms: number): string => {
  if (ms < 1000) return `${ms}ms`
  const s = Math.round(ms / 1000)
  if (s < 60) return `${s}s`
  const m = Math.round(s / 60)
  return m < 60
    ? `${m}m`
    : `${Math.floor(m / 60)}h${m % 60 ? ` ${m % 60}m` : ""}`
}

export type ExecResult = { ok: true } | { ok: false; reason: string }

// Runs one --exec command through the user's shell. The change goes in as
// JSON on stdin and as INCIDENTS_* variables; the command's own output goes
// to stderr so a --json stream on stdout stays parseable. Never throws.
export const runExec = (
  command: string,
  change: Change,
  {
    timeoutMs = EXEC_TIMEOUT_MS,
    signal,
    shell = process.env.SHELL || "/bin/sh",
  }: { timeoutMs?: number; signal?: AbortSignal; shell?: string } = {},
): Promise<ExecResult> =>
  new Promise((resolve) => {
    let settled = false
    const done = (result: ExecResult) => {
      if (settled) return
      settled = true
      clearTimeout(timer)
      signal?.removeEventListener("abort", onAbort)
      resolve(result)
    }
    const child = spawn(shell, ["-c", command], {
      stdio: ["pipe", 2, 2],
      detached: true,
      env: {
        ...process.env,
        INCIDENTS_SERVICE: change.service,
        INCIDENTS_FROM: change.from ?? "",
        INCIDENTS_TO: change.to,
        INCIDENTS_HEADLINE: change.headline,
        INCIDENTS_URL: change.url,
      },
    })
    // The whole process group, so a shell's children go with it.
    const kill = () => {
      try {
        if (child.pid) process.kill(-child.pid, "SIGKILL")
      } catch {
        // already gone
      }
    }
    const timer = setTimeout(() => {
      kill()
      done({
        ok: false,
        reason: `timed out after ${timeoutMs / 1000}s`,
      })
    }, timeoutMs)
    const onAbort = () => {
      kill()
      done({ ok: true })
    }
    signal?.addEventListener("abort", onAbort, { once: true })
    child.on("error", (error) => done({ ok: false, reason: error.message }))
    child.on("exit", (code, sig) =>
      done(
        code === 0
          ? { ok: true }
          : { ok: false, reason: sig ? `killed by ${sig}` : `exit ${code}` },
      ),
    )
    child.stdin?.on("error", () => {
      // the command may exit without reading its input
    })
    child.stdin?.end(`${JSON.stringify(change)}\n`)
  })

const pause = (ms: number, signal: AbortSignal): Promise<void> =>
  new Promise((resolve) => {
    if (signal.aborted) return resolve()
    const timer = setTimeout(done, ms)
    function done() {
      clearTimeout(timer)
      signal.removeEventListener("abort", done)
      resolve()
    }
    signal.addEventListener("abort", done, { once: true })
  })

export interface WatchOptions {
  source: Source
  intervalMs: number
  json?: boolean
  exec?: string
  execTimeoutMs?: number
  polls?: number
  signal: AbortSignal
  out?: (line: string) => void
  err?: (line: string) => void
  // Where the start line goes: stderr, so stdout carries only changes.
  info?: (line: string) => void
  now?: () => Date
}

// Polls until the signal aborts (or `polls` is reached), printing one line
// per change and running --exec once per change. The first poll sets the
// baseline: as text it is one start line on stderr, saying how many are in
// trouble already, rather than a line per service; as JSON, and to --exec,
// each service already in trouble is still a change from nothing.
export const watch = async ({
  source,
  intervalMs,
  json = false,
  exec,
  execTimeoutMs,
  polls = Infinity,
  signal,
  out = (line) => process.stdout.write(`${line}\n`),
  err = (line) => process.stderr.write(`incidents: ${line}\n`),
  info = (line) => process.stderr.write(`${line}\n`),
  now = () => new Date(),
}: WatchOptions): Promise<void> => {
  let previous: Snapshot | null = null
  const since = now()
  const nameWidth = Math.max(0, ...source.services.map((s) => s.name.length))
  for (let poll = 0; poll < polls && !signal.aborted; poll++) {
    if (poll > 0) await pause(intervalMs, signal)
    if (signal.aborted) break
    let records
    try {
      records = await source.readAll({ signal })
    } catch (error) {
      if (signal.aborted) break
      throw error
    }
    const { snapshot, changes } = diffSnapshots(
      previous,
      records,
      now().toISOString(),
    )
    if (previous === null) {
      const n = source.services.length
      info(
        `watching ${n} service${n === 1 ? "" : "s"} every ${every(intervalMs)}${changes.length ? ` · ${changes.length} in trouble now` : ""}`,
      )
    }
    for (const change of changes)
      if (json) out(JSON.stringify(change))
      else if (previous !== null)
        out(formatChange(change, { nameWidth, since }))
    previous = snapshot
    if (!exec) continue
    const results = await Promise.all(
      changes.map((change) =>
        runExec(exec, change, { timeoutMs: execTimeoutMs, signal }),
      ),
    )
    results.forEach((result, i) => {
      if (!result.ok)
        err(`--exec failed for ${changes[i].service} (${result.reason})`)
    })
  }
}
