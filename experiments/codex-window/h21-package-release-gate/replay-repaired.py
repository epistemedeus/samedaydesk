#!/usr/bin/env python3
"""Replay the exact immutable 1.4.7 bytes using H7's nine extracted-package gates.

Only artifact/version/pin/discovery paths and the PG port are rebound in the
temporary test copy. The discovery command is the public acquisition template
with the repaired archive's identity, served only from owned localhost.
"""
from pathlib import Path
import fcntl
import json
import os
import re
import socket
import subprocess
import tempfile

OWN = Path(__file__).resolve().parent
ROOT = OWN.parents[2]
TMP = Path('/tmp/h21/runtime-tmp')
EVIDENCE = OWN / 'evidence'
PIN = json.loads((OWN / 'candidate/useful-jobs-1.4.7.json').read_text())
ARCHIVE = OWN / 'candidate/useful-jobs-1.4.7.tar.gz'
env = dict(os.environ, TMPDIR=str(TMP), NODE_OPTIONS='--max-old-space-size=768',
           npm_config_cache=str(TMP / 'npm-cache'))
for key in ['NODE_PATH', 'W5_M01_ENGINE_ROOTS', 'VENDOR_COMMON_TEST_SOURCE']:
    env.pop(key, None)

with (TMP / 'test.lock').open('w') as lock:
    fcntl.flock(lock, fcntl.LOCK_EX)
    while True:
        with socket.socket() as sock:
            sock.bind(('127.0.0.1', 0))
            port = sock.getsockname()[1]
        if port != 55595 and f'.s.PGSQL.{port}' not in Path('/proc/net/unix').read_text():
            break
    original = json.loads((ROOT / 'client/public/discovery/useful-jobs.json').read_text())
    cold = original['coldStart'].replace('1.4.5', '1.4.7').replace(original['sha256'], PIN['sha256']).replace(str(original['bytes']), str(PIN['bytes']))
    discovery = dict(schema='h21.private-acquisition.v1', version='1.4.7', publicClaim=False,
                     bytes=PIN['bytes'], sha256=PIN['sha256'], purchaseAuthority=False,
                     archive={'path': '/for-agents/useful-jobs/useful-jobs-1.4.7.tar.gz'}, coldStart=cold)
    discovery_file = OWN / 'candidate/useful-jobs-1.4.7.discovery.json'
    discovery_file.write_text(json.dumps(discovery, indent=2) + '\n')
    rows = []
    with tempfile.TemporaryDirectory(dir=TMP, prefix='h21-repaired-') as scratch:
        scratch = Path(scratch)
        source = (ROOT / 'server/paid-useful-jobs/tests/packaged-145-execution.test.mjs').read_text()
        replacements = {
            'const root = fileURLToPath(new URL("../../../", import.meta.url));': 'const root = ' + json.dumps(str(ROOT) + '/') + ';',
            'const archive145 = join(root, "client/public/for-agents/useful-jobs/useful-jobs-1.4.5.tar.gz");': 'const archive145 = ' + json.dumps(str(ARCHIVE)) + ';',
            'const pin145 = JSON.parse(readFileSync(join(root, "client/public/for-agents/useful-jobs/useful-jobs-1.4.5.sha256.json"), "utf8"));': 'const pin145 = ' + json.dumps(PIN) + ';',
            'const discovery = JSON.parse(readFileSync(join(root, "client/public/discovery/useful-jobs.json"), "utf8"));': 'const discovery = JSON.parse(readFileSync(' + json.dumps(str(discovery_file)) + ', "utf8"));',
            'const payload = readFileSync(join(root, "client/public", discovery.archive.path.replace(/^\\//, "")));': 'const payload = readFileSync(archive145);',
        }
        for before, after in replacements.items():
            assert source.count(before) == 1, before
            source = source.replace(before, after)
        # Do not replace versions in embedded base provenance or receipt hashes.
        source = source.replace('"useful-jobs-1.4.5"', '"useful-jobs-1.4.7"')
        source = source.replace('discovery.version, "1.4.5"', 'discovery.version, "1.4.7"')
        source = source.replace('packaged 1.4.5 extracted bytes', 'packaged 1.4.7 extracted bytes')
        source = source.replace('"1.4.5 archive matches pin', '"1.4.7 archive matches pin')
        source = source.replace('"cold install of 1.4.5 extract', '"cold install of 1.4.7 extract')
        assert source.count('55595') == 3
        source = source.replace('55595', str(port))
        adapted = scratch / 'packaged-147.test.mjs'
        adapted.write_text(source)

        def run(name, test, extra=None):
            work = scratch / name
            work.mkdir()
            with (EVIDENCE / (name + '.tap')).open('w') as out:
                proc = subprocess.run(['node', '--test', '--test-reporter=tap', '--test-concurrency=1', str(test)], cwd=ROOT,
                    env=dict(env, TMPDIR=str(work), **(extra or {})), stdout=out, stderr=subprocess.STDOUT)
            tap = (EVIDENCE / (name + '.tap')).read_text()
            row = dict(pack=name, exitCode=proc.returncode)
            for key in ['tests', 'pass', 'fail', 'cancelled', 'skipped', 'todo']:
                values = re.findall(r'^# ' + key + r' (\d+)$', tap, re.M)
                if values:
                    row[key] = int(values[-1])
            rows.append(row)
            print(json.dumps(row), flush=True)

        print(json.dumps({'pgPort': port, 'archive': str(ARCHIVE)}), flush=True)
        run('packaged-147', adapted)
        subprocess.run(['tar', '-xzf', str(ARCHIVE), '-C', str(scratch)], check=True)
        kit = scratch / 'useful-jobs-1.4.7'
        run('vendor-temp-extracted-147', ROOT / 'server/paid-useful-jobs/tests/vendor-temp-lifecycle.test.mjs',
            {'VENDOR_COMMON_TEST_SOURCE': str(kit / 'lib/common.mjs')})
        run('real-interrupt-147', OWN / 'test/real-interrupt.test.mjs', {'H21_EXTRACTED_KIT': str(kit)})
    report = dict(schema='h21.repaired-replay.v1', repairSourceCommit=PIN['repairCommit'],
                  archive=ARCHIVE.name, bytes=PIN['bytes'], sha256=PIN['sha256'], pgPort=port,
                  checkoutHeadDuringReplay=subprocess.check_output(['git', 'rev-parse', 'HEAD'], cwd=ROOT, text=True).strip(),
                  harnessSource='experiments/codex-window/h21-package-release-gate/replay-repaired.py',
                  harnessNote='Harness and adapted-test recipe are recorded in the final gate commit; runtime source is repairSourceCommit.',
                  heapMiB=768, concurrency=1, lock=str(TMP / 'test.lock'), packs=rows)
    (EVIDENCE / 'repaired-replay.json').write_text(json.dumps(report, indent=2) + '\n')
    raise SystemExit(1 if any(row['exitCode'] or row.get('fail') or row.get('cancelled') for row in rows) else 0)
