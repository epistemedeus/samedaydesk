#!/usr/bin/env python3
"""Create a private 1.4.7 review candidate; never change a public URL or archive.

This is a single patch to frozen 1.4.5, not a re-overlay of a moving checkout.
The regular overlay builder also copies the repaired public CLI from source.
"""
from pathlib import Path
import hashlib
import json
import subprocess
import tempfile

OWN = Path(__file__).resolve().parent
ROOT = OWN.parents[2]
OUT = OWN / 'candidate'
TMP = Path('/tmp/h21/runtime-tmp')
BASE = ROOT / 'client/public/for-agents/useful-jobs/useful-jobs-1.4.5.tar.gz'
PIN = 'ea14851bd3ed091993acf91bda8430d2d9f621a96f11e8d4aa2b4efda0097e4e'
for source in ['server/paid-useful-jobs/release/bin/useful-jobs.mjs',
               str(OWN.relative_to(ROOT) / 'build-review-candidate.py'),
               str(OWN.relative_to(ROOT) / 'repair/public-cli.patch')]:
    committed = subprocess.check_output(['git', 'show', 'HEAD:' + source], cwd=ROOT)
    assert (ROOT / source).read_bytes() == committed, 'Commit repair source before building: ' + source
data = BASE.read_bytes()
assert len(data) == 5255012 and hashlib.sha256(data).hexdigest() == PIN
OUT.mkdir(exist_ok=True)
TMP.mkdir(parents=True, exist_ok=True)
with tempfile.TemporaryDirectory(dir=TMP, prefix='h21-build-') as tmp:
    tmp = Path(tmp)
    subprocess.run(['tar', '-xzf', str(BASE), '-C', str(tmp)], check=True)
    stage = tmp / 'useful-jobs-1.4.7'
    (tmp / 'useful-jobs-1.4.5').rename(stage)
    subprocess.run(['patch', '--batch', '--fuzz=0', '-p1', '-i', str(OWN / 'repair/public-cli.patch')], cwd=stage, check=True)
    assert (stage / 'bin/useful-jobs.mjs').read_bytes() == (ROOT / 'server/paid-useful-jobs/release/bin/useful-jobs.mjs').read_bytes()
    changed = ['bin/useful-jobs.mjs']
    for name in ['package.json', 'catalog.json', 'jobs-outcomes.json',
                 'client/public/for-agents/useful-jobs/catalog.json',
                 'client/public/for-agents/useful-jobs/jobs-outcomes.json']:
        path = stage / name
        record = json.loads(path.read_text())
        record['version'] = '1.4.7'
        path.write_text(json.dumps(record, indent=2) + '\n')
        changed.append(name)
    with (stage / 'README.md').open('a') as out:
        out.write('\n## H21 1.4.7 review candidate\n\n'
                  'Public M01 commands now use the packaged SDS publication rollback helper. PR51 retains its existing input-collision refusal and output directory selection. '
                  'Explicit output directories preserve caller files on handled publication failure and release scratch directories. '
                  'Publication is not crash-atomic. No hosted artifact retrieval or payment authority is added.\n'
                  'For the optional Postgres driver: `cd tools/managed-useful-jobs-order && npm ci --omit=dev --no-fund --no-audit`.\n')
    changed.append('README.md')
    target = tmp / 'useful-jobs-1.4.7.tar.gz'
    subprocess.run(['tar', '--sort=name', '--mtime=@0', '--owner=0', '--group=0', '--numeric-owner',
                    '-czf', str(target), '-C', str(tmp), stage.name], check=True)
    packed = target.read_bytes()
    dest = OUT / target.name
    if dest.exists():
        assert dest.read_bytes() == packed, 'Refuse overwriting different 1.4.7 candidate bytes'
    else:
        dest.write_bytes(packed)
    receipt = dict(schema='h21.review-candidate.v1', version='1.4.7', status='review-candidate', releaseDecision='../RELEASE-DECISION.md',
                   bytes=len(packed), sha256=hashlib.sha256(packed).hexdigest(),
                   base=dict(version='1.4.5', bytes=len(data), sha256=PIN,
                             overlaySource='5078eb9d220deb66bc4d50095038efc2e5b95faa',
                             packageCommit='7f9c1623d836aa761186b0ceba8dc98f1ea11fc4'),
                   repairSource='experiments/codex-window/h21-package-release-gate/repair/public-cli.patch',
                   repairCommit=subprocess.check_output(['git', 'rev-parse', 'HEAD'], cwd=ROOT, text=True).strip(),
                   repairCommitNote='Public CLI and build recipe committed before this archive was built.',
                   changedPaths=changed, purchaseAuthority=False, publicDiscoveryChanged=False)
    (OUT / 'useful-jobs-1.4.7.json').write_text(json.dumps(receipt, indent=2) + '\n')
    print(json.dumps(receipt))
