import { mkdirSync, readFileSync, renameSync, writeFileSync } from "node:fs"
import { homedir } from "node:os"
import { dirname, join } from "node:path"
import { isView, type View } from "./view.js"

// What the interactive view remembers between runs: for now, the last view
// `v` chose. It never blocks a start and never stops the app: a file that is
// missing, unreadable or not what it should be reads as nothing remembered,
// and a write that fails is dropped.
export interface ViewState {
  load(): View | undefined
  save(view: View): void
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

export const fileState = (path: string = statePath()): ViewState => ({
  load: () => {
    const { view } = readObject(path)
    return isView(view) ? view : undefined
  },
  // Written whole to a temporary file beside it, then renamed over it, so a
  // crash mid-write never leaves half a file. Other keys are kept.
  save: (view) => {
    try {
      mkdirSync(dirname(path), { recursive: true })
      const temporary = `${path}.${process.pid}.tmp`
      writeFileSync(
        temporary,
        `${JSON.stringify({ ...readObject(path), view }, null, 2)}\n`,
      )
      renameSync(temporary, path)
    } catch {
      // A view that cannot be remembered is not worth an error.
    }
  },
})
