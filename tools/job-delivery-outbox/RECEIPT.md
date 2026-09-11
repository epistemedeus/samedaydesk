# RECEIPT — W5-D06 Co09 delivery outbox

**Repo:** `epistemedeus/samedaydesk`
**Branch:** `cursor/w5-d06-co09-delivery-outbox-with-precise-destination-and-terms-mapping-4f5e`
**Starting ref:** `828d8942fb1631aba92a9116dc9fbde0ee1dd258`
**Owned paths:** `tools/job-delivery-outbox/`, `experiments/wave5/d06/RECEIPT.md`
**Integration owner:** W5-D01
**Stop:** tested isolated outbox + draft PR; no daemon, deploy, or spend

## What

Reproduced REVIEW-INTEGRATION Co09 predictions at Co09 head `828d8942`. Origin-only destination identity, trusted asserted output digest, invented kit pin, and path/digest-blind acks were real. Smallest fix: destination is origin+path, listed-output digest is recomputed, engine archive identity is required, ack binds eventId+path+digest, lost HTTP stays `unknown`. Outbox terms.v1 is an explicit mapping from SDS52 receipt.v1. Unlike schema hashes are not forced equal. Empty HTTP 200 ack body was already not completion (`failed`); preserved.

## Pins tested

| Item | Value |
| --- | --- |
| Co09 starting source | `828d8942fb1631aba92a9116dc9fbde0ee1dd258` |
| SDS52 wrapper (current) | `aeef964fa188443078958d9d6d393afae1d542ee` |
| Historical F08 (not official) | `bae3e7cd5034b21019fb272a99d88db964b831ee` |
| useful-jobs 1.0.0 | sha256 `6bf650391fad4fa658a7959e9717fc5499faf4caffa0a39f67c6c2ee033bdb51`, 2522418 B |
| Terms mapping | `samedaydesk.paid-useful-jobs.receipt.v1->job-delivery-outbox.terms.v1` v1 |
| W5-D01 result contract | not published; remaining binding |

## Commands

```bash
cd tools/job-delivery-outbox && npm install
node --test --test-concurrency=1 test/*.test.mjs
```

pstack: relevant skills read (`principle-prove-it-works`, `principle-test-behavior-not-implementation`, `tdd`, `principle-boundary-discipline`, `principle-make-operations-idempotent`, `principle-subtract-before-you-add`, `principle-fix-root-causes`, `principle-laziness-protocol`, `no-comments`, `blast-radius`, `setup-pstack`). Actual model: Cursor Grok 4.6 xhigh (`cursor-grok-4.6-xhigh`). No extra Cloud agents. `~/.cursor/rules/pstack-models.mdc` not present; parent run used included Grok 4.6 xhigh.

## Honestly untested / remaining binding

- Hosted / non-loopback webhooks
- W5-D01 result contract (consume SDS52 until D01 publishes)
- I01 kernel terms hash (different schema; not imported)
- Concurrent writers beyond the file lock
- IPv6 `::1` two-process path (allowed by the URL guard; tests used `127.0.0.1`)
