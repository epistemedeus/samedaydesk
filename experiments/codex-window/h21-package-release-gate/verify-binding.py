#!/usr/bin/env python3
"""Bounded H7 source/public-command/candidate binding, no archive mutation."""
from pathlib import Path
import hashlib
import json
import subprocess
import tarfile

OWN = Path(__file__).resolve().parent
ROOT = OWN.parents[2]
SOURCE = '5078eb9d220deb66bc4d50095038efc2e5b95faa'
PUB = ROOT / 'client/public/for-agents/useful-jobs'


def files(path):
    with tarfile.open(path) as archive:
        return {m.name.split('/', 1)[1]: archive.extractfile(m).read()
                for m in archive.getmembers() if m.isfile()}


base = files(PUB / 'useful-jobs-1.4.5.tar.gz')
candidate = files(OWN / 'candidate/useful-jobs-1.4.7.tar.gz')
pin = json.loads((PUB / 'useful-jobs-1.4.5.sha256.json').read_text())
assert pin['sourceCommit'] == SOURCE


def source_matches(name, source_name):
    source = subprocess.check_output(['git', 'show', SOURCE + ':' + source_name], cwd=ROOT)
    assert base[name] == source, name


for name, digest in pin['sourceFiles'].items():
    source_matches(name, name)
    assert hashlib.sha256(base[name]).hexdigest() == digest

engines = {}
for job in ['lockfile-pin-delta', 'json-schema-webhook-drift', 'route-table-diff', 'page-change-offline-job']:
    prefix = f'engines/{job}/'
    names = [n for n in base if n.startswith(prefix)]
    for name in names:
        source_matches(name, f'tools/{job}/' + name[len(prefix):])
    engines[job] = len(names)

entries = ['bin/useful-jobs.mjs', 'lib/common.mjs', 'lib/owned-spawn.mjs'] + [
    f'apps/{job}/cli.mjs' for job in [*engines, 'vendor-budget-impact']]
for name in entries:
    source_matches(name, 'server/paid-useful-jobs/release/' + name)
assert set(base) == set(candidate), 'Unexpected candidate file additions/removals'
changed = sorted(name for name in base if base[name] != candidate[name])
assert candidate['bin/useful-jobs.mjs'] == (ROOT / 'server/paid-useful-jobs/release/bin/useful-jobs.mjs').read_bytes()
receipt = json.loads((OWN / 'candidate/useful-jobs-1.4.7.json').read_text())
assert changed == sorted(receipt['changedPaths']), changed
report = dict(schema='h21.source-command-binding.v1', sourceCommit=SOURCE,
              overlayEntries=len(pin['sourceFiles']), overlayMismatches=0,
              engineFiles=engines, engineMismatches=0,
              publicEntryFiles=entries, publicEntryMismatches=0,
              candidateChangedPaths=changed, candidateUnexpectedChanges=0, candidateCliMatchesReviewerSource=True,
              oldPublicEnginePins='Not locally available as Git objects; binding is to the supplied overlay source SHA, not an asserted replay of those historical refs.',
              commandRoutes={
                  'publicM01': 'catalog cli -> bin/useful-jobs.mjs -> apps/<id>/cli.mjs -> engines/<id>/bin',
                  'sdsM01': 'server/paid-useful-jobs/bin/cli.mjs -> wrapper -> M01 d01-adapter -> packaged engines/<id>',
                  'publicPR51': 'bin/useful-jobs.mjs -> apps/vendor-budget-impact/cli.mjs -> packaged vendor-pins',
                  'sdsPR51': 'wrapper -> nested immutable useful-jobs 1.0.0 archive; distinct from public 1.4.5 app semantics'},
              purchaseAuthority=False)
(OWN / 'evidence/source-command-binding.json').write_text(json.dumps(report, indent=2) + '\n')
print(json.dumps(report))
