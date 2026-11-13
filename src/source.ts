import {
  readAll,
  readService,
  type Service,
  type ServiceRecord,
} from "./core/index.js"
import type { Config } from "./config.js"
import type { View } from "./view.js"
import { MOCK_SERVICES, mockRecord } from "./mock.js"

export interface Source {
  services: Service[]
  note: string | null
  view?: View
  readAll(opts: {
    signal?: AbortSignal
    onRecord?: (record: ServiceRecord) => void
  }): Promise<ServiceRecord[]>
  readDetail(
    service: Service,
    opts: { signal?: AbortSignal },
  ): Promise<ServiceRecord>
}

export const liveSource = (
  config: Config,
  version: string,
  note: string | null,
): Source => {
  const shared = {
    timeout: config.timeout,
    userAgent: `incidents-cli/${version}`,
  }
  return {
    services: Object.values(config.services),
    note,
    view: config.view,
    readAll: ({ signal, onRecord }) =>
      readAll(Object.values(config.services), { ...shared, signal, onRecord }),
    readDetail: (service, { signal }) =>
      readService(service, { ...shared, signal, detail: true }),
  }
}

const settle = (ms: number, signal?: AbortSignal): Promise<void> =>
  new Promise((resolve, reject) => {
    const timer = setTimeout(resolve, ms)
    signal?.addEventListener(
      "abort",
      () => {
        clearTimeout(timer)
        reject(signal.reason)
      },
      { once: true },
    )
  })

export const mockSource = (delayMs = 120): Source => ({
  services: MOCK_SERVICES,
  note: null,
  readAll: async ({ signal, onRecord }) =>
    Promise.all(
      MOCK_SERVICES.map(async (service, index) => {
        await settle(delayMs * (index + 1), signal)
        const record = mockRecord(service)
        onRecord?.(record)
        return record
      }),
    ),
  readDetail: async (service, { signal }) => {
    await settle(delayMs, signal)
    return mockRecord(service, true)
  },
})
