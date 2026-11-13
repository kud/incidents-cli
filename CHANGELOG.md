# Changelog

All notable changes to this project are documented here.

---

## 0.1.3 — 2026-11-13

### Highlights

- The interactive list shows every service at once, in config order, with a spinner in each row that resolves in place; rows sort worst-first once, after every service has answered, so nothing shuffles while you read. ([c3767cf](https://github.com/kud/incidents-cli/commit/c3767cfb4b22ac68a45bc3c0c58624eadf8e83ce))

### Documentation

- The README now shows screenshots of the overview and a single-service detail view, generated from mock data by `scripts/screenshots.zsh`. ([7f76c6d](https://github.com/kud/incidents-cli/commit/7f76c6d890df96fd92b9648f4b8d7adb0f802abb))

<details>
<summary>Internal (1 commit)</summary>

- `.gitignore` now excludes local environment files and local tool config. ([a7dbcb6](https://github.com/kud/incidents-cli/commit/a7dbcb6bbdf9ee001c6ef83a42f78e18ef3abcde))

</details>

---

## 0.1.2 — 2026-11-13

### Fixes

- The status bar no longer says "refreshing…" on the first load once one service has answered; it says "checking…" until the first full read finishes. ([d56c607](https://github.com/kud/incidents-cli/commit/d56c607014cbd5499322b5a0ab9b2fec8f87cf91))

<details>
<summary>Internal (1 commit)</summary>

- Tests: the hanging-page fake keeps the event loop alive on Node 22, and the date assertion accepts both "13 Nov" and "Nov 13" locales. ([378f0fd](https://github.com/kud/incidents-cli/commit/378f0fd1d9176dbccf2d3fc2ee4b87328674cb01))

</details>

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
