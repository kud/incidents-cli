#!/usr/bin/env node
import { readFileSync } from "node:fs"
import { dirname, join } from "node:path"
import { fileURLToPath } from "node:url"
import { Command } from "commander"
import { list, open, run, services, type Flags } from "../src/cli.js"

const resolveVersion = (): string => {
  let dir = dirname(fileURLToPath(import.meta.url))
  for (let i = 0; i < 6; i++) {
    try {
      return JSON.parse(readFileSync(join(dir, "package.json"), "utf8")).version
    } catch {
      dir = dirname(dir)
    }
  }
  return "0.0.0"
}

const version = resolveVersion()
const program = new Command()

program
  .name("incidents")
  .description(
    "Which of the services you depend on are declaring trouble right now",
  )
  .version(version)
  .option("--json", "print JSON records, never the interactive view", false)
  .option("--mock", "use built-in fixtures instead of live status pages", false)
  .option("--screen <name>", "open directly on a screen (`list` prints them)")
  .argument("[service]", "open the interactive view on one service")
  .showHelpAfterError()
  .action((word: string | undefined, flags: Flags) =>
    run(() => open(word, flags, version)),
  )

program
  .command("list")
  .argument("[service]", "one service's detail instead of the overview")
  .description(
    "print the status once and exit: 0 all clear, 1 degraded or unreadable",
  )
  .action((word: string | undefined, _flags: Flags, command: Command) =>
    run(() => list(word, command.optsWithGlobals(), version)),
  )

program
  .command("services")
  .description("print configured service ids and aliases, one per line")
  .action((_flags: Flags, command: Command) =>
    run(() => services(command.optsWithGlobals(), version)),
  )

await program.parseAsync()
