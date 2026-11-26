#!/bin/sh
# N5-R05 Pilot Stage 1. Pass the detached input worktree, not this checkout.
set -eu
here=$(CDPATH= cd -- "$(dirname "$0")" && pwd)
if [ "$#" -ne 1 ]; then
  echo "usage: run.sh <source-root>" >&2
  exit 2
fi
exec node "$here/run.mjs" --source-root "$1" --out "$here"
