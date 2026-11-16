import { spawn } from "node:child_process"
import type { Service, ServiceRecord } from "./core/index.js"

export type Opener = (url: string) => void

// Where `o` goes: the open incident when there is one, else the status page.
export const linkTarget = (
  service: Pick<Service, "url">,
  record?: Pick<ServiceRecord, "url" | "active">,
): string => record?.active[0]?.link || record?.url || service.url || ""

// Hands a URL to the system's own opener and lets it go: the TUI never
// waits on the browser, and a missing opener fails quietly.
export const openInBrowser: Opener = (url) => {
  const [command, args] =
    process.platform === "darwin"
      ? ["open", [url]]
      : process.platform === "win32"
        ? ["cmd", ["/c", "start", "", url]]
        : ["xdg-open", [url]]
  try {
    const child = spawn(command, args, { detached: true, stdio: "ignore" })
    child.on("error", () => undefined)
    child.unref()
  } catch {
    // no opener on this system
  }
}
