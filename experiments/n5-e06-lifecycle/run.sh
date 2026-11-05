#!/usr/bin/env bash
# Measure install, update, and remove with the documented acquire function and npm.
# Requires --source-root pointing at a detached checkout of the admitted input commit.
set -eu
here=$(cd "$(dirname "$0")" && pwd)
exec node "$here/run.mjs" "$@"
