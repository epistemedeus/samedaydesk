#!/usr/bin/env bash
# AE21 U2 (Helm-owned vendoring): G4 extraction contract + merchant extract kernel.
# Source: epistemedeus/x402-url-extractor @6dd7a040 (G4 receipt commit).
#   fetch  (default, from the samedaydesk repo root): download each file with gh,
#          verify its git blob sha, write server/vendor/url-extract/.
#   --verify [DIR]: offline; re-hash every vendored file in DIR (default: this
#          script's directory) and refuse (exit 1) on any missing/extra/tampered file.
# Every mismatch aborts with exit 1. No npm install: @exodus/bytes@1.16.0 is
# pinned exactly in package.json/package-lock.json and checked here.
set -euo pipefail
SRC_REPO=epistemedeus/x402-url-extractor
SRC_SHA=6dd7a040f80f3e3ce1d914383172721751de59a2
DEST=server/vendor/url-extract
FILES=(
  "extract.mjs 2f27b32abc2bdbccf47fbab869421b2ad01da1a6"
  "extract-capture.mjs 287a7d61d9885fd52349205ebde92e0373d23ab7"
  "extract-excerpt-budget.mjs 78aa5fa54a9a66e71cac87596a236ef8a0d4dfe8"
  "extract-batch-config.mjs bf0bf17002c6a6e964b07ab5cd02812e73dd705a"
  "extract-batch-c1/url-guard.mjs cd6f4a0a9ac1c2ead689075ce4550dc579ccb56b"
  "extract-batch-c1/public-fetch.mjs 8eadcd92ffb0dd04303dfabd268241847bc82da1"
  "experiments/ae19-paid-continuation/extraction-contract/service.mjs 35a6fdc607c91d93a30186da1482f9ef07f829b8"
  "experiments/ae19-paid-continuation/extraction-contract/store.mjs a89fa6d2fb1fc3b102e6d8bd60f1a1103143d387"
  "experiments/ae19-paid-continuation/extraction-contract/digest.mjs 3aeb60a0d2de919d0a675c6ae8c6e0199bd74498"
  "experiments/ae19-paid-continuation/extraction-contract/fit.mjs 6ae1a477eeb63c93bc9d75993f8bf93550a49562"
)
blob() { git hash-object --no-filters "$1"; }
if [ "${1:-}" = "--verify" ]; then
  dir=${2:-$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)}
  bad=0
  for entry in "${FILES[@]}"; do
    read -r path want <<<"$entry"
    if [ ! -f "$dir/$path" ] || [ -L "$dir/$path" ]; then echo "vendor_file_missing $path" >&2; bad=1; continue; fi
    got=$(blob "$dir/$path")
    [ "$got" = "$want" ] || { echo "blob mismatch $path: $got != $want" >&2; bad=1; }
  done
  # No unlisted code may ride along in the vendored tree.
  while IFS= read -r extra; do
    rel=${extra#"$dir/"}
    listed=0; for entry in "${FILES[@]}"; do [ "${entry%% *}" = "$rel" ] && listed=1; done
    [ $listed = 1 ] || { echo "vendor_file_unlisted $rel" >&2; bad=1; }
  done < <(find "$dir" -type f \( -name '*.mjs' -o -name '*.js' -o -name '*.cjs' \) | sort)
  [ $bad = 0 ] || exit 1
  echo "verified ${#FILES[@]} vendored files"
  exit 0
fi
test -f server/lib/machine-services/mount.mjs || { echo "run from the samedaydesk repo root" >&2; exit 2; }
for entry in "${FILES[@]}"; do
  read -r path want <<<"$entry"
  mkdir -p "$DEST/$(dirname "$path")"
  gh api "repos/$SRC_REPO/contents/$path?ref=$SRC_SHA" -H 'Accept: application/vnd.github.raw' > "$DEST/$path.tmp"
  got=$(blob "$DEST/$path.tmp")
  [ "$got" = "$want" ] || { rm -f "$DEST/$path.tmp"; echo "blob mismatch $path: $got != $want" >&2; exit 1; }
  mv "$DEST/$path.tmp" "$DEST/$path"
  node --check "$DEST/$path"
done
cat > "$DEST/SOURCE.json" <<JSON
{"schema":"sds.vendor.url-extract.v1","repository":"$SRC_REPO","commit":"$SRC_SHA","merchantRoot":".","files":${#FILES[@]},"notVendored":["terms.mjs","http.mjs"],"dependencies":{"@exodus/bytes":"1.16.0","pg":"root","zod":"root"},"license":"see upstream repository"}
JSON
node -e 'const p=require("./package.json"); if (p.dependencies?.["@exodus/bytes"]!=="1.16.0") { console.error("exodus_bytes_pin_missing"); process.exit(1); }'
echo "vendored ${#FILES[@]} files into $DEST"
