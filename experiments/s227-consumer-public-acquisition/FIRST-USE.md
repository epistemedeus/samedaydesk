# First use: consumer evidence package (public archive)

Offline only. Node.js 22. No repository checkout. No `npm install`. No paid or network execution. Do not rebuild the archive.

Archive: `https://samedaydesk.com/kit/s178-consumer-repeat-kit.tgz`  
Bytes: `718948`  
SHA-256: `04e9b6f382eedd91ae27b0d0faa68abbee7c26a1f06f52e415cb5a5884dfe05d`

If the HTTP status is not 200, or the size or digest is wrong, do not extract and do not run the CLI.

## Obtain and verify

```bash
curl -fsSL -o s178-consumer-repeat-kit.tgz https://samedaydesk.com/kit/s178-consumer-repeat-kit.tgz
python3 -c "import hashlib,pathlib; p=pathlib.Path('s178-consumer-repeat-kit.tgz'); b=p.read_bytes(); assert len(b)==718948, len(b); h=hashlib.sha256(b).hexdigest(); assert h=='04e9b6f382eedd91ae27b0d0faa68abbee7c26a1f06f52e415cb5a5884dfe05d', h"
mkdir -p /tmp && tar -xzf s178-consumer-repeat-kit.tgz -C /tmp
cd /tmp/s178-consumer-repeat-kit
node bin/s178-cli.mjs list
```

## Labeled samples (not caller files)

Default `run` without `--in` uses the labeled positive example for that job.

```bash
node bin/s178-cli.mjs example release-brief --kind conflict
node bin/s178-cli.mjs run 07 --clock 2026-09-10T18:00:00.000Z
node bin/s178-cli.mjs run release-brief --clock 2026-09-10T18:00:00.000Z
```

`--clock` is required (operator ISO-8601). Do not invent time.

## Caller files

Copy your JSON to a file you own. The CLI does not overwrite it.

```bash
node bin/s178-cli.mjs run 07 --in ./caller-a.json --clock 2026-09-10T18:00:00.000Z
node bin/s178-cli.mjs run release-brief --in ./caller-b.json --clock 2026-09-10T18:00:00.000Z
```

## Changed-input repeat

Write `repeatInput` (or the full result) to a **new** file. Re-run with a changed caller file. Do not overwrite the first caller file.

```bash
node bin/s178-cli.mjs run release-brief --in ./caller-partial.json --clock 2026-09-10T18:00:00.000Z > ./repeat-note.json
node bin/s178-cli.mjs run release-brief --in ./caller-reconciled.json --clock 2026-09-10T18:00:00.000Z
```

## Decisions

`ok: true` means the runner completed honestly. It is not a pass claim. Local `CONSUMER-PROVENANCE.json` is integrity metadata, not an independent attestation. A local completion is not an actual customer delivery. Announced, shipped, and tested stay distinct.

| decision | meaning |
| --- | --- |
| pass | Valid positive outcome |
| partial | Incomplete but usable; inspect `repeatInput` |
| conflict | Contradictory sources; not a pass |
| fail | Negative / rejected outcome |
| invalid | Bad input / schema rejection |
| unsupported | Missing dependency or out of scope |
| unknown | Undetermined |
