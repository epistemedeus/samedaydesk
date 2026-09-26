#!/usr/bin/env bash
# S138 stepped admission: start 9, then +6, then +9 while prior still active.
# Gate: MemAvailable > 25% MemTotal. Count working grok sessions only.
set -euo pipefail
ROOT=/workspace/experiments/s138-capability-evidence
CELLS=$ROOT/cells
EVENTS=$ROOT/evidence/admission-events.jsonl
GROK=${GROK_BIN:-/home/ubuntu/.local/bin/grok}
CAPACITY=$CELLS/CAPACITY.md
mkdir -p "$ROOT/evidence"
: > "$EVENTS"

mem_json() {
  python3 - <<'PY'
import json
mem=open("/proc/meminfo").read().splitlines()
d={}
for line in mem:
    if line.startswith("MemTotal:") or line.startswith("MemAvailable:"):
        k,v,_=line.split()
        d[k[:-1]]=int(v)
floor=int(d["MemTotal"]*0.25)
try: psi=open("/proc/pressure/memory").read().splitlines()[0]
except Exception: psi=""
print(json.dumps({"MemTotal":d["MemTotal"],"MemAvailable":d["MemAvailable"],"reserveFloor":floor,"psi":psi,"ok":d["MemAvailable"]>floor}))
PY
}

working_count() {
  ps -eo args | rg -c '/bin/grok .*--session-id .*--prompt-file' || true
}

event() {
  local type="$1"; shift
  local extra="$1"
  python3 - <<PY
import json, time
m=json.loads('''$(mem_json)''')
row={"ts":time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()),"type":"$type","MemTotalKiB":m["MemTotal"],"MemAvailableKiB":m["MemAvailable"],"reserveFloorKiB":m["reserveFloor"],"psi":m["psi"],"workingSessions":int('''$(working_count)'''), **json.loads('''$extra''')}
open("$EVENTS","a").write(json.dumps(row)+"\n")
print(json.dumps(row))
PY
}

launch_one() {
  local id="$1"
  local m
  m=$(mem_json)
  if ! python3 -c "import json,sys; m=json.loads(sys.argv[1]); sys.exit(0 if m['ok'] else 1)" "$m"; then
    event gate "{\"cellId\":\"$id\",\"reason\":\"mem_available_below_25pct_total\"}"
    echo "GATE blocked $id"
    return 1
  fi
  local sid
  sid=$(python3 -c 'import uuid; print(uuid.uuid4())')
  echo "$sid" > "$CELLS/$id/session"
  mkdir -p "$CELLS/$id"
  setsid nohup env GROK_HOME="${GROK_HOME:-$HOME/.grok-pilot-canary}" "$GROK" \
    --always-approve --model grok-4.6 --reasoning-effort xhigh \
    --cwd "$ROOT" --session-id "$sid" --output-format plain \
    --prompt-file "$CELLS/$id/prompt.md" \
    >"$CELLS/$id/out.txt" 2>"$CELLS/$id/err.txt" < /dev/null &
  local pid=$!
  echo "$pid" > "$CELLS/$id/pid"
  event admission "{\"cellId\":\"$id\",\"sessionId\":\"$sid\",\"pid\":$pid}"
  echo "ADMIT $id sid=$sid pid=$pid"
}

wait_some_active() {
  # return 0 if at least one working session
  local n
  n=$(working_count)
  [[ "${n:-0}" -gt 0 ]]
}

COHORT1=(S01-resolver-review S02-evidence-review S03-partial-review S04-schema-check S05-cli-help S06-bot-contract S07-reuse-atk S08-catalog-verify F01-manifest-engines)
COHORT2=(F02-manifest-bins F03-grexal-js F04-declaration-03 F05-tap-fail F06-partial-fresh-iso F07-scope-mismatch)
COHORT3=(F08-conflict-fields C01-consumer-ready C02-consumer-catalog C03-consumer-bound C04-consumer-untested C05-consumer-partial C06-consumer-holes C07-demo C08-s129-capacity-semantics)

m0=$(mem_json)
echo "| Admit-c1 | $(python3 -c "import json,sys;print(json.loads(sys.argv[1])['MemAvailable'])" "$m0") KiB | $(python3 -c "import json,sys;print(json.loads(sys.argv[1])['psi'])" "$m0") | $(working_count) | launching 9 |" >> "$CAPACITY"

