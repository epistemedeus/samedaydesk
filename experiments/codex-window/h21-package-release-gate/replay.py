#!/usr/bin/env python3
"""H21 VM-only replay; no archive rebuild and no host dependency links.

The inherited 1.4.5 test fixes port 55595. Its temporary copy changes only
the repository root and that port (including its assertion/test title).
"""
import fcntl
import json
import os
from pathlib import Path
import re
import socket
import subprocess
import tempfile

OWN = Path(__file__).resolve().parent
ROOT = OWN.parents[2]
TMP = Path('/tmp/h21/runtime-tmp')
EVIDENCE = OWN / 'evidence'
TMP.mkdir(parents=True, exist_ok=True)
EVIDENCE.mkdir(exist_ok=True)
env = dict(os.environ, TMPDIR=str(TMP), NODE_OPTIONS='--max-old-space-size=768',
           npm_config_cache=str(TMP / 'npm-cache'))
for key in ['NODE_PATH', 'W5_M01_ENGINE_ROOTS', 'VENDOR_COMMON_TEST_SOURCE']:
    env.pop(key, None)


def unused_port():
    # Include Unix PG sockets, since the package cluster disables TCP.
    unix = Path('/proc/net/unix').read_text()
    for _ in range(100):
        with socket.socket() as sock:
            sock.bind(('127.0.0.1', 0))
            port = sock.getsockname()[1]
        if port != 55595 and f'.s.PGSQL.{port}' not in unix:
            return port
    raise RuntimeError('No unused PG port')


with (TMP / 'test.lock').open('w') as lock:
    fcntl.flock(lock, fcntl.LOCK_EX)
    try:
        port = unused_port()
        socket_error = None
    except PermissionError as error:
        port = 55421  # A label only: no PG/socket test runs in this mode.
        socket_error = str(error)
    results = []
    with tempfile.TemporaryDirectory(prefix='h21-replay-', dir=TMP) as scratch:
        scratch = Path(scratch)
        # Each test pack gets an owned TMPDIR; remove its residual output dirs.
        def run(name, path, extra_env=None, skip_pattern=None):
            work = scratch / name
            work.mkdir()
            cmd = ['node', '--test', '--test-reporter=tap', '--test-concurrency=1']
            if skip_pattern:
                cmd += ['--test-skip-pattern', skip_pattern]
            cmd += [str(path)]
            with (EVIDENCE / (name + '.tap')).open('w') as out:
                proc = subprocess.run(cmd, cwd=ROOT, env=dict(env, TMPDIR=str(work), **(extra_env or {})),
                                      stdout=out, stderr=subprocess.STDOUT)
            tap = (EVIDENCE / (name + '.tap')).read_text()
            counts = {key: int(re.findall(r'^# ' + key + r' (\d+)$', tap, re.M)[-1])
                      for key in ['tests', 'pass', 'fail', 'cancelled', 'skipped', 'todo']
                      if re.findall(r'^# ' + key + r' (\d+)$', tap, re.M)}
            row = dict(pack=name, source=str(path.relative_to(ROOT)) if path.is_relative_to(ROOT) else path.name,
                       exitCode=proc.returncode, **counts)
            results.append(row)
            print(json.dumps(row), flush=True)

        inherited = ROOT / 'server/paid-useful-jobs/tests/packaged-145-execution.test.mjs'
        text = inherited.read_text()
        old_root = 'const root = fileURLToPath(new URL("../../../", import.meta.url));'
        assert text.count(old_root) == 1 and text.count('55595') == 3
        text = text.replace(old_root, 'const root = ' + json.dumps(str(ROOT) + '/') + ';')
        text = text.replace('55595', str(port))
        adapted = scratch / inherited.name
        adapted.write_text(text)
        print(json.dumps(dict(pgPort=port, node=subprocess.check_output(['node', '--version'], text=True).strip())), flush=True)
        skip = 'cold install|HTTP principal|cold-installed|portable consumer' if socket_error else None
        run('packaged-145', adapted, skip_pattern=skip)
        run('packaged-144-negative', ROOT / 'server/paid-useful-jobs/tests/packaged-144-execution.test.mjs', skip_pattern=skip)

        # Exercise the exact public CLI common.mjs bytes, not only in-tree source.
        subprocess.run(['tar', '-xzf', str(ROOT / 'client/public/for-agents/useful-jobs/useful-jobs-1.4.5.tar.gz'),
                        '-C', str(scratch)], check=True)
        run('vendor-temp-extracted-145', ROOT / 'server/paid-useful-jobs/tests/vendor-temp-lifecycle.test.mjs',
            {'VENDOR_COMMON_TEST_SOURCE': str(scratch / 'useful-jobs-1.4.5/lib/common.mjs')})
        for name, path in [
            ('publication-source', 'server/paid-useful-jobs/test/publication-rollback.test.mjs'),
            ('interrupt-source', 'tools/managed-useful-jobs-order/test/interrupt-before-complete.test.mjs'),
            ('lockfile-source', 'experiments/wave5/m01/test/invoke-lockfile.test.mjs'),
        ]:
            run(name, ROOT / path)
        if not socket_error:
            run('http-consumer-source', ROOT / 'experiments/wave5/d14/test/http-consumer.test.mjs')
    report = dict(schema='h21.replay.v1', sourceCommit=subprocess.check_output(['git', 'rev-parse', 'HEAD'], cwd=ROOT, text=True).strip(),
                  pgPort=port if not socket_error else None, socketPreflightError=socket_error,
                  incomplete=['HTTP cold acquire/principal/portable', 'real Postgres', 'HTTP consumer pack'] if socket_error else [],
                  tmpdir=str(TMP), lock=str(TMP / 'test.lock'), heapMiB=768, concurrency=1,
                  adaptation='Temporary 1.4.5 test copy: repository root + unused PG port only; assertions otherwise unchanged.', packs=results)
    (EVIDENCE / 'replay.json').write_text(json.dumps(report, indent=2) + '\n')
    raise SystemExit(1 if any(r['exitCode'] or r.get('fail') or r.get('cancelled') for r in results) else 2 if socket_error else 0)
