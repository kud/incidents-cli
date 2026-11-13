import type { Indicator } from "./types.js"

export const SEVERITY: Record<Indicator, number> = {
  critical: 6,
  major: 5,
  unknown: 4,
  minor: 3,
  maintenance: 2,
  none: 1,
  link: 0,
}

export const isClear = (indicator: Indicator): boolean =>
  indicator === "none" || indicator === "link" || indicator === "maintenance"

export const severityOf = (indicator: string): number =>
  SEVERITY[indicator as Indicator] ?? SEVERITY.unknown

export const worstFirst = <T extends { indicator: string; name: string }>(
  records: T[],
): T[] =>
  [...records].sort(
    (a, b) =>
      severityOf(b.indicator) - severityOf(a.indicator) ||
      a.name.localeCompare(b.name),
  )

export const exitCode = (records: { indicator: Indicator }[]): 0 | 1 =>
  records.every((r) => isClear(r.indicator)) ? 0 : 1
