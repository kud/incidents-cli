import { CATALOGUE } from "./catalogue.js"
import type { Kind, Service } from "./types.js"

export type RawServices = Record<string, Record<string, unknown> | null>

export const RESERVED_WORDS = ["list", "services"]
const KINDS: Kind[] = ["statuspage", "rss", "slack", "aws", "link"]

export class ConfigError extends Error {}

export const mergeServices = (
  base: RawServices = {},
  over: RawServices = {},
): RawServices => {
  const merged: RawServices = { ...base }
  for (const [id, fields] of Object.entries(over ?? {})) {
    merged[id] = { ...(merged[id] ?? {}), ...(fields ?? {}) }
  }
  return merged
}

const finalise = (raw: RawServices): Record<string, Service> =>
  Object.fromEntries(
    Object.entries(raw)
      .filter(([, svc]) => svc && svc.enabled !== false)
      .map(([id, svc]) => [
        id,
        { id, name: id, aliases: [], ...svc } as unknown as Service,
      ]),
  )

export const mergeRegistry = (
  base: RawServices = {},
  profile: RawServices = {},
): Record<string, Service> => finalise(mergeServices(base, profile))

const problemsOf = (svc: Service): string[] => {
  const words = [svc.id, ...svc.aliases.map(String)].map((w) => w.toLowerCase())
  const reserved = words.filter((w) => RESERVED_WORDS.includes(w))
  if (svc.kind === undefined)
    return [
      ...reserved.map((w) => `'${w}' is a reserved word`),
      "is not in the catalogue and has no kind",
    ]
  return [
    ...reserved.map((w) => `'${w}' is a reserved word`),
    ...(KINDS.includes(svc.kind)
      ? []
      : [`kind '${svc.kind}' is not one of ${KINDS.join(", ")}`]),
    ...(["statuspage", "rss", "link"].includes(svc.kind) &&
    !/^https:\/\//.test(svc.url ?? "")
      ? ["needs an https url"]
      : []),
    ...(svc.kind === "rss" && !svc.feed ? ["needs a feed"] : []),
  ]
}

export const selectServices = (
  selected: RawServices,
  catalogue: Record<string, unknown> = CATALOGUE,
): Record<string, Service> => {
  const registry = finalise(
    mergeServices(
      Object.fromEntries(
        Object.keys(selected).map((id) => [
          id,
          (catalogue[id] as Record<string, unknown>) ?? {},
        ]),
      ),
      selected,
    ),
  )
  const problems = Object.values(registry).flatMap((svc) =>
    problemsOf(svc).map((p) => `service '${svc.id}': ${p}`),
  )
  if (problems.length) throw new ConfigError(problems.join("\n"))
  return registry
}

export const resolveService = (
  registry: Record<string, Service>,
  word: string,
): Service | undefined => {
  const w = word.toLowerCase()
  return (
    registry[w] ??
    Object.values(registry).find((svc) =>
      svc.aliases.map((a) => String(a).toLowerCase()).includes(w),
    )
  )
}
