#!/usr/bin/env bash
# Fixture provenance: HTTP journey reserved→claimed→submitted→verified→owed.
# Not production. Not settlement. Artifact metadata is never executed.
set -euo pipefail

BASE_URL="${EARNED_WORK_BASE_URL:-http://127.0.0.1:8791}"
OWNER="${EARNED_WORK_OWNER_TOKEN:?EARNED_WORK_OWNER_TOKEN is required}"
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
WORKDIR="$(mktemp -d "${TMPDIR:-/tmp}/ew-journey.XXXXXX")"
trap 'rm -rf "$WORKDIR"' EXIT

json_field() {
  node -e 'const fs=require("fs"); const d=JSON.parse(fs.readFileSync(process.argv[1],"utf8")); const path=process.argv[2].split("."); let x=d; for (const k of path) { if (x==null) process.exit(2); x=x[k]; } if (x===undefined) process.exit(2); process.stdout.write(typeof x==="object"?JSON.stringify(x):String(x));' "$1" "$2"
}

curl_json() {
  local out="$1" method="$2" path="$3" token="${4:-}" key="${5:-}" body="${6:-}"
  local args=(-sS -D "$WORKDIR/headers" -o "$out" -X "$method" "$BASE_URL$path")
  args+=(-H "content-type: application/json")
  if [[ -n "$token" ]]; then args+=(-H "authorization: Bearer $token"); fi
  if [[ -n "$key" ]]; then args+=(-H "idempotency-key: $key"); fi
  if [[ -n "$body" ]]; then args+=(-d "$body"); fi
  curl "${args[@]}"
  local status
  status="$(awk 'BEGIN{s=0} /^HTTP/{s=$2} END{print s}' "$WORKDIR/headers")"
  echo "$status"
}

wait_health() {
  local i
  for i in $(seq 1 50); do
    if curl -fsS "$BASE_URL/healthz" -o "$WORKDIR/health.json" >/dev/null 2>&1; then
      if grep -q '"ok":true' "$WORKDIR/health.json"; then
        return 0
      fi
    fi
    sleep 0.2
  done
  echo "earned-work fixture did not become healthy at $BASE_URL" >&2
  return 1
}

echo "earned-work curl-journey provenance=fixture base=$BASE_URL"
wait_health

DIGEST_LINE="$(node -e 'const c=require("crypto"); const b=Buffer.from("neomorphic.proof-of-execution.example.v1\n"); process.stdout.write(c.createHash("sha256").update(b).digest("hex")+" "+b.length);')"
DIGEST="${DIGEST_LINE%% *}"
BYTES="${DIGEST_LINE##* }"
STAMP="$(date +%s)-$$"

CREATE_BODY="$(node -e '
const fs=require("fs");
const fixture=JSON.parse(fs.readFileSync(process.argv[1],"utf8"));
const stamp=process.argv[2];
const body={
  title: fixture.title,
  summary: fixture.summary,
  provenance: "fixture",
  reward: fixture.reward,
  budget: fixture.budget,
  terms: fixture.terms,
  correctionPolicy: fixture.correctionPolicy || { maxRevisions: 1 },
};
process.stdout.write(JSON.stringify(body));
' "$ROOT/fixtures/journey-task.json" "$STAMP")"

status="$(curl_json "$WORKDIR/create.json" POST /v1/tasks "$OWNER" "fixture-create-$STAMP" "$CREATE_BODY")"
test "$status" = "201" || { echo "create failed status=$status body=$(cat "$WORKDIR/create.json")" >&2; exit 1; }
TASK_ID="$(json_field "$WORKDIR/create.json" task.id)"
TERMS_VERSION="$(json_field "$WORKDIR/create.json" task.termsVersion)"
test "$(json_field "$WORKDIR/create.json" task.fundingState)" = "unfunded"
test "$(json_field "$WORKDIR/create.json" task.provenance)" = "fixture"
echo "STEP termsVersion=$TERMS_VERSION"
test "$(json_field "$WORKDIR/create.json" task.provenance)" = "fixture"

status="$(curl_json "$WORKDIR/reserve.json" POST "/v1/tasks/$TASK_ID/funding/reserve" "$OWNER" "fixture-reserve-$STAMP" "{}")"
test "$status" = "200" || { echo "reserve failed status=$status body=$(cat "$WORKDIR/reserve.json")" >&2; exit 1; }
test "$(json_field "$WORKDIR/reserve.json" task.fundingState)" = "reserved"
echo "STEP funding_state=reserved"

TOKEN_BODY="$(node -e 'process.stdout.write(JSON.stringify({contributorPublicId:"fixture-contrib-"+process.argv[1], payoutDestination:"fixture-dest-not-for-public", provenance:"fixture"}))' "$STAMP")"
status="$(curl_json "$WORKDIR/token.json" POST /v1/contributor-tokens "$OWNER" "" "$TOKEN_BODY")"
test "$status" = "201" || { echo "token failed status=$status body=$(cat "$WORKDIR/token.json")" >&2; exit 1; }
CONTRIB_TOKEN="$(json_field "$WORKDIR/token.json" token)"
test "$(json_field "$WORKDIR/token.json" provenance)" = "fixture"

