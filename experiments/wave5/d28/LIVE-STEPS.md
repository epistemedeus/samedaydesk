# Live steps remaining for Root / journey owner

This worker did not deploy, spend, pay out, or message anyone.

## Already exported (owner QA, this branch)

1. Pack SDS52 `vendor-budget-impact` with caller before/after.
2. Read back archive identity `6bf650391fad4fa658a7959e9717fc5499faf4caffa0a39f67c6c2ee033bdb51` / 2522418 bytes.
3. Measure a second job with `after-nochange.json` (disjoint `return/` dir).
4. Serve packet JSON on loopback. `/deployed` reports `artifact: absent`.

## Remaining before a field return signal can be non-absent

1. D01 `execution.v1` and Co17 `verify-complete` are on this composition branch; Co03 binder is still off-tree.
2. Publish a real public artifact (catalog route, not homepage rewrite). Record origin + archive sha256 in an evidence file.
3. Run D25/D27 recruited or independent runtime with the caller's own input.
4. If a second paid/useful job is observed, write evidence:

```json
{
  "schema": "samedaydesk.wave5.d28.live-return-evidence.v1",
  "label": "independent",
  "jobId": "vendor-budget-impact",
  "receiptSha256": "<64 hex of that run's receipt.json>",
  "sold": false,
  "invented": false,
  "deployedArtifact": "<sha256 or URL of the deployed kit>",
  "returnSignal": "observed",
  "observedAt": "<ISO-8601>"
}
```

Then:

```bash
node experiments/wave5/d28/bin/cli.mjs readback --packet <dir> --evidence <file>
```

Invented customers (`invented: true`) are rejected. Missing evidence stays `liveReturn: absent`.

No facilitator, live settle, or catalog price change is in this kit.
