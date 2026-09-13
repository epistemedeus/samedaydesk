# H7-DELIVERY ownership map (controller seed)

Controller Cursor agentId `bc-ec55ab26-6e23-4562-9c7a-649331bdba1f` is launcher/collector only.
Native parent owns all implementation/tests. Do not resume H6D session `01a09456-c82b-7b41-ad58-e5557da52ed3`.

## Runtime pin (do not rebind to 1.4.1 or follow main)

- Repo: `epistemedeus/samedaydesk`
- Branch pin: `codex/vendor-temp-lifecycle-20260912`
- HEAD: `8a811bbadba7edc6c926b319b0839cd2f01e5896` (1.4.3 unpublished; cooperative signal cleanup)
- Previous candidate (ancestor, not release-ready): `6007fcfa27074f9a594248e47296f1afa4f8385d`
- Fix: `e122c26657977ce3a2d41642095e999db1125b53` (duplicate application signal-handler invocation)
- Based on: `30345f69f16aca93bb95511ee4da62975c98cc04`
- Feature branch: `codex/h7-delivery-20260912`
- Worktree: `/tmp/h7/wt` (disjoint from `/tmp/h6d/wt`)

Old package archives are immutable. Do not edit `server/paid-useful-jobs` core, release archive/builder, CW63 policy, or `experiments/wave6/`.

## Exclusive write paths (non-overlap)

| Slice | Handoff SHA | Writable |
| --- | --- | --- |
| CW60 | `226103e3208cf3533a4aa8fba76d69e4c9e00a50` | `tools/job-artifact-export/` `tools/job-delivery-outbox/` `experiments/codex-window/cw60-delivery-export-integration/` |
| CW61 | `e813ecd01b19ea426ec0878554c89a13ef891711` | `tools/repeat-job-binder/` `tools/output-replay-harness/` `experiments/codex-window/cw61-repeat-replay-integration/` |
| CW62 | `77543d4b37702c8a154d89805f86ad19e3d5769f` | `tools/job-request-desk/` `tools/paid-batch-reconciler/` `tools/buyer-value-ledger/` `experiments/codex-window/cw62-batch-value-integration/` |
| CW65 | `30d90a37b26f005d9dd298f1feaa969c2f2ec3d3` | `experiments/codex-window/cw65-delivery-adversarial-harness/` `experiments/wave5/d16/` `d18/` `d19/` `d20/` (harness + `current.mjs`; keep original D16–D20 files byte-stable unless a real harness defect requires owned-side fix) |
| CW70 | `5487cf49ca699a4c2370e97cdce8b7fe2bdc9c92` | `experiments/wave5/d14/` `experiments/codex-window/cw70-cold-http-consumer-current/` |

## Read-only

- CW64 `73c3e33bc1f15da0d8530818389e261dbd4b03c3`: `tools/python-useful-jobs-client/` `experiments/codex-window/cw64-installed-client-current-runtime/` — installed-client reference only.
- Shared runtime on this pin, public archives, H6D corpus, other jobs' `/tmp`.

Trees were checked out from the exact SHAs onto the pin (no merge of donor parent histories).

## Suggested children (meaningful, not a quota of 16)

After parent reads each `GROK-HANDOFF.md`, spawn independent subpaths if capacity allows. This VM: 4 CPU, ~10 GiB MemAvailable, disk 5%. Keep ≥25% MemAvailable. Serialize `node --test` / compiler / any DB. Suggested max 3 concurrent children. Child count is not acceptance.

CW64 is inspect-only (no child implementation). CW65 is the independent countercheck, not a rewrite of CW60–62/70 product code except harness-owned files.
