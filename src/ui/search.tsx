import { Text } from "ink"
import { colors } from "@kud/ink-ui"
import { INK } from "./overview-parts.js"

// The search, on the services pane's title row: "/ mail▏  2 of 21". It rides
// there rather than taking a row of its own, so opening it never pushes the
// panes down. The caret shows only while it is being typed.
export const SearchField = ({
  term,
  typing,
  caret,
  matches,
  total,
}: {
  term: string
  typing: boolean
  caret: number
  matches: number
  total: number
}) => {
  const at = Math.max(0, Math.min(caret, term.length))
  return (
    <Text wrap="truncate-end">
      {"  "}
      <Text color={colors.info}>/ </Text>
      <Text color={INK}>{term.slice(0, at)}</Text>
      {typing && at < term.length ? (
        <>
          <Text inverse>{term[at]}</Text>
          <Text color={INK}>{term.slice(at + 1)}</Text>
        </>
      ) : (
        <>
          {typing ? <Text color={colors.info}>▏</Text> : null}
          <Text color={INK}>{term.slice(at)}</Text>
        </>
      )}
      {term ? (
        <Text color={colors.muted}>{`  ${matches} of ${total}`}</Text>
      ) : null}
    </Text>
  )
}
