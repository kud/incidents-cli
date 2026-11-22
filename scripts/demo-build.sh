#!/usr/bin/env bash
# Builds the web demo into demo/: one asciicast per screen, from the mock data
# (invented services only), plus cli-shot's static replay page. Served at
# kud.io/projects/incidents-cli/demo through the rewrites in vercel.json.
#
# cli-shot is not on npm yet and its repository ships no dist/, so it is
# cloned and built here. CLI_SHOT_REF picks another branch or tag.
set -euo pipefail

ref="${CLI_SHOT_REF:-main}"
tool=".cli-shot"

rm -rf "$tool"
git clone --quiet --depth 1 --branch "$ref" https://github.com/kud/cli-shot "$tool"
(cd "$tool" && npm ci --silent --no-audit --no-fund && npm run --silent build)

npm run --silent build

rm -rf demo
node "$tool/dist/cli.js" \
  --out demo \
  --format web \
  --title incidents \
  --base /projects/incidents-cli/demo/ \
  --cols 160 --rows 40 \
  --settle 1200 \
  -- node dist/bin/incidents.js
