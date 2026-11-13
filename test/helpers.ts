import { EventEmitter } from "node:events"
import { readFileSync } from "node:fs"
import { fileURLToPath } from "node:url"

export const fixture = (name: string): string =>
  readFileSync(
    fileURLToPath(new URL(`./fixtures/${name}`, import.meta.url)),
    "utf8",
  )

type Reply = { status?: number; body: string | Uint8Array } | Error

export const fakeFetch = (routes: Record<string, Reply>): typeof fetch =>
  (async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input)
    init?.signal?.throwIfAborted()
    const reply = routes[url]
    if (!reply) return new Response("not found", { status: 404 })
    if (reply instanceof Error) throw reply
    return new Response(reply.body as BodyInit, { status: reply.status ?? 200 })
  }) as typeof fetch

export const service = (over: Record<string, unknown> = {}) => ({
  id: "acme",
  name: "Acme",
  kind: "statuspage" as const,
  url: "https://status.acme.example",
  aliases: [],
  ...over,
})

// A terminal of a chosen size: ink-testing-library fixes the width and leaves
// the height unset, and the board's overflow only shows on a short window.
export const terminal = (columns: number, rows: number) => {
  const stdout = Object.assign(new EventEmitter(), {
    columns,
    rows,
    isTTY: true,
    frame: "",
    write(frame: string) {
      stdout.frame = frame
      return true
    },
  })
  const stdin = Object.assign(new EventEmitter(), {
    isTTY: true,
    data: null as string | null,
    setEncoding() {},
    setRawMode() {},
    resume() {},
    pause() {},
    ref() {},
    unref() {},
    read() {
      const data = stdin.data
      stdin.data = null
      return data
    },
    press(data: string) {
      stdin.data = data
      stdin.emit("readable")
      stdin.emit("data", data)
    },
  })
  return { stdout, stdin }
}

// A frame line's body: what sits right of the filter column's rule, the
// frame's own left edge being the first rule on the line.
export const bodyOf = (line: string): string =>
  line.split("│").slice(2).join("│")
