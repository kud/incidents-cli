import { spawn } from "node:child_process"
import { diffSnapshots, type Change, type Snapshot } from "./core/index.js"
import type { Source } from "./source.js"

export const EXEC_TIMEOUT_MS = 30_000

const time = (iso: string): string => {
  const d = new Date(iso)
  const pad = (n: number) => String(n).padStart(2, "0")
  return `${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`
}

export const formatChange = (change: Change): string => {
  const move =
    change.from === null
      ? `already ${change.to}`
      : `${change.from} → ${change.to}`
  const tail = [change.headline, change.url].filter(Boolean).join("  ")
  return `${time(change.at)}  ${change.name}  ${move}${tail ? `  ${tail}` : ""}`
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
  now?: () => Date
}

// Polls until the signal aborts (or `polls` is reached), printing one line
// per change and running --exec once per change.
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
  now = () => new Date(),
}: WatchOptions): Promise<void> => {
  let previous: Snapshot | null = null
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
    previous = snapshot
    for (const change of changes)
      out(json ? JSON.stringify(change) : formatChange(change))
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
