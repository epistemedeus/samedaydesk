# RECEIPT — W4-commerce-15 job artifact provenance export

Package: `tools/job-artifact-export/`
Repo: `epistemedeus/samedaydesk`
Starting ref: `main` `5b97d1b02e786acd1895cfa1508087ae3f7a1545` (PR51 useful-jobs public integration)
Feature branch: `codex/w4-commerce-15-20260911`
HEAD: `89c8b03a5b858cedadef812215fff03825fcebcb`
Integration owner: Root

## What shipped

CLI `export --in-dir --out` packs a completed useful-jobs out-dir into zip + JSONL with per-file `sha256:`, catalog `jobId`, useful-jobs archive sha256, engine pin, and SAMPLE/sale labels. SAMPLE cannot be marked customer-delivery. 8MiB per-file cap. Empty in-dir refused.

Not result-reuse (no task-memory observations). Not a protocol. Nonsettling prototype: `customerDelivery: false`.

## Pins consumed (read-only)

| Input | Location | SHA / note |
| --- | --- | --- |
| useful-jobs archive | `client/public/for-agents/useful-jobs/useful-jobs-1.0.0.tar.gz` | `6bf650391fad4fa658a7959e9717fc5499faf4caffa0a39f67c6c2ee033bdb51` (verified on disk) |
| catalog | `client/public/for-agents/useful-jobs/catalog.json` | job ids + outputs |
| kit | `client/src/data/usefulJobsKit.json` | engine pin fields |
| result-reuse | `tools/result-reuse/` | boundary only: this pack does not emit observations |
| I01 hash terms | Neo PR54 `819fa637ecf5e5177c84efc16fcaa18d57017631` `packs/funded-task-terms/src/hash.mjs` | isolated vendor pin, MIT preserved |

Original F01 integer `termsVersion` is not used. Hasher ignores that key and publishes `sha256:` + 64 hex.

## Caller journey (local-runtime)

```bash
# from epistemedeus/samedaydesk at this branch
work=$(mktemp -d)
tar -xzf client/public/for-agents/useful-jobs/useful-jobs-1.0.0.tar.gz -C "$work"
kit="$work/useful-jobs-1.0.0"
out=$(mktemp -d)
node "$kit/bin/useful-jobs.mjs" run feed-agenda \
  --before samples/feed/a/before.xml \
  --after samples/feed/a/after.xml \
  --out-dir "$out"
export_dir=$(mktemp -d)
node tools/job-artifact-export/bin/export.mjs export --in-dir "$out" --out "$export_dir"
unzip -l "$export_dir/job-artifacts.zip"
```

Observed on this VM: useful-jobs returned `ok=true` `appId=feed-agenda` `status=informational` (samples/feed/a before/after are byte-identical). Export labeled `SAMPLE` because caller paths are under `samples/` and ICS contains `SAMPLE fixture`. Unzipped `agenda.json` / `agenda.ics` sha256 matched the out-dir bytes. `manifest.json` carried `jobId=feed-agenda` and `archiveSha256=sha256:6bf650391fad4fa658a7959e9717fc5499faf4caffa0a39f67c6c2ee033bdb51`.

## Tests executed

```bash
node --test tools/job-artifact-export/test/*.test.mjs
```

Node v22.14.0. **11 tests, 11 pass, 0 fail** at `89c8b03a5b858cedadef812215fff03825fcebcb`.

Dependencies: Node >= 22, `tar`, `unzip`. No extra npm packages. No Postgres listener (none required). No live HTTP.

| Class | Result |
| --- | --- |
| local-runtime feed-agenda a → zip/jsonl/unzip sha256 | pass |
| local-runtime SAMPLE + `--as customer-delivery` | pass (refused `sample-not-customer-delivery`) |
| fixture SAMPLE + customer-delivery | pass |
| fixture SAMPLE `--label sale` | pass (refused `sample-not-sale`) |
| fixture file over 8MiB | pass (`file-over-size-cap`) |
| fixture empty in-dir | pass (`empty-in-dir`) |
| fixture sale out-dir | pass (`label=sale`, still not customer-delivery) |
| I01 golden terms hash + integer reject | pass |

## Seeded failures

1. SAMPLE out-dir exported as customer (`--as customer-delivery`) → `sample-not-customer-delivery`.
2. File over cap → `file-over-size-cap` (8388609 bytes, cap 8388608).
3. Empty in-dir → `empty-in-dir`.

## Honestly untested

- Live customer job out-dir (no external customer account; sale path is a constructed fixture).
- HTTP server or real Postgres (this CLI has no network/SQL surface).
- The other five useful-jobs engines beyond feed-agenda local-runtime (catalog detection is shared; only feed-agenda was run as the named journey).
- Injecting the live Neo pack instead of the pinned hasher files.
- Earned-work reservation/claim/payout (I01 kernel stays on Neo; not copied).
- Public SameDayDesk homepage, F08 wrappers, W2/W3/H trees (out of ownedPaths).

## Next integration owner

Root. Bind hash adapter to Neo PR54 when integrating money-path artifact digests. Do not merge this branch as a sale or deploy.

## Skill setup (not a product diff)

cursor/plugins@main `f5bdd6826fd0a0d9cbc4347134c3a74a200b9d9d` swarm skill used locally as Frame / independent ownership / aggregate / test-map inside this one assignment. Not committed.
