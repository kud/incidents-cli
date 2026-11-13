export const age = (ms: number): string => {
  const hours = Math.floor(ms / 3_600_000)
  if (hours < 1) return `${Math.max(1, Math.floor(ms / 60_000))}m`
  if (hours < 48)
    return hours < 10 && ms % 3_600_000 >= 60_000
      ? `${hours}h ${Math.floor((ms % 3_600_000) / 60_000)}m`
      : `${hours}h`
  return `${Math.floor(hours / 24)}d`
}

// A minute of clock skew still reads as just now. Anything further ahead has
// not happened yet and has no age: it is never shown as a minute old.
const SKEW_MS = 60_000

export const ageOf = (raw: string, now = Date.now()): string => {
  const ms = now - new Date(raw).getTime()
  return raw && !Number.isNaN(ms) && ms > -SKEW_MS ? age(Math.max(0, ms)) : ""
}

export const formatWhen = (raw: string): string => {
  const date = new Date(raw)
  return Number.isNaN(date.getTime())
    ? raw
    : date.toLocaleString(undefined, {
        day: "numeric",
        month: "short",
        hour: "2-digit",
        minute: "2-digit",
      })
}

export const whenLabel = (raw: string, now = Date.now()): string => {
  const label = ageOf(raw, now)
  if (!label) return raw ? formatWhen(raw) : ""
  return label.endsWith("d") && parseInt(label, 10) >= 7
    ? formatWhen(raw)
    : `${label} ago`
}
