STOP inventory. You already have enough. EXECUTE writes now on this same parent session.

Real parent handle (do not invent): sessionId `01a08b8c-8e39-7c13-aeb7-ddfb9b159ba5`, model `grok-4.6`, effort `xhigh`, cwd `/workspace/experiments/s185-distribution-repair-package`.

Immediate required writes (no more S176 reading):
1. `native-cells/receipts/parent-start.json` with the REAL sessionId above + pin digests from `/tmp/s185-canonical-pins.json` and `/tmp/s185-pins/**`.
2. Copy vendors from pins into `vendor/{record05,record04,dist08,nl06}` (algorithms untouched).
3. Write thin `src/` composition + `bin/distribution-repair.mjs` reusing NL06/DIST08/Record04 — no second parser.
4. Examples: positive/partial/mismatch/next-run + two caller-shaped inputs.
5. Acceptance tests covering: two caller inputs, content-preserving rename, before/after route correction, nonmatching identity, incomplete catalog, missing record feed, malformed values, repeat with changed state — assert EXACT expected fields (not any status).
6. Archive + discovery + `/for-agents/distribution-repair` page (homepage untouched).
7. `RESULT.md` + compact receipts.

Quota is low. Prefer direct file writes over further exploration. Spawn at most 2 useful children only if they parallelize module vs tests. Leave parent resumable for S186.
