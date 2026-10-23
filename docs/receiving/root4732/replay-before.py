#!/usr/bin/env python3
"""Offline readback of retained receiving, including honest failed comparisons."""
import hashlib
import json
from collections import Counter
from pathlib import Path
import sys

manifest_path, before_path, base_root, output = map(Path, sys.argv[1:])
manifest_bytes = manifest_path.read_bytes()
manifest = json.loads(manifest_bytes)
packet = json.loads(before_path.read_bytes())
digest = lambda b: hashlib.sha256(b).hexdigest()
assert packet['manifest']['sha256'] == digest(manifest_bytes)
assert packet['source'] == manifest['source']
assert packet['hostedBuild'] == manifest['hostedBuild']
expected = {row['path']: row for row in manifest['rows']}
assert len(expected) == 352
assert len(packet['rows']) == 704
seen = set()
counts = Counter()
human = json.loads(Path('/home/ubuntu/root-sol-window100337/ROOT4740-HOSTED-HUMAN-BASELINE.json').read_bytes())
human_paths = {row['path'] for row in human['rows']}
for row in packet['rows']:
    key = row['role'], row['path']
    assert key not in seen
    seen.add(key)
    assert row['role'] in {'public-front-door', 'provider-origin'}
    exp = expected[row['path']]
    body_rel = Path(row['bodyFile'])
    assert not body_rel.is_absolute() and '..' not in body_rel.parts
    body = (before_path.parent / body_rel).read_bytes()
    local = (base_root / row['path']).read_bytes()
    assert len(local) == exp['bytes'] and digest(local) == exp['sha256']
    assert len(body) == row['bytes'] and digest(body) == row['sha256']
    assert row['directByteEqual'] == (body == local)
    assert row['allSocketsClosed'] == all(x['ownedSocketClosed'] for x in row['trace'])
    passed = (not row.get('error') and row['status'] == 200 and row['tls'] is True
              and row['noCookie'] is True and row['contentEncoding'] in {None, 'identity'}
              and row['peerMatches'] and row['allSocketsClosed']
              and len(body) == exp['bytes'] and digest(body) == exp['sha256'] and body == local)
    assert row['pass'] == passed
    counts[row['role'] + (':pass' if passed else ':fail')] += 1
    if row['path'] in human_paths:
        counts[row['role'] + (':human-pass' if passed else ':human-fail')] += 1
assert packet['createdSockets'] == packet['closedSockets'] == 704
assert packet['passed'] == all(r['pass'] for r in packet['rows'])
assert packet['rawByteEquality'] == all(r['directByteEqual'] for r in packet['rows'])
result = {'receiptIntegrityPassed': True, 'hostedBeforePassed': packet['passed'],
          'rowsReplayed': len(seen), 'counts': dict(counts), 'networkRequests': 0,
          'manifestSha256': digest(manifest_bytes), 'beforeSha256': digest(before_path.read_bytes())}
with output.open('x') as handle:
    json.dump(result, handle, indent=2)
    handle.write('\n')
print(json.dumps(result))
