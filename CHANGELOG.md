# Changelog

All notable changes to this project are documented here.

---

## 0.5.0 — 2026-11-14

### Highlights

- The `v`, `s` and `z` keys now work from any pane, including the filters, and in the list `←` steps back to the filters instead of cycling them. ([9ef152f](https://github.com/kud/incidents-cli/commit/9ef152f119c50c02f9339b990b48d7188d4af185))
- The list's status preview on a busy page names only the components in trouble, worst first, and counts the rest on one "ok N components" line. ([a6a923e](https://github.com/kud/incidents-cli/commit/a6a923e70d9847cf77152ca03f7bc0e4fb3dbc42))
- Each preview row now leads with its status word, so a long component name is cut rather than the status. ([a6a923e](https://github.com/kud/incidents-cli/commit/a6a923e70d9847cf77152ca03f7bc0e4fb3dbc42))
- Each board card's left edge takes its status colour, so the state reads at a glance even when the card isn't selected. ([8391e49](https://github.com/kud/incidents-cli/commit/8391e49aba6066d6c5074aac37e2e309f6898449))
- Footer hints now fit the terminal width, dropping the least-used first while "q quit" always stays. ([1cdaf53](https://github.com/kud/incidents-cli/commit/1cdaf53d238ad886bbab0bd19a19f76ca0ea0394))

### Fixes

- The list holds still while the cursor moves inside it, scrolls only near an edge, and no longer opens on a blank line. ([9ef152f](https://github.com/kud/incidents-cli/commit/9ef152f119c50c02f9339b990b48d7188d4af185))
- The board's "N more below" note now has a blank row above it instead of sitting against the cards. ([1cdaf53](https://github.com/kud/incidents-cli/commit/1cdaf53d238ad886bbab0bd19a19f76ca0ea0394))

### Documentation

- The README screenshots are regenerated to show the current board, detail and list views. ([4f1ecd8](https://github.com/kud/incidents-cli/commit/4f1ecd8d475b3308acafbf9c43b98f2010069d37))

<details>
<summary>Internal (2 commits)</summary>

- Screenshot capture moved from a zsh script to a `shots.yml` config, with adjusted timing delays. Extra tests cover list navigation and the header layout.

</details>

---

## 0.4.0 — 2026-11-13

### Highlights

- Arrow keys now move across the board's cards in both directions, `←` from the first column reaches the filters, and `←→` cycle status filters in the list. ([eed00ef](https://github.com/kud/incidents-cli/commit/eed00ef58355babd6e668fbba90e7a404ddcfead))
- The detail page scrolls within the terminal, so long histories are no longer cut off. ([eed00ef](https://github.com/kud/incidents-cli/commit/eed00ef58355babd6e668fbba90e7a404ddcfead))
- Components on a busy status page are grouped by status, worst first, with per-status counts and "+N more" rows instead of one long wall. ([11dc24c](https://github.com/kud/incidents-cli/commit/11dc24cea758ca7145625da436b30e32907de975))
- History comes from the incidents API, so a page with many planned windows no longer crowds out past incidents; upcoming maintenance is tracked and counted separately. ([63c249d](https://github.com/kud/incidents-cli/commit/63c249d8651bbcd1a7e0e1382d074382601fdc66))
  - Past scheduled-maintenance windows no longer appear in a status page's history, because the incidents API leaves maintenance out; upcoming maintenance is still counted, and when its feed can't be read the count is left unknown (`upcoming: null` in `--json`) rather than shown as zero. ([8281a67](https://github.com/kud/incidents-cli/commit/8281a67ee53aea6b921175a8313882c1f97d4d48))

### Documentation

- New user documentation covers the interactive view, scripting and exit codes, watch mode and configuration. ([e47201e](https://github.com/kud/incidents-cli/commit/e47201e92f7deb98883161e6e8acc1974d7f21bb))
- The README gets a redesigned header and a features list. ([98bce9d](https://github.com/kud/incidents-cli/commit/98bce9da782eef9ea6a0e5d2fd578af8f0dfe680))

<details>
<summary>Internal (2 commits)</summary>

- Added the project homepage URL and bumped `@kud/ink-ui` to 0.44.1.

</details>

---

## 0.3.0 — 2026-11-13

### Highlights

- A filter column beside the services doubles as the status tally, with a count bar per filter; `tab` moves focus between it and the list, and it narrows on terminals under 160 columns. ([34d9eaa](https://github.com/kud/incidents-cli/commit/34d9eaac30d3bb60723a2275efa57ddd83cbb23d))
- The board is now the default view; press `v` to swap to the list. ([34d9eaa](https://github.com/kud/incidents-cli/commit/34d9eaac30d3bb60723a2275efa57ddd83cbb23d))
- First load shows placeholder counts and shimmer rows instead of jumping around, and `r` keeps everything on screen while it refreshes. ([34d9eaa](https://github.com/kud/incidents-cli/commit/34d9eaac30d3bb60723a2275efa57ddd83cbb23d))
- The detail page splits into Now and History panes, side by side from 150 columns and stacked below, with loading, refresh and empty-history states. ([1bfdf63](https://github.com/kud/incidents-cli/commit/1bfdf6307071d261a925c223d58b429a88f82b0e))
- New `incidents watch` prints one line per status change, with `--exec` to run a command on each change and `--json` for scripting. ([c5f26e5](https://github.com/kud/incidents-cli/commit/c5f26e5e6207b66e2d5e311c6910ce5458015e68), [kud/incidents-cli#2](https://github.com/kud/incidents-cli/issues/2))

### Fixes

- Grid, list and footer text now start on the same column, and selection bands stop at the card edge. ([5a5a2ec](https://github.com/kud/incidents-cli/commit/5a5a2ecdfe5f0f5c2183a83958930bf40d6782cf))
- Column widths and the list and preview split no longer shift as services answer, and the cursor stays at the top until you first move it. ([61268e5](https://github.com/kud/incidents-cli/commit/61268e5b4904dce646a8dc97690048a0f58473ab))

### Documentation

- The README shows the board and list views, with screenshots regenerated at a size that fits the full filter column. ([37911fb](https://github.com/kud/incidents-cli/commit/37911fb218bd938dbad8bd57270a48eb6534160d))

### Security

- Dependencies now resolve `minimatch` to v11, clearing a Dependabot alert. ([58d1165](https://github.com/kud/incidents-cli/commit/58d1165e9165e84d47bd698de6e655f782adbedf))

<details>
<summary>Internal (2 commits)</summary>

- New worst-first app icon and refreshed board and detail screenshots.

</details>

---

## 0.2.0 — 2026-11-13

### Highlights

- A new board view lays services out as cards; press `v` to switch between list and board, or set `view` in your config to start on the board. ([f2cee32](https://github.com/kud/incidents-cli/commit/f2cee3239dbb4faac6606c4c702b30832d251151))
- Status tabs (`←→` or `tab`), `/` search and `z` to fold operational services help you find the broken thing quickly, and the cursor stays on the same service as you switch. ([1ac75dd](https://github.com/kud/incidents-cli/commit/1ac75ddcb9e1849c19f7f6c6a899b03d7634eafb))
- Sort by status (worst first) or by name with `s`, or set `sort` in your config; name order never shifts as results load. ([7b7a4a3](https://github.com/kud/incidents-cli/commit/7b7a4a30bd3d3072ffb6270677cad69203ebc03f))

### Fixes

- The board's grid no longer drops services silently or overdraws its last line on short terminals; cards and grid now scroll, with a "↑↓ scroll" hint when content is offscreen. ([3a5f0db](https://github.com/kud/incidents-cli/commit/3a5f0db56d50fbf4d6b0ef9df6fdaddc80f13778))
- The severity tally keeps a fixed worst-to-best order instead of changing with row order. ([dc1924f](https://github.com/kud/incidents-cli/commit/dc1924fba6947a88741a5d70f51c53fff1df0646))

### Documentation

- The README documents the new keys and config options, and adds a board screenshot alongside the overview and detail ones. ([fdddaef](https://github.com/kud/incidents-cli/commit/fdddaef27ca24b6c43e7251f9544c9044bad10cb))

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
