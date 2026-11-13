import type { Kind } from "./types.js"

export interface CatalogueEntry {
  name: string
  kind: Kind
  url: string
  feed?: string
  aliases?: string[]
  note?: string
  regions?: string[]
}

export const CATALOGUE: Record<string, CatalogueEntry> = {
  github: {
    name: "GitHub",
    kind: "statuspage",
    url: "https://www.githubstatus.com",
    aliases: ["gh"],
    note: "A green board is not a promise your calls succeed: scattered 5xx errors never reach an incident.",
  },
  claude: {
    name: "Claude",
    kind: "statuspage",
    url: "https://status.claude.com",
    aliases: ["anthropic"],
  },
  openai: {
    name: "OpenAI",
    kind: "statuspage",
    url: "https://status.openai.com",
  },
  vercel: {
    name: "Vercel",
    kind: "statuspage",
    url: "https://www.vercel-status.com",
  },
  cloudflare: {
    name: "Cloudflare",
    kind: "statuspage",
    url: "https://www.cloudflarestatus.com",
    aliases: ["cf"],
  },
  npm: { name: "npm", kind: "statuspage", url: "https://status.npmjs.org" },
  docker: {
    name: "Docker",
    kind: "statuspage",
    url: "https://www.dockerstatus.com",
  },
  figma: { name: "Figma", kind: "statuspage", url: "https://status.figma.com" },
  linear: {
    name: "Linear",
    kind: "statuspage",
    url: "https://linearstatus.com",
  },
  notion: {
    name: "Notion",
    kind: "statuspage",
    url: "https://www.notion-status.com",
  },
  gandi: { name: "Gandi", kind: "statuspage", url: "https://status.gandi.net" },
  todoist: {
    name: "Todoist",
    kind: "rss",
    url: "https://status.todoist.net",
    feed: "https://status.todoist.net/history.rss",
  },
  bluesky: {
    name: "Bluesky",
    kind: "rss",
    url: "https://status.bsky.app",
    feed: "https://status.bsky.app/history.rss",
    aliases: ["bsky"],
  },
  jira: {
    name: "Jira",
    kind: "statuspage",
    url: "https://jira-software.status.atlassian.com",
  },
  confluence: {
    name: "Confluence",
    kind: "statuspage",
    url: "https://confluence.status.atlassian.com",
  },
  bitbucket: {
    name: "Bitbucket",
    kind: "statuspage",
    url: "https://bitbucket.status.atlassian.com",
  },
  sentry: {
    name: "Sentry",
    kind: "statuspage",
    url: "https://status.sentry.io",
  },
  harness: {
    name: "Harness",
    kind: "statuspage",
    url: "https://status.harness.io",
  },
  datadog: {
    name: "Datadog",
    kind: "rss",
    url: "https://status.datadoghq.com",
    feed: "https://status.datadoghq.com/history.rss",
    aliases: ["dd"],
  },
  slack: { name: "Slack", kind: "slack", url: "https://slack-status.com" },
  aws: {
    name: "AWS",
    kind: "aws",
    url: "https://health.aws.amazon.com/health/status",
    note: "Every region counts unless `regions` narrows it; global events always do.",
  },
}

export const DEFAULT_IDS = ["github", "npm", "cloudflare", "claude"]
