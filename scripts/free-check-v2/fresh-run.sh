#!/bin/bash
# One finite, source-closed fresh-VM execution. No model, live credentials or deploy.
set -euo pipefail
umask 077
input=${1:?absolute pinned input directory required}
case "$input" in /*) ;; *) exit 2;; esac
node_bin=/exec-daemon/node
[ -x "$node_bin" ] || { echo 'Node executable unavailable'; exit 2; }
[ "$(cat /proc/sys/kernel/random/boot_id)" = a9c17957-b3f6-4e6e-88f5-a4f197cbcdbb ] || { echo 'Fresh boot identity mismatch'; exit 2; }
"$node_bin" -e 'let [a,b]=process.versions.node.split(".").map(Number);if(a!==22||b<12)process.exit(2)'
work=/tmp/sds-free-check-v2-native-20261122
[ ! -e "$work" ] || { echo 'Task destination already exists; inspect its receipt, do not restart'; exit 2; }
mkdir -m 700 "$work"
exec 9>"$work/finite-job.lock"
flock -n 9 || exit 2
original_home=$HOME
mkdir -m 700 "$work/bin" "$work/home" "$work/out" "$work/tools"
export SDS_FREE_CHECK_TASK_ROOT="$work"
python3 - "$work/out/admission.json" <<'PY'
import json,os,sys,time
s=os.statvfs('/tmp');mem={k:int(v.split()[0])*1024 for k,v in [x.split(':',1)for x in open('/proc/meminfo')] if k in ['MemAvailable','MemTotal']}
r={'at':time.strftime('%Y-%m-%dT%H:%M:%SZ',time.gmtime()),'boot':open('/proc/sys/kernel/random/boot_id').read().strip(),'cpuCount':os.cpu_count(),'memoryBytes':mem,'freeDiskBytes':s.f_bavail*s.f_frsize,'freeInodePercent':100*s.f_favail/s.f_files,'loadAverage':os.getloadavg()}
open(sys.argv[1],'w').write(json.dumps(r,indent=2)+'\n')
if r['freeDiskBytes']<8*1024**3 or mem.get('MemAvailable',0)<4*1024**3 or r['freeInodePercent']<20:raise SystemExit('Fresh host capacity admission refused')
PY
"$node_bin" - "$input" <<'JS'
const fs=require('fs'),path=require('path'),crypto=require('crypto');const root=process.argv[2],m=JSON.parse(fs.readFileSync(path.join(root,'input.json')));
for(const [name,want]of Object.entries(m.files)){if(!/^[a-zA-Z0-9_.-]+$/.test(name))throw Error('input name');const file=path.join(root,name),st=fs.lstatSync(file);if(!st.isFile()||st.isSymbolicLink()||st.size!==want.bytes||crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex')!==want.sha256)throw Error('input closure mismatch');}
JS
# All archives were hash-verified first. Extraction cannot leave this task tree.
python3 - "$input" "$work/tools" <<'PY'
import tarfile,pathlib,sys
src=pathlib.Path(sys.argv[1]);dst=pathlib.Path(sys.argv[2])
for name in ['npm-10.9.9.tar.gz','kit-d0ae4ef6.tar.gz','transport-317734ac.tar.gz']:
 with tarfile.open(src/name)as t:
  for m in t.getmembers():
   p=pathlib.PurePosixPath(m.name)
   if p.is_absolute()or'..'in p.parts or not(m.isfile()or m.isdir()):raise SystemExit('unsafe tool archive')
  t.extractall(dst)
PY
export SDS_V2_NPM_CLI="$work/tools/npm/bin/npm-cli.js"
ln -s "$node_bin" "$work/bin/node"
cat > "$work/bin/npm" <<'SH'
#!/bin/sh
exec /exec-daemon/node "$SDS_V2_NPM_CLI" "$@"
SH
cat > "$work/bin/npx" <<'SH'
#!/bin/sh
exec /exec-daemon/node "${SDS_V2_NPM_CLI%/npm-cli.js}/npx-cli.js" "$@"
SH
chmod 700 "$work/bin/npm" "$work/bin/npx"
export PATH="$work/bin:/usr/local/bin:/usr/bin:/bin"
export NPM_CONFIG_CACHE="$work/npm-cache"
export RELEASE_KIT_DIR="$work/tools/tools/release-kit"
export RELEASE_KIT_COMMIT=d0ae4ef67c3d1f794985b5d746db1b8857c7c808
source_pin=$("$node_bin" -p 'JSON.parse(require("fs").readFileSync(process.argv[1])).source' "$input/input.json")
# This is a local, complete Git bundle. There is no network Git/auth substitution.
git clone --no-hardlinks --quiet --branch codex/sds-free-check-v2-20261122 "$input/source.bundle" "$work/source" > "$work/out/source-clone.log" 2>&1
repo="$work/source"
git -C "$repo" cat-file -e "$source_pin^{commit}"
run() {
 local name=$1 seconds=$2; shift 2
 local start finish rc
 start=$(date -u +%FT%TZ)
 set +e
 timeout --signal=TERM --kill-after=10s "$seconds" setsid "$@" > "$work/out/$name.log" 2>&1
 rc=$?
 set -e
 finish=$(date -u +%FT%TZ)
 "$node_bin" - "$work/out/steps.jsonl" "$name" "$rc" "$start" "$finish" <<'JS'
const fs=require('fs');const [file,name,rc,startedAt,finishedAt]=process.argv.slice(2);fs.appendFileSync(file,JSON.stringify({name,exit:Number(rc),startedAt,finishedAt})+'\n');
JS
 return 0
}
# Missing packages are installed only here, on this admitted fresh VM.
if ! command -v pg_config >/dev/null 2>&1; then
 run postgres-system 600 sudo -n sh -c 'apt-get update -qq && DEBIAN_FRONTEND=noninteractive apt-get install -y -qq postgresql libpq-dev'
fi
run kit-install 600 npm ci --prefix "$RELEASE_KIT_DIR" --ignore-scripts --no-audit --no-fund
run chrome-resolver 30 "$node_bin" "$input/chrome.mjs" "$RELEASE_KIT_DIR" "$work/browser" "$work/out/chrome-path.txt" --check
chrome=''
for file in /usr/bin/google-chrome /opt/google/chrome/chrome /usr/bin/chromium /usr/bin/chromium-browser; do if [ -x "$file" ]; then chrome=$file; break; fi; done
if [ -z "$chrome" ]; then
 run chrome-install 600 "$node_bin" "$input/chrome.mjs" "$RELEASE_KIT_DIR" "$work/browser" "$work/out/chrome-path.txt"
 [ ! -s "$work/out/chrome-path.txt" ] || chrome=$(cat "$work/out/chrome-path.txt")
fi
export RELEASE_CHROME="$chrome"
[ -z "$chrome" ] || "$chrome" --version > "$work/out/chrome-version.txt" 2>&1 || true
# Isolate application children from every controller/provider environment value.
appenv=(env -i HOME="$work/home" PATH="$PATH" SDS_V2_NPM_CLI="$SDS_V2_NPM_CLI" NPM_CONFIG_CACHE="$NPM_CONFIG_CACHE" RELEASE_KIT_DIR="$RELEASE_KIT_DIR" RELEASE_KIT_COMMIT="$RELEASE_KIT_COMMIT" RELEASE_CHROME="$chrome" SDS_PRIVATE_PREVIEW=1 SDS_FREE_CHECK_REPORT_DIR="$work/reports" SDS_PREVIEW_MAIL_OUTBOX="$work/out/preview-outbox.jsonl" ADMIN_EMAIL=desk@example.test)
cd "$repo"
# Cursor/bank cut 322afd7b was independently qualified on the original VM.
# This fresh workload qualifies v2 only and never reruns an older red input.
# Main v2 exact G owns its normal install/build/test gates, including the new tests.
git checkout --quiet --detach "$source_pin"
run v2-G 1800 "${appenv[@]}" "$node_bin" "$RELEASE_KIT_DIR/check.mjs"
[ ! -d release/out ] || cp -a release/out "$work/out/release"
run source-binding 300 "${appenv[@]}" AE14_PG_BIN="$(pg_config --bindir 2>/dev/null || true)" ROOT10940_CI_CATALOG=server/scripts/fixtures/root10940-approved-ci-packets "$node_bin" --test --test-concurrency=1 server/scripts/test-h147010-source-bound-ci-input.mjs server/scripts/test-h145010-measurement-runtime-pin.mjs
run legacy-and-ssrf 300 "${appenv[@]}" "$node_bin" --test --test-concurrency=1 server/scripts/test-free-tool-outcomes.js server/scripts/agent-readiness/probe-ssrf.test.js
run managed 1200 "${appenv[@]}" npm run build:managed-foundry
# Qualify only a command that actually succeeded on this exact source.
if "$node_bin" -e 'let r=require("fs").readFileSync(process.argv[1],"utf8").trim().split("\n").map(JSON.parse).find(x=>x.name==="managed");process.exit(r?.exit===0?0:1)' "$work/out/steps.jsonl"; then
 run host-qualification 30 "${appenv[@]}" "$node_bin" scripts/free-check-v2/qualify.mjs "$work/out" "$input/emitted-cursor-cut.json"
 run host-preflight 30 "$node_bin" "$RELEASE_KIT_DIR/host-build-profile.mjs" sds "$source_pin" "$work/out/host-qualification.json" "$work/out/saved-profile.json"
fi
# Numeric or fixture failures do not suppress independent real-site receiving.
run calibration-30 900 "${appenv[@]}" "$node_bin" scripts/free-check-v2/calibrate.mjs "$work/out/calibration"
preview_pid=''
stop_preview() { if [ -n "$preview_pid" ]; then kill -TERM -- "-$preview_pid" 2>/dev/null || true; wait "$preview_pid" 2>/dev/null || true; preview_pid=''; fi; }
trap stop_preview EXIT INT TERM
if [ -f client/dist/index.html ] && [ -n "$chrome" ]; then
 "${appenv[@]}" NODE_ENV=production SDS_V2_PREVIEW_BANK_FIXTURE=1 PORT=41832 GITHUB_SHA="$source_pin" setsid "$node_bin" scripts/free-check-v2/preview.mjs > "$work/out/preview.log" 2>&1 &
 preview_pid=$!
 ready=0
 for n in $(seq 1 40); do
  if ! kill -0 "$preview_pid" 2>/dev/null; then break; fi
  if "$node_bin" -e 'fetch("http://127.0.0.1:41832/api/health").then(r=>process.exit(r.ok?0:1),()=>process.exit(1))' >/dev/null 2>&1; then ready=1; break; fi
  sleep 1
 done
 if [ "$ready" = 1 ]; then
  run bank-on-G1 300 "${appenv[@]}" "$node_bin" "$RELEASE_KIT_DIR/visual.mjs" --no-build --url http://127.0.0.1:41832 --pages /care/buy?offer=keep_it_working
  [ ! -d release/out/visual ] || cp -a release/out/visual "$work/out/bank-on-G1"
  run browser-reports 300 "${appenv[@]}" "$node_bin" scripts/free-check-v2/browser.mjs "$work/out/browser" http://127.0.0.1:41832
 else
  printf '%s\n' '{"name":"preview-start","exit":1,"reason":"private preview did not become ready"}' >> "$work/out/steps.jsonl"
 fi
fi
stop_preview
trap - EXIT INT TERM
git status --porcelain --untracked-files=no > "$work/out/final-tracked-status.txt"
# No automatic rerun, source edits, waiver, deploy or live receipt relabelling.
"$node_bin" "$input/export.mjs" "$work" "$input" "$original_home"
