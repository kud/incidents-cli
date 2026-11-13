export type Sort = "status" | "name"
export const SORTS: readonly Sort[] = ["status", "name"]

export const isSort = (value: unknown): value is Sort =>
  SORTS.includes(value as Sort)
