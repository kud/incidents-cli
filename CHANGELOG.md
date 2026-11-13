# Changelog

All notable changes to this project are documented here.

---

## 0.1.1 — 2026-11-13

First complete release; 0.1.0 was published from an older tree.

### Highlights

- Monitor vendor status pages from the terminal: declared incidents across statuspage, RSS, Slack, AWS Health and plain-link sources, worst first. ([f551a13](https://github.com/kud/incidents-cli/commit/f551a13c1f6ab355fc0e97d4b3dfe47da98b9b09))
- `incidents` opens an interactive fullscreen view where rows fill in as each service answers. ([825f05d](https://github.com/kud/incidents-cli/commit/825f05d46180cf6c96ef432e410caff196f68c13))
- Terminals 150 columns or wider get a split layout, with the incident detail beside the list. ([8753ad0](https://github.com/kud/incidents-cli/commit/8753ad01ca174b2810e5786c6b33a9e4beeb3e69))
- `incidents list [service]` prints one-shot output, with `--json` for scripts and exit codes you can branch on; pipes, CI and cron fall back to it, so nothing hangs. ([f551a13](https://github.com/kud/incidents-cli/commit/f551a13c1f6ab355fc0e97d4b3dfe47da98b9b09))
- Configure services in `~/.config/incidents/config.yml`, with `config.d/*.yml` drop-ins merged over it by service id. ([f551a13](https://github.com/kud/incidents-cli/commit/f551a13c1f6ab355fc0e97d4b3dfe47da98b9b09))
- `incidents services` lists each service's id, name and aliases, tab-separated for easy parsing. ([f394f29](https://github.com/kud/incidents-cli/commit/f394f2996dac8a5a7437bb357902d41d27906cc7))

### Fixes

- Config errors now name the file, service and offending word, and `help` joins `list` and `services` as a reserved word that cannot be a service id or alias. ([f394f29](https://github.com/kud/incidents-cli/commit/f394f2996dac8a5a7437bb357902d41d27906cc7))

<details>
<summary>Internal (1 commit)</summary>

- CI and release workflows, lint, format and test tooling, plus tests for the new detail view.

</details>

---
