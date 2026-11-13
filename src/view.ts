export type View = "list" | "board"
export const VIEWS: readonly View[] = ["list", "board"]

export const isView = (value: unknown): value is View =>
  VIEWS.includes(value as View)
