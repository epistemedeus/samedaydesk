#!/usr/bin/env bash
# Prepare a READ-ONLY E01 kernel worktree (PR109 c4048401, tree 1a5dad77).
# Not a product copy of services/earned-work.
set -euo pipefail

E01_SHA_REQUIRED="c4048401fa42e1272e61edf983afbf39a3e04555"
E01_TREE_REQUIRED="1a5dad7755fb81c75564dbc9d3667ab16db9bbcd"
REJECTED_819="819fa637ecf5e5177c84efc16fcaa18d57017631"
REJECTED_346="346bbd3cbe6943a83b2077c455174d74b7a493ad"

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
PACK_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
REPO_ROOT="$(cd "$PACK_ROOT/../.." && pwd)"

REQUESTED="${E01_SHA:-${I01_SHA:-${KERNEL_SHA:-$E01_SHA_REQUIRED}}}"
TERMS_VERSION="${TERMS_VERSION:-${TERMS_VERSION_KIND:-}}"
DEST="${EARNED_WORK_KERNEL_ROOT:-${E01_WORKTREE:-$REPO_ROOT/.scratch/e01-c4048401fa42}}"

pin_mismatch() {
  echo "pin_mismatch: $*" >&2
  echo "pin_mismatch" >&2
  exit 1
}

if [[ -n "$TERMS_VERSION" ]]; then
  if [[ "$TERMS_VERSION" =~ ^[0-9]+$ || "$TERMS_VERSION" == "integer" || "$TERMS_VERSION" == "int" ]]; then
    pin_mismatch "integer termsVersion is rejected; E01 requires sha256 content-hash (requested TERMS_VERSION=$TERMS_VERSION)"
  fi
fi

case "$REQUESTED" in
  "$REJECTED_819"|"$REJECTED_346"|819fa637*|346bbd3c*)
    pin_mismatch "old I01 pin $REQUESTED is not current E01 $E01_SHA_REQUIRED"
    ;;
esac

if [[ "$REQUESTED" != "$E01_SHA_REQUIRED" ]]; then
  pin_mismatch "requested $REQUESTED is not current E01 $E01_SHA_REQUIRED (tree $E01_TREE_REQUIRED)"
fi

if [[ ! -d "$REPO_ROOT/.git" ]]; then
  echo "prepare-e01-worktree: run from a neomorphic-io checkout" >&2
  exit 1
fi

mkdir -p "$(dirname "$DEST")"
if [[ ! -d "$DEST/services/earned-work" ]]; then
  git -C "$REPO_ROOT" fetch origin "$E01_SHA_REQUIRED" --quiet || git -C "$REPO_ROOT" fetch origin pull/109/head --quiet || true
  if ! git -C "$REPO_ROOT" cat-file -t "$E01_SHA_REQUIRED" >/dev/null 2>&1; then
    echo "prepare-e01-worktree: missing object $E01_SHA_REQUIRED" >&2
    exit 1
  fi
  git -C "$REPO_ROOT" worktree add --detach "$DEST" "$E01_SHA_REQUIRED"
fi

HEAD="$(git -C "$DEST" rev-parse HEAD)"
if [[ "$HEAD" != "$E01_SHA_REQUIRED" ]]; then
  pin_mismatch "worktree HEAD $HEAD is not current E01 $E01_SHA_REQUIRED"
fi
TREE="$(git -C "$DEST" rev-parse HEAD:services/earned-work)"
if [[ "$TREE" != "$E01_TREE_REQUIRED" ]]; then
  pin_mismatch "services/earned-work tree $TREE is not $E01_TREE_REQUIRED"
fi

EARNED="$DEST/services/earned-work"
if [[ ! -d "$EARNED/node_modules/pg" ]]; then
  (cd "$EARNED" && npm ci --ignore-scripts)
fi
if [[ ! -f "$EARNED/dist/index.js" ]]; then
  (cd "$EARNED" && npm run build)
fi
if [[ ! -f "$EARNED/dist/index.js" ]]; then
  echo "prepare-e01-worktree: compiled kernel missing $EARNED/dist/index.js" >&2
  exit 1
fi

echo "EARNED_WORK_KERNEL_ROOT=$DEST"
echo "E01_SHA=$E01_SHA_REQUIRED"
echo "E01_TREE=$E01_TREE_REQUIRED"
