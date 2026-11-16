import { mkdirSync, readFileSync, renameSync, writeFileSync } from "node:fs"
import { homedir } from "node:os"
import { dirname, join } from "node:path"
import { isView, type View } from "./view.js"

// Pins set with `p`: each id the user pinned (true) or unpinned (false),
// overriding the config's `pinned`, and the order they were pinned in.
export type Pins = { set: Record<string, boolean>; order: string[] }

// What the interactive view remembers between runs: the last view `v` chose
// and the pins. It never blocks a start and never stops the app: a file that
// is missing, unreadable or not what it should be reads as nothing
// remembered, and a write that fails is dropped.
export interface ViewState {
  load(): View | undefined
  save(view: View): void
  loadPins(): Pins
  savePins(pins: Pins): void
}

export const statePath = (env: NodeJS.ProcessEnv = process.env): string =>
  join(
    env.XDG_STATE_HOME || join(homedir(), ".local", "state"),
    "incidents",
    "state.json",
  )

const readObject = (path: string): Record<string, unknown> => {
  try {
    const parsed: unknown = JSON.parse(readFileSync(path, "utf8"))
    return parsed && typeof parsed === "object" && !Array.isArray(parsed)
      ? (parsed as Record<string, unknown>)
      : {}
  } catch {
    return {}
  }
}

const pinsOf = (value: unknown): Pins => {
  const raw = value && typeof value === "object" ? (value as Pins) : null
  const set =
    raw?.set && typeof raw.set === "object" && !Array.isArray(raw.set)
      ? Object.fromEntries(
          Object.entries(raw.set).filter(([, v]) => typeof v === "boolean"),
        )
      : {}
  const order = Array.isArray(raw?.order)
    ? raw.order.filter((id): id is string => typeof id === "string")
    : []
  return { set, order }
}

// Written whole to a temporary file beside it, then renamed over it, so a
// crash mid-write never leaves half a file. Other keys are kept.
const write = (path: string, patch: Record<string, unknown>) => {
  try {
    mkdirSync(dirname(path), { recursive: true })
    const temporary = `${path}.${process.pid}.tmp`
    writeFileSync(
      temporary,
      `${JSON.stringify({ ...readObject(path), ...patch }, null, 2)}\n`,
    )
    renameSync(temporary, path)
  } catch {
    // State that cannot be remembered is not worth an error.
  }
}

export const fileState = (path: string = statePath()): ViewState => ({
  load: () => {
    const { view } = readObject(path)
    return isView(view) ? view : undefined
  },
  save: (view) => write(path, { view }),
  loadPins: () => pinsOf(readObject(path).pins),
  savePins: (pins) => write(path, { pins }),
})
