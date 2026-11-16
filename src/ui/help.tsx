import { Box, Text } from "ink"
import { colors } from "@kud/ink-ui"
import { DISCLAIMER } from "../labels.js"
import { INK } from "./overview-parts.js"

export type KeyGroup = { title: string; keys: [key: string, action: string][] }

// Every key the app answers, grouped by what it does. The footer shows a
// handful; this is the whole of it.
export const KEY_GROUPS: KeyGroup[] = [
  {
    title: "Move",
    keys: [
      ["↑↓  j k", "move within a pane"],
      ["←  →", "filters, services, a service's page"],
      ["⏎", "open the service, or the filter"],
      ["tab", "between the filters and the services"],
    ],
  },
  {
    title: "Views",
    keys: [
      ["v", "board or list"],
      ["s", "by status or by name"],
      ["z", "hide or show the ok services"],
    ],
  },
  {
    title: "Search",
    keys: [
      ["/", "search names and aliases"],
      ["⏎", "done typing"],
      ["⌃u", "clear the text"],
      ["esc", "clear the search"],
    ],
  },
  {
    title: "Page",
    keys: [
      ["o", "open in the browser: the incident, else the status page"],
      ["r", "refresh"],
      ["←  esc", "back"],
      ["?", "these keys"],
      ["q", "quit"],
    ],
  },
]

const KEY_W = Math.max(
  ...KEY_GROUPS.flatMap((g) => g.keys.map(([k]) => k.length)),
)

const GAP = 3
const COLUMN_W = 2 + KEY_W + 2 + 40

const Group = ({ group, first }: { group: KeyGroup; first: boolean }) => (
  <Box flexDirection="column" marginTop={first ? 0 : 1} flexShrink={0}>
    <Text color={INK} bold>
      {group.title}
    </Text>
    {group.keys.map(([key, action]) => (
      <Text key={`${group.title}-${key}`} wrap="truncate-end">
        {"  "}
        <Text color={INK}>{key.padEnd(KEY_W)}</Text>
        {"  "}
        <Text color={colors.muted}>{action}</Text>
      </Text>
    ))}
  </Box>
)

// The keys overlay: it takes the body's place under the header, so the
// header still answers while it is open. Two columns when they fit, so it
// stays clear of the keys row on a short terminal.
export const HelpOverlay = ({
  indent,
  width,
}: {
  indent: number
  width: number
}) => {
  const split = width - indent >= COLUMN_W * 2 + GAP
  const half = Math.ceil(KEY_GROUPS.length / 2)
  const columns = split
    ? [KEY_GROUPS.slice(0, half), KEY_GROUPS.slice(half)]
    : [KEY_GROUPS]
  return (
    <Box flexDirection="column" paddingLeft={indent} flexGrow={1}>
      <Box flexDirection="row" gap={GAP} flexShrink={0}>
        {columns.map((groups, i) => (
          <Box
            key={i}
            flexDirection="column"
            width={split ? COLUMN_W : undefined}
            flexShrink={0}
          >
            {groups.map((group, j) => (
              <Group key={group.title} group={group} first={j === 0} />
            ))}
          </Box>
        ))}
      </Box>
      <Box marginTop={1} flexShrink={0}>
        <Text color={colors.muted} wrap="truncate-end">
          {DISCLAIMER}
        </Text>
      </Box>
    </Box>
  )
}
