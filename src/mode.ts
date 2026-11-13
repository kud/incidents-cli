export interface ModeInput {
  stdinTTY: boolean
  stdoutTTY: boolean
  env: NodeJS.ProcessEnv
  json: boolean
}

const isSet = (value: string | undefined): boolean =>
  value !== undefined && value !== "" && value !== "0" && value !== "false"

export const canBeInteractive = ({
  stdinTTY,
  stdoutTTY,
  env,
  json,
}: ModeInput): boolean => stdinTTY && stdoutTTY && !isSet(env.CI) && !json
