#!/usr/bin/env bash
# Builds the web demo into demo/: one asciicast per screen, from the mock data
# (invented services only), plus cli-shot's static replay page. Served at
# kud.io/projects/incidents-cli/demo through the rewrites in vercel.json.
set -euo pipefail

npm run --silent build

rm -rf demo
cli-shot \
  --out demo \
  --format web \
  --title incidents \
  --base /projects/incidents-cli/demo/ \
  --cols 160 --rows 40 \
  --settle 1200 \
  -- node dist/bin/incidents.js
