# S214 — Release composition + end-to-end proof (same Heavy parent)

You are the **same** authenticated native Grok Heavy parent.
Session: `01a08b8c-8e39-7c13-aeb7-ddfb9b159ba5`
Model: `grok-4.6` · effort: `xhigh`
Cursor = transport/Git/collection. **You** own native proof work, small fixes, tests, push.

## Freezes

- Branch (checked out): `codex/s214-record-distribution-release-20260910`
- Base main: `2b80f38a4e5ec5f080d1764de7c539af63190012`
- S206 terminal: `0f9771cff46c939f0e191bf80b7716feff4e62eb`
- S206 product: `dcc78f31097b3d3a6e23778c5fe77b5af4cc88b1`
- Cash $0. No merge/deploy. No paid calls / overage / bankedreset / new auth.
- Do **not** change Pulse / homepage / payment / prices.
- Do **not** rebuild tarballs during the clean consumer gate (use committed kits as-is).
- No report-only reviewer fleet. Fix small discovered issues directly with tests.

## Already done by Cursor

Product-only tree from S206 tip onto main: s134/s163/s176/s185 packages, client pages/discovery/kits, SPA shells, browser-smoke, compact S198/S206 RESULT trail, caller-both-kits test. Raw native transcripts and orchestration prompt/receipt forests excluded. Compact `experiments/s214-record-distribution-release/PROVENANCE.md` present.

## Your job — actual usable release proof

### Runtime

Use **Node 22** from nvm (`/home/ubuntu/.nvm/versions/node/v22.22.2/bin` on PATH). Historical default-Node env gaps are **not** acceptable proof for changed startup.

### Gates (run actually)

1. **Owning build** + **hosted server startup** + **route gates** under Node 22.
2. **Desktop / 390 / 320** actual inner-page checks for `/for-agents/record-repeat` and `/for-agents/distribution-repair` (and downloads if page links kits).
3. **Clean consumer** (do **not** rebuild tarballs here):
   - Extract both committed kits from `client/public/kit/` into a fresh directory **outside** the checkout.
   - Two distinct caller-supplied records per kit.
   - Literal next-run continuation.
   - Existing regressions: **F1** missing-path (no examples fallback), **F2** alias + exclusive write, **F3** null/scalar structured refuse.
   - Confirm `fixtureDerived` acquisition remains visibly synthetic in downstream diagnosis.
4. Focused package suites as needed: s134 / s163 / s176 / s185 / caller-both-kits.
5. **Pulse**: if Pulse source/deps/config are identical to main, do **not** re-run PG regressions — explicitly verify unchanged ownership vs `origin/main` and record that. Do not mask failures.

### Metadata correspondence

Compare download metadata / discovery / machineEntry / archive receipts / **actual kit bytes** and archive source-content correspondence to this product tree. Include exact base / product / head after your commit in RESULT.

### Optional small fix

If caller JSON object `rows`/`items` wrong-shaped currently **throws**, reproduce first; only then normalize to existing structured refusal. No speculative stronger parser.

### Children

You may spawn truly disjoint native children for independent browser / clean-consumer work if capacity allows. Do **not** duplicate source writers. Record genuine process/VM distinction and observed capacity at job boundaries via the **existing** meter — no new timer, no artificial stress.

## Deliverable

- Compact `experiments/s214-record-distribution-release/RESULT.md` + one receipts JSON (session, model, effort, Node version, commands, kit digests, Pulse ownership note, remaining release limits).
- **One** product+RESULT commit (or product then RESULT without stamp-loop). Push branch.
- Open an **actual** feature PR if `gh pr create` works; a compare URL is **not** a PR.
- Do not stamp RESULT with its own resulting commit id.

Terminal head after push is what Cursor will collect.
