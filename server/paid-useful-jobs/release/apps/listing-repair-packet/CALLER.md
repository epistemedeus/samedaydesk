# Listing Repair Packet

Offline job: turn a listing + route snapshot input into a source-linked owner
repair packet.

## Required inputs

| Flag | Meaning |
| --- | --- |
| `--input` | Path to a distribution-repair input JSON (listing identity + route baseline/current pair) |

Missing `--input` refuses closed. Use `--example` only for the labeled fixture.

## Outputs

Written under `--out-dir` (or a fresh unique directory under `out/listing-repair-packet/`):

| File | Contents |
| --- | --- |
| `repair-packet.json` | Machine artifact: status, owner actions, gaps, digest |
| `repair-packet.md` | Human-readable owner action list |

## Run

```bash
# Labeled sample (not a customer run)
node bin/useful-jobs.mjs run listing-repair-packet --example

# Or call the app directly
node apps/listing-repair-packet/cli.mjs --example

# Your own input
node bin/useful-jobs.mjs run listing-repair-packet \
  --input ./yours/listing-input.json \
  --out-dir ./out/listing-repair
```

## Two distinct labeled callers

| Sample | Path | Distinct signal |
| --- | --- | --- |
| caller-alpha | `samples/listing/caller-alpha.json` | Multi-route public listing deltas |
| caller-beta | `samples/listing/caller-beta.json` | API redirect-only pair (`/api/v1`) |

Companion `*.SAMPLE.txt` files mark both as fixtures. Digests and owner-action
lists differ between the two.

Edge fixtures (optional):

- `samples/listing/partial.json` - incomplete capture -> **partial** (non-final)
- `samples/listing/mismatch.json` - identity join failure -> **refused**

## Status honesty

| Status | Meaning |
| --- | --- |
| `actionable` | Complete evidence on a supported provider yielded owner repair actions |
| `partial` | Incomplete/partial/unknown evidence; packet is **non-final** |
| `refused` | Mismatch, refused join, or unsupported provider; do not invent identity |
| `informational` | Residual non-actionable outcome |

Rules:

- Partial or incomplete evidence stays non-final for every `identity.provider`,
  including unknown names. Incomplete current capture cannot prove global
  unlisting or disappearance.
- Supported join providers are `grexal` and `agensi`. A declared non-empty
  provider outside that set is **refused** (`unsupported-provider`) when capture
  is complete. It is not treated as a grexal diagnosis.
- Missing required identity stays **partial** / unknown. Identity join failure
  stays **refused**.
- Engine `ok:true` is not itself actionable evidence.
- This job never claims global unlisting or universal removal.
- Samples and `--example` are labeled fixtures, not customers or market demand.
- Offline diagnosis only; no purchase authority and no live network requirement
  on the default path.
