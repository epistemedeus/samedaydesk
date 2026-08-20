#!/usr/bin/env bash
# SameDayDesk self-audit replay script (SDD-SELF-2026-01, T0 2026-08-19T15:30:34Z).
#
# What it does: fetches the same public URLs the audit fetched, prints the SHA256 of
# each body next to the frozen T0 hash, and tests the four High findings as predicates.
#
# Exit codes:
#   1  at least one T0 defect predicate STILL matches production (findings still open)
#   0  none of the T0 defect predicates match any more (findings closed on the live site)
#
# A non-zero exit while the remediation clock is running is the expected result.
# Requires: bash, curl, sha256sum, grep. No SameDayDesk code and no account needed.
# Usage: bash replay.sh   (override the target with BASE=https://example.com bash replay.sh)

set -u
BASE="${BASE:-https://samedaydesk.com}"
UA="SameDayDeskAudit/0.1 (+https://samedaydesk.com/audit)"
TMP="$(mktemp -d)"
trap 'rm -rf "$TMP"' EXIT
open_count=0

echo "replay of SDD-SELF-2026-01 against $BASE"
echo "run at (UTC): $(date -u +%Y-%m-%dT%H:%M:%SZ)"
echo "T0 was:       2026-08-19T15:30:34Z"
echo

get () { # path outfile
  curl -sS --max-time 30 -A "$UA" -o "$TMP/$2" "$BASE$1"
}

hashline () { # label file frozen
  local got
  got="$(sha256sum "$TMP/$2" | cut -d' ' -f1)"
  if [ "$got" = "$3" ]; then
    echo "  $1: sha256 $got  (matches the T0 capture byte for byte)"
  else
    echo "  $1: sha256 $got"
    echo "     T0 was  $3  (body has changed since T0, which is expected after remediation)"
  fi
}

fail () { open_count=$((open_count+1)); echo "  STILL OPEN: $1"; }
pass () { echo "  closed: $1"; }

# ---------------------------------------------------------------- 1. homepage first byte
get "/" home.html
echo "SDD-2026-001  first-byte JSON-LD service catalog"
hashline "GET /" home.html 103ed1c7b6901096de45245ad593eabd5e125c3f802e8f2b1bb98368b47e53d8
if grep -q '"@type": "OfferCatalog"' "$TMP/home.html" && grep -q 'RAG Chatbot Over Your Docs' "$TMP/home.html"; then
  fail "first-byte HTML still carries the OfferCatalog block naming the old service list"
else
  pass "no OfferCatalog naming the old service list in first-byte HTML"
fi
echo

echo "SDD-2026-002  first-byte noscript service catalog"
if grep -q '<noscript>' "$TMP/home.html" && grep -q 'Local Business Lead List' "$TMP/home.html"; then
  fail "first-byte noscript still lists the old catalog"
else
  pass "no old catalog inside a first-byte noscript block"
fi
echo

# ---------------------------------------------------------------- 3. machine surface counts
echo "SDD-2026-003  machine surfaces disagree on how many tools exist"
get "/llms.txt" llms.txt
get "/.well-known/agent-card.json" agent-card.json
hashline "GET /llms.txt" llms.txt 2d8fd1421a3d708e4c6ba2e5d3339a1965ac75a0dd8a0968748ef1c25786784a
hashline "GET /.well-known/agent-card.json" agent-card.json 0b6f1659c4dd1f52df7bc4bff8fd51132c00890c630852374a083217a36b3b0c
get "/resources.html" resources-count.html
card_eight=$(grep -c -i 'eight' "$TMP/agent-card.json" || true)
llms_twelve=$(grep -c -i 'twelve' "$TMP/llms.txt" || true)
res_seven=$(grep -c -i 'seven paid data tools' "$TMP/resources-count.html" || true)
echo "  agent card says 'eight': $card_eight   llms.txt says 'twelve': $llms_twelve   resources says 'seven paid data tools': $res_seven"
echo "  (at T0 the gateway manifest itself published 23 items, so all three site numbers were wrong)"
published=0
[ "$card_eight" -gt 0 ] && published=$((published+1))
[ "$llms_twelve" -gt 0 ] && published=$((published+1))
[ "$res_seven" -gt 0 ] && published=$((published+1))
if [ "$published" -gt 1 ]; then
  fail "$published site surfaces still publish a hardcoded count for the same tool set"
else
  pass "the site no longer publishes contradicting counts for the gateway tool set"
fi
echo

# ---------------------------------------------------------------- 4. tagline
echo "SDD-2026-004  brand tagline and title sell the previous service line"
if grep -q 'hand off the busywork' "$TMP/home.html"; then
  fail "the busywork tagline is still in first-byte HTML"
else
  pass "the busywork tagline is gone from first-byte HTML"
fi
echo

# ---------------------------------------------------------------- supporting captures
echo "supporting captures (not scored)"
get "/sitemap.xml" sitemap.xml
get "/resources.html" resources.html
hashline "GET /sitemap.xml" sitemap.xml 466fda7af83fa800392297fca0b9a7655b656619480ccc6948faed583e875247
hashline "GET /resources.html" resources.html e4e1a4abfd4a288d228993f05a75b00fdb925061a8d2df1037b47806dfbbfcc2
code404=$(curl -sS -o /dev/null -w '%{http_code}' --max-time 30 -A "$UA" "$BASE/this-page-does-not-exist-9f3a")
echo "  SDD-2026-006 unknown URL returns HTTP $code404 (T0 returned 200)"
echo

echo "-----"
if [ "$open_count" -gt 0 ]; then
  echo "$open_count of the four T0 High findings still match production."
  exit 1
fi
echo "None of the four T0 High findings match production any more."
exit 0