for id in "${COHORT1[@]}"; do launch_one "$id" || true; done
sleep 8
m1=$(mem_json)
echo "| Overlap-c1 (~8s) | $(python3 -c "import json,sys;print(json.loads(sys.argv[1])['MemAvailable'])" "$m1") KiB | $(python3 -c "import json,sys;print(json.loads(sys.argv[1])['psi'])" "$m1") | $(working_count) | c1 active |" >> "$CAPACITY"
event snapshot '{"phase":"after-c1-overlap"}' >/dev/null

# Admit +6 while prior active
if wait_some_active; then
  echo "| Admit-c2 | $(python3 -c "import json,sys;print(json.loads(sys.argv[1])['MemAvailable'])" "$(mem_json)") KiB | $(python3 -c "import json,sys;print(json.loads(sys.argv[1])['psi'])" "$(mem_json)") | $(working_count) | +6 while c1 active |" >> "$CAPACITY"
  for id in "${COHORT2[@]}"; do launch_one "$id" || true; done
else
  event gate '{"reason":"no_working_sessions_before_c2","phase":"c2"}' >/dev/null
  for id in "${COHORT2[@]}"; do launch_one "$id" || true; done
fi

sleep 8
echo "| Overlap-c2 (~8s) | $(python3 -c "import json,sys;print(json.loads(sys.argv[1])['MemAvailable'])" "$(mem_json)") KiB | $(python3 -c "import json,sys;print(json.loads(sys.argv[1])['psi'])" "$(mem_json)") | $(working_count) | c1+c2 |" >> "$CAPACITY"
event snapshot '{"phase":"after-c2-overlap"}' >/dev/null

# Admit +9 while prior active
echo "| Admit-c3 | $(python3 -c "import json,sys;print(json.dumps(json.loads(sys.argv[1])))" "$(mem_json)") |" >> /dev/null
echo "| Admit-c3 | $(python3 -c "import json,sys;print(json.loads(sys.argv[1])['MemAvailable'])" "$(mem_json)") KiB | $(python3 -c "import json,sys;print(json.loads(sys.argv[1])['psi'])" "$(mem_json)") | $(working_count) | +9 while prior active |" >> "$CAPACITY"
for id in "${COHORT3[@]}"; do launch_one "$id" || true; done

sleep 8
echo "| Overlap-c3 (~8s) | $(python3 -c "import json,sys;print(json.loads(sys.argv[1])['MemAvailable'])" "$(mem_json)") KiB | $(python3 -c "import json,sys;print(json.loads(sys.argv[1])['psi'])" "$(mem_json)") | $(working_count) | all cohorts |" >> "$CAPACITY"
event snapshot '{"phase":"after-c3-overlap"}' >/dev/null

echo "Admission complete. Waiting for workers..."
# Wait until no working sessions (max ~25 min)
deadline=$((SECONDS+1500))
while (( SECONDS < deadline )); do
  n=$(working_count)
  echo "$(date -u +%H:%M:%S) workingSessions=$n"
  if [[ "${n:-0}" -eq 0 ]]; then break; fi
  sleep 20
done

# Record completions for finished cells
for id in "${COHORT1[@]}" "${COHORT2[@]}" "${COHORT3[@]}"; do
  if [[ -f "$CELLS/$id/out.txt" ]]; then
    # usage harvest
    sid=$(cat "$CELLS/$id/session" 2>/dev/null || true)
    if [[ -n "$sid" ]]; then
      "$GROK" usage "$sid" >"$CELLS/$id/usage.json" 2>/dev/null || true
    fi
    # exit code unknown for nohup unless we wait on pid - check if pid alive
    if [[ -f "$CELLS/$id/pid" ]] && ! kill -0 "$(cat "$CELLS/$id/pid")" 2>/dev/null; then
      event completion "{\"cellId\":\"$id\",\"sessionId\":\"$sid\"}" >/dev/null || true
    fi
  fi
done

mF=$(mem_json)
echo "| Complete | $(python3 -c "import json,sys;print(json.loads(sys.argv[1])['MemAvailable'])" "$mF") KiB | $(python3 -c "import json,sys;print(json.loads(sys.argv[1])['psi'])" "$mF") | $(working_count) | workers drained |" >> "$CAPACITY"
echo DONE
