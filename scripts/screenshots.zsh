#!/usr/bin/env zsh
# Usage: scripts/screenshots.zsh
# Regenerates the README screenshots from the mock data (invented services
# only), so they never show a real config. Needs vhs. 1694x990 px is 160
# columns at size 16: wide enough for the full filter column.
set -euo pipefail

repo=${0:A:h:h}
out=$repo/assets
mkdir -p $out
npm --prefix $repo run --silent build

shoot() {
  local name=$1 keys=$2
  local tape=$(mktemp -t incidents-shot).tape
  cat >| $tape <<TAPE
Output "$out/$name.gif"
Set Shell zsh
Set FontSize 16
Set Width 1694
Set Height 990
Set Padding 16
Set Theme "Catppuccin Mocha"
Hide
Type "clear; node $repo/dist/bin/incidents.js --mock"
Enter
Sleep 5s
$keys
Show
Sleep 400ms
Screenshot "$out/$name.png"
Hide
Type "q"
Sleep 300ms
TAPE
  vhs $tape >/dev/null
  rm -f $tape "$out/$name.gif"
  print "✓ $out/$name.png"
}

shoot board ""
shoot list 'Type "v"'
shoot detail $'Enter\nSleep 2s'
