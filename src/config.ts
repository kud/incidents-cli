import { existsSync, readdirSync, readFileSync } from "node:fs"
import { homedir } from "node:os"
import { join } from "node:path"
import { load } from "js-yaml"
import { isView, type View } from "./view.js"
import {
  ConfigError,
  DEFAULT_IDS,
  RESERVED_WORDS,
  DEFAULT_TIMEOUT_MS,
  mergeServices,
  selectServices,
  type RawServices,
  type Service,
} from "./core/index.js"

export interface Config {
  services: Record<string, Service>
  timeout: number
  source: "default" | "file"
  path: string
  view: View
}

interface ConfigFile {
  timeout?: number
  view?: unknown
  services?: RawServices
}

const configHome = (env: NodeJS.ProcessEnv): string =>
  join(env.XDG_CONFIG_HOME || join(homedir(), ".config"), "incidents")

const readFile = (path: string): ConfigFile => {
  try {
    const parsed = load(readFileSync(path, "utf8"))
    if (parsed === undefined || parsed === null) return {}
    if (typeof parsed !== "object" || Array.isArray(parsed))
      throw new Error("expected a mapping at the top level")
    return parsed as ConfigFile
  } catch (error) {
    throw new ConfigError(`${path}: ${(error as Error).message}`)
  }
}

const rejectReserved = (path: string, services: RawServices): void => {
  for (const [id, fields] of Object.entries(services)) {
    const aliases = Array.isArray(fields?.aliases) ? fields.aliases : []
    const word = [id, ...aliases]
      .map(String)
      .find((w) => RESERVED_WORDS.includes(w.toLowerCase()))
    if (word)
      throw new ConfigError(
        `${path}: service '${id}' uses the reserved word '${word}'`,
      )
  }
}

// The last file to set `view` wins, like `timeout`; a value that is neither
// view is an error naming the file rather than a silent fallback.
const viewOf = (files: string[], parsed: ConfigFile[]): View => {
  let view: View = "list"
  parsed.forEach((file, i) => {
    if (file.view === undefined) return
    if (!isView(file.view))
      throw new ConfigError(
        `${files[i]}: view must be list or board, not '${String(file.view)}'`,
      )
    view = file.view
  })
  return view
}

const filesFor = (env: NodeJS.ProcessEnv): string[] => {
  if (env.INCIDENTS_CONFIG) {
    if (!existsSync(env.INCIDENTS_CONFIG))
      throw new ConfigError(
        `INCIDENTS_CONFIG: no file at ${env.INCIDENTS_CONFIG}`,
      )
    return [env.INCIDENTS_CONFIG]
  }
  const dir = configHome(env)
  const main = join(dir, "config.yml")
  const dropIns = join(dir, "config.d")
  return [
    ...(existsSync(main) ? [main] : []),
    ...(existsSync(dropIns)
      ? readdirSync(dropIns)
          .filter((f) => f.endsWith(".yml"))
          .sort()
          .map((f) => join(dropIns, f))
      : []),
  ]
}

export const defaultConfigPath = (env: NodeJS.ProcessEnv = process.env) =>
  env.INCIDENTS_CONFIG || join(configHome(env), "config.yml")

export const loadConfig = (env: NodeJS.ProcessEnv = process.env): Config => {
  const files = filesFor(env)
  if (files.length === 0)
    return {
      services: selectServices(
        Object.fromEntries(DEFAULT_IDS.map((id) => [id, {}])),
      ),
      timeout: DEFAULT_TIMEOUT_MS,
      source: "default",
      path: defaultConfigPath(env),
      view: "list",
    }
  const parsed = files.map(readFile)
  parsed.forEach((file, i) => rejectReserved(files[i], file.services ?? {}))
  const selected = parsed.reduce<RawServices>(
    (acc, file) => mergeServices(acc, file.services ?? {}),
    {},
  )
  const timeout =
    parsed
      .map((f) => f.timeout)
      .filter((t) => typeof t === "number")
      .at(-1) ?? DEFAULT_TIMEOUT_MS
  return {
    services: selectServices(selected, undefined, files.join(", ")),
    timeout,
    source: "file",
    path: files[0],
    view: viewOf(files, parsed),
  }
}

export const defaultsNote = (config: Config): string | null =>
  config.source === "default"
    ? `No config at ${config.path.replace(homedir(), "~")}: showing ${DEFAULT_IDS.join(", ")}.`
    : null
