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
import { liveSource, mockSource, type Source } from "./source.js"

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
