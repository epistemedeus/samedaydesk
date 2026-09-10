#!/usr/bin/env python3
"""Build the self-contained offline skill; never upload it."""
from pathlib import Path
import argparse, zipfile
ROOT = Path(__file__).resolve().parents[1]
FILES = ['DEMO.md', 'LICENSE', 'PROVENANCE.md', 'README.md', 'SKILL.md', 'access-handoff.json', 'bin/build-skill-zip.py', 'bin/checklist.mjs', 'bin/provenance.mjs', 'bin/validate-descriptor.mjs', 'fixtures/free/README.md', 'fixtures/free/SKILL.md', 'fixtures/paid/ACCEPTANCE.md', 'fixtures/paid/DELIVERY.md', 'fixtures/paid/SKILL.md', 'lib/json-schema.mjs', 'lib/validate-package.mjs', 'listing-checklist.json', 'offer-descriptor.json', 'offer-descriptor.schema.json', 'package.json', 'test/checklist.test.mjs', 'test/provenance.test.mjs', 'test/release.test.mjs', 'test/validate.test.mjs']
parser = argparse.ArgumentParser()
parser.add_argument('--out', default=str(ROOT / 'dist/offline-package-provenance.zip'))
args = parser.parse_args()
out = Path(args.out)
entries = []
for name in sorted(FILES):
    p = ROOT / name
    if p.is_symlink() or any(q.is_symlink() for q in p.parents if q != ROOT.parent):
        raise SystemExit('Symlink in package')
    if not p.is_file() or p.stat().st_size > 1024*1024:
        raise SystemExit('Missing or oversized package file')
    entries.append((name, p.read_bytes()))
if sum(len(data) for _, data in entries) > 50_000_000:
    raise SystemExit('Package exceeds 50 MB')
out.parent.mkdir(parents=True, exist_ok=True)
with out.open('xb') as f:
    with zipfile.ZipFile(f, 'w', compression=zipfile.ZIP_DEFLATED, compresslevel=9) as z:
        for name, data in entries:
            info = zipfile.ZipInfo('offline-package-provenance/' + name, (2026, 9, 10, 0, 0, 0))
            info.compress_type = zipfile.ZIP_DEFLATED
            info.external_attr = 0o100644 << 16
            z.writestr(info, data)
print(out)
