# Live steps remaining for Root / journey owner

This worker did not deploy, spend, pay out, or message anyone.

## Already exported (owner QA, this branch)

1. Pack SDS52 `vendor-budget-impact` with caller before/after.
2. Read back archive identity `6bf650391fad4fa658a7959e9717fc5499faf4caffa0a39f67c6c2ee033bdb51` / 2522418 bytes.
3. Measure a second job with `after-nochange.json` (disjoint `return/` dir).
4. Serve packet JSON on loopback. `/deployed` reports `artifact: absent`.

## Remaining before a field return signal can be non-absent

1. Bind W5-D01 `samedaydesk.paid-useful-jobs.execution.v1` at observed `6bed72dd22a396134aa5c957933b42c3a5746698` (PR74) when Root selects it. Re-run this kit against that CLI; do not assume SDS52 `ok` equals D01 `ok`.
2. Optionally consume Co03 `tools/repeat-job-binder/` `7c55738cc5730985b709282af6c24e10f0a8442f` and Co17 `verify-complete` `58cba6324c1d9793d344bc13154b8b2380e8166f` from their branches. They are not on this tree.
3. Publish a real public artifact (catalog route, not homepage rewrite). Record origin + archive sha256 in an evidence file.
4. Run D25/D27 recruited or independent runtime with the caller's own input.
5. If a second paid/useful job is observed, write evidence:

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
