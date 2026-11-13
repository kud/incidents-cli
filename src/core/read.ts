import { ADAPTERS } from "./adapters.js"
import type { ReadOptions, Service, ServiceRecord } from "./types.js"

const failureReason = (error: unknown): string => {
  const e = error as { name?: string; message?: string }
  return e?.name === "TimeoutError" ? "timed out" : (e?.message ?? "failed")
}

export const readService = async (
  service: Service,
  opts: ReadOptions = {},
): Promise<ServiceRecord> => {
  const base: ServiceRecord = {
    id: service.id,
    name: service.name,
    url: service.url ?? "",
    kind: service.kind,
    fetched: "ok",
    indicator: "unknown",
    description: "",
    components: [],
    active: [],
    recent: [],
    historyLoaded: false,
    historyFailed: false,
    note: service.note ?? "",
  }
  const adapter = ADAPTERS[service.kind]
  if (!adapter)
    return {
      ...base,
      fetched: "failed",
      description: `Unknown kind '${service.kind}'`,
    }
  try {
    const adapted = await adapter(service, opts)
    return {
      ...base,
      ...adapted,
      historyLoaded: Boolean(opts.detail) && service.kind !== "link",
    }
  } catch (error) {
    if (opts.signal?.aborted) throw opts.signal.reason
    return {
      ...base,
      fetched: "failed",
      description: `Could not read the page (${failureReason(error)})`,
    }
  }
}

export interface ReadAllOptions extends ReadOptions {
  onRecord?: (record: ServiceRecord) => void
}

export const readAll = async (
  services: Service[],
  { onRecord, ...opts }: ReadAllOptions = {},
): Promise<ServiceRecord[]> =>
  Promise.all(
    services.map(async (service) => {
      const record = await readService(service, opts)
      if (!opts.signal?.aborted) onRecord?.(record)
      return record
    }),
  )
