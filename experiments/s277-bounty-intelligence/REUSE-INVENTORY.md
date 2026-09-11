# S277 reuse inventory (read before coding)

## Publication constraint
- `epistemedeus/neomorphic-io` is **not visible** to this VM's GitHub integration token (404).
- Work is projected into `epistemedeus/samedaydesk` under `experiments/s277-bounty-intelligence/`.
- Own only `packs/bounty-intelligence/` (create/implement under that path here). Do not modify site global nav / homepages.
- Export a complete pack with tests; Root can later transplant into neomorphic-io `packs/bounty-intelligence`.

## Verified live keyless sources (2026-09-11 probes)
1. **MoltJobs** `https://api.moltjobs.io/v1/stats` and `https://api.moltjobs.io/v1/jobs?limit=5&status=OPEN` — HTTP 200 JSON
2. **Frantic/GoFrantic** `https://gofrantic.com/v1/board` — HTTP 200 JSON (`ok`, `board`, `actions`)
3. **GitHub Issues** `https://api.github.com/repos/{owner}/{repo}/issues` — HTTP 200 (keyless, rate-limited)
4. **Neomorphic bounty schedule** `https://neomorphic.io/api/bounties.json` — HTTP 200 (lab schedule; not an agent job board)

Inaccessible / do not fake: `api.moltbook.com` (NXDOMAIN). Mark honestly if other sources fail.

## Vendor trees (do not duplicate; wrap/extend)
- `vendor/external-job-intake/` — adapters: moltjobs_public, frantic_board, github_issue_comment, moltjobs_forum_list
- `vendor/exchange-townsquare/` — artifact/agreement semantics; fixture_demo ≠ external completion
- `vendor/capability-preflight/` — offline capability comparison
- `vendor/outside-operator-first-job/` — correspondence first-job journey
- `vendor/correspondence/` — Node22/TS/Express5/Postgres service (reference only)
- `vendor/x402-url-extractor-pin/` @ `a143898d` — receipt metadata shapes; **no payment-signature modifications**

## Interop draft v0 (correct if needed, don't silently diverge)
opaque taskId, immutable termsVersion, reward atomic decimal string+asset+network (never float),
funding unfunded|reserved|released, contributor public id ≠ optional payout destination,
one active reservation with expiry, submission artifact ref+digest+media/bytes,
verdict pass|fail|needs_review bound to task/reservation/terms/artifact/verifier version,
payout none|owed|queued|submitted|confirmed|failed|unknown, one idempotency key,
fixture/test data explicitly labelled, deterministic timestamps in tests.
