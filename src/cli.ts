import { loadConfig, defaultsNote } from "./config.js"
import {
  ConfigError,
  exitCode,
  resolveService,
  worstFirst,
  type Service,
} from "./core/index.js"
import { canBeInteractive } from "./mode.js"
import { renderDetail, renderOverview } from "./render.js"
import {
  liveSource,
  mockSource,
  mockWatchSource,
  type Source,
} from "./source.js"
import { watch as watchLoop } from "./watch.js"

export interface Flags {
  json?: boolean
  mock?: boolean
  screen?: string
}

export const SCREENS = ["overview", "detail"]

interface Context {
  source: Source
  registry: Record<string, Service>
}

const makeContext = (flags: Flags, version: string): Context => {
  const source = flags.mock
    ? mockSource()
    : (() => {
        const config = loadConfig()
        return liveSource(config, version, defaultsNote(config))
      })()
  return {
    source,
    registry: Object.fromEntries(source.services.map((s) => [s.id, s])),
  }
}

const write = (text: string): void => {
  process.stdout.write(text.endsWith("\n") ? text : `${text}\n`)
}

const fail = (message: string): 2 => {
  process.stderr.write(`incidents: ${message}\n`)
  return 2
}

const pretty = () => {
  const color = Boolean(process.stdout.isTTY) && !process.env.NO_COLOR
  return { color, links: color }
}

const unknownService = (word: string, registry: Record<string, Service>) =>
  fail(
    `no service '${word}'. Known: ${Object.keys(registry).sort().join(", ")}`,
  )

const classic = async (
  word: string | undefined,
  flags: Flags,
  { source, registry }: Context,
): Promise<number> => {
  if (word !== undefined) {
    const service = resolveService(registry, word)
    if (!service) return unknownService(word, registry)
    const record = await source.readDetail(service, {})
    write(
      flags.json
        ? JSON.stringify(record, null, 2)
        : renderDetail(record, { ...pretty(), note: source.note }),
    )
    return exitCode([record])
  }
  if (source.services.length === 0) {
    write("No services configured.")
    return 0
  }
  const records = worstFirst(await source.readAll({}))
  write(
    flags.json
      ? JSON.stringify(records, null, 2)
      : renderOverview(records, { ...pretty(), note: source.note }),
  )
  return exitCode(records)
}

const interactive = async (
  word: string | undefined,
  flags: Flags,
  { source, registry }: Context,
): Promise<number> => {
  const target = word !== undefined ? resolveService(registry, word) : undefined
  if (word !== undefined && !target) return unknownService(word, registry)
  const initialDetail =
    target?.id ??
    (flags.screen === "detail" ? source.services[0]?.id : undefined)
  const { render } = await import("ink")
  const { createElement } = await import("react")
  const { App } = await import("./ui/app.js")
  const app = render(createElement(App, { source, initialDetail }), {
    alternateScreen: true,
  })
  await app.waitUntilExit()
  return 0
}

export const open = async (
  word: string | undefined,
  flags: Flags,
  version: string,
): Promise<number> => {
  if (flags.screen === "list") {
    write(SCREENS.join("\n"))
    return 0
  }
  if (flags.screen !== undefined && !SCREENS.includes(flags.screen))
    return fail(`no screen '${flags.screen}'. Known: ${SCREENS.join(", ")}`)
  const context = makeContext(flags, version)
  const tty = canBeInteractive({
    stdinTTY: Boolean(process.stdin.isTTY),
    stdoutTTY: Boolean(process.stdout.isTTY),
    env: process.env,
    json: Boolean(flags.json),
  })
  return tty
    ? interactive(word, flags, context)
    : classic(
        word ??
          (flags.screen === "detail"
            ? context.source.services[0]?.id
            : undefined),
        flags,
        context,
      )
}

export const list = async (
  word: string | undefined,
  flags: Flags,
  version: string,
): Promise<number> => classic(word, flags, makeContext(flags, version))

export const services = (flags: Flags, version: string): number => {
  const { source } = makeContext(flags, version)
  write(
    source.services
      .map((s) => [s.id, s.name, s.aliases.join(",")].join("\t"))
      .join("\n"),
  )
  return 0
}

export interface WatchFlags extends Flags {
  interval: string
  intervalSeconds?: string
  exec?: string
  polls?: string
}

const positive = (value: string | undefined): number | null => {
  if (value === undefined) return null
  const n = Number(value)
  return Number.isFinite(n) && n > 0 ? n : Number.NaN
}

export const watch = async (
  flags: WatchFlags,
  version: string,
): Promise<number> => {
  const minutes = positive(flags.interval)
  const seconds = positive(flags.intervalSeconds)
  const polls = positive(flags.polls)
  if (Number.isNaN(minutes) || Number.isNaN(seconds))
    return fail("--interval needs a number greater than 0")
  if (Number.isNaN(polls)) return fail("--polls needs a number greater than 0")
  const intervalMs = seconds !== null ? seconds * 1000 : (minutes ?? 5) * 60_000
  const source = flags.mock
    ? mockWatchSource()
    : makeContext(flags, version).source
  if (source.services.length === 0) return fail("no services configured")
  if (flags.exec !== undefined && flags.exec.trim() === "")
    return fail("--exec needs a command")

  const controller = new AbortController()
  const stop = () => controller.abort()
  process.once("SIGINT", stop)
  process.once("SIGTERM", stop)
  try {
    await watchLoop({
      source,
      intervalMs,
      json: Boolean(flags.json),
      exec: flags.exec,
      polls: polls ?? Infinity,
      signal: controller.signal,
    })
  } finally {
    process.off("SIGINT", stop)
    process.off("SIGTERM", stop)
  }
  return 0
}

export const run = async (action: () => Promise<number> | number) => {
  try {
    process.exitCode = await action()
  } catch (error) {
    if (error instanceof ConfigError) process.exitCode = fail(error.message)
    else {
      process.stderr.write(`incidents: ${(error as Error).message}\n`)
      process.exitCode = 1
    }
  }
}
