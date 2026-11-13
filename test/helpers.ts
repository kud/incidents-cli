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
