# RECEIPT — W5-D10 Co04 independent replay harness

**Date:** 11 September 2026
**Repo:** `epistemedeus/samedaydesk`
**Branch:** `cursor/w5-d10-co04-independent-replay-harness-with-disjoint-output-locations-0c47`
**Starting ref:** `ebc71220e034dd28f29d105335c0161a3838831d`
**Draft PR:** https://github.com/epistemedeus/samedaydesk/pull/81
**Secondary pin (read-only):** SDS PR52 `aeef964fa188443078958d9d6d393afae1d542ee`
**Owned paths:** `tools/output-replay-harness/`, `experiments/wave5/d10/RECEIPT.md`
**Integration owner:** W5-D01
**Model:** Cursor Grok 4.6 xhigh (`cursor-grok-4.6-xhigh`). pstack plugin cache present (47 skills); no extra Cloud agents.

## Outcome

Co04 replay harness requires disjoint `--out-a` / `--out-b` locations and
captures catalog bytes immediately after each run. A/B directory alias and
post-run mutation cannot erase comparison evidence.

## Current-source findings (reproduced)

At `ebc71220`:

1. Same-path and symlink `--out-a`/`--out-b` with a changed non-SAMPLE
   `after.yaml` reported `classification: identical` and
   `identityVerified: true` while engine `digestA !== digestB`. The pinned
   useful-jobs CLI relocates occupied out-dirs; the harness still hashed the
   caller paths, so A was compared to A.
2. Mutating `out-a` after run A turned a same-input replay into
   `identity-break` because comparison re-read live files.
3. Markdown body change with JSON identity holding classified as
   `labelled-drift`. Timestamp stripping is not proof of equivalent results.

Overlapping directories are a **valid refusal** (`overlapping-output-dirs`),
not `engine-refused`.

## Tests

```bash
cd tools/output-replay-harness
node --test test/*.test.mjs
```

**PASS** — 21 tests, 0 fail, 0 skipped. Node v22.14.0. Dependencies: Node >= 22,
`tar`, in-repo archive. No Postgres (not on this path). Local HTTP archive pin
was executed. No skipped gate.

Public CLI: same-path and symlink alias refuse `overlapping-output-dirs`.
Relative `out` vs `out/.` refuses via `assertDisjointOutputDirs`. Same-input
replay stays `identityVerified` after live `out-a` mutation. Markdown body
change is `identity-break`; generatedAt-only JSON plus markdown timestamps
remain `labelled-drift`.

## Bindings (tested version, remaining)

- **Tested engines:** PR51 useful-jobs CLI from in-repo archive
  (`6bf650391fad4fa658a7959e9717fc5499faf4caffa0a39f67c6c2ee033bdb51`).
- **Not claimed:** D01 wrapper behavior. F08 PR52 was read; not consumed.
- **Terms:** isolated I01 `hashTermsVersion` pin. Do not force unlike terms
  hashes equal. Integer `termsVersion` is not a public claim key.
- **Remaining:** D01 may later select a shared execution contract. This
  package does not implement a second runner.

## Limits

No production deploy, spend, payout, or messages. No homepage/root rewrite.
Postgres is not required here and was not skipped-as-pass.