CLAIM_BODY="$(node -e 'process.stdout.write(JSON.stringify({termsVersion:process.argv[1]}))' "$TERMS_VERSION")"
status="$(curl_json "$WORKDIR/claim.json" POST "/v1/tasks/$TASK_ID/claims" "$CONTRIB_TOKEN" "fixture-claim-$STAMP" "$CLAIM_BODY")"
test "$status" = "201" || { echo "claim failed status=$status body=$(cat "$WORKDIR/claim.json")" >&2; exit 1; }
RSV_ID="$(json_field "$WORKDIR/claim.json" reservation.id)"
test "$(json_field "$WORKDIR/claim.json" reservation.status)" = "active"
echo "STEP reservation=claimed"

SUBMIT_BODY="$(node -e 'process.stdout.write(JSON.stringify({reservationId:process.argv[1], artifact:{ref:"fixture:s275-curl-journey-not-fetched", digestSha256:process.argv[2], mediaType:"text/plain", bytes:Number(process.argv[3])}}))' "$RSV_ID" "$DIGEST" "$BYTES")"
status="$(curl_json "$WORKDIR/submit.json" POST "/v1/tasks/$TASK_ID/submissions" "$CONTRIB_TOKEN" "fixture-submit-$STAMP" "$SUBMIT_BODY")"
test "$status" = "201" || { echo "submit failed status=$status body=$(cat "$WORKDIR/submit.json")" >&2; exit 1; }
test "$(json_field "$WORKDIR/submit.json" task.lifecycle)" = "submitted"
echo "STEP submission=submitted"

status="$(curl_json "$WORKDIR/verdict.json" POST "/v1/tasks/$TASK_ID/verdicts" "$OWNER" "fixture-verdict-$STAMP" "$(node -e 'process.stdout.write(JSON.stringify({reservationId:process.argv[1]}))' "$RSV_ID")")"
test "$status" = "201" || { echo "verdict failed status=$status body=$(cat "$WORKDIR/verdict.json")" >&2; exit 1; }
test "$(json_field "$WORKDIR/verdict.json" verdict.outcome)" = "pass"
test "$(json_field "$WORKDIR/verdict.json" task.lifecycle)" = "verified"
echo "STEP verdict=verified"

status="$(curl_json "$WORKDIR/accept.json" POST "/v1/tasks/$TASK_ID/accept" "$OWNER" "fixture-accept-$STAMP" "$(node -e 'process.stdout.write(JSON.stringify({reservationId:process.argv[1]}))' "$RSV_ID")")"
test "$status" = "201" || { echo "accept failed status=$status body=$(cat "$WORKDIR/accept.json")" >&2; exit 1; }
test "$(json_field "$WORKDIR/accept.json" obligation.payoutState)" = "owed"
test "$(json_field "$WORKDIR/accept.json" obligation.transfer)" = "null"
test "$(json_field "$WORKDIR/accept.json" task.payoutState)" = "owed"
echo "STEP payout_state=owed"

status="$(curl_json "$WORKDIR/obligation.json" GET "/v1/tasks/$TASK_ID/obligation" "$OWNER")"
test "$status" = "200"
test "$(json_field "$WORKDIR/obligation.json" obligation.kind)" = "owed_record"
test "$(json_field "$WORKDIR/obligation.json" obligation.payoutState)" = "owed"
test "$(json_field "$WORKDIR/obligation.json" obligation.transfer)" = "null"

status="$(curl_json "$WORKDIR/payout.json" GET "/v1/tasks/$TASK_ID/payout" "$OWNER")"
test "$status" = "200" || { echo "payout reconcile failed status=$status body=$(cat "$WORKDIR/payout.json")" >&2; exit 1; }
test "$(json_field "$WORKDIR/payout.json" payoutState)" = "owed"
test "$(json_field "$WORKDIR/payout.json" reconciliation.adapter)" = "null_nonpaying_v0"
test "$(json_field "$WORKDIR/payout.json" reconciliation.transfer)" = "null"
test "$(json_field "$WORKDIR/payout.json" reconciliation.paid)" = "false"
test "$(json_field "$WORKDIR/payout.json" reconciliation.settled)" = "false"
test "$(json_field "$WORKDIR/payout.json" reconciliation.paying)" = "false"
echo "STEP payout=null/nonpaying owed≠paid≠settled"

status="$(curl_json "$WORKDIR/public.json" GET "/v1/tasks/$TASK_ID")"
test "$status" = "200"
if grep -q "fixture-dest-not-for-public" "$WORKDIR/public.json"; then
  echo "public redaction leaked payout destination" >&2
  exit 1
fi

# Seeded failure: contributor bearer cannot owner-accept or authorize payout.
status="$(curl_json "$WORKDIR/seeded-accept.json" POST "/v1/tasks/$TASK_ID/accept" "$CONTRIB_TOKEN" "fixture-seeded-accept-$STAMP" "$(node -e 'process.stdout.write(JSON.stringify({reservationId:process.argv[1]}))' "$RSV_ID")")"
test "$status" = "401" || { echo "seeded failure expected 401 got status=$status body=$(cat "$WORKDIR/seeded-accept.json")" >&2; exit 1; }
test "$(json_field "$WORKDIR/seeded-accept.json" error.code)" = "unauthorized" || { echo "seeded failure expected unauthorized got $(cat "$WORKDIR/seeded-accept.json")" >&2; exit 1; }
echo "SEEDED_FAILURE=contributor-accept REJECTED status=401 code=unauthorized"

echo "JOURNEY_RESULT=reserved→claimed→submitted→verified→owed"
echo "taskId=$TASK_ID"
echo "provenance=fixture"
echo "transfer=null"
echo "payout_adapter=null_nonpaying_v0"
