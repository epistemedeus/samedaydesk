# Result reuse (offline)

Opt-in helper that turns an already produced extract-batch, page-change, or
record JSON file into a bounded `neomorphic.task-memory.observation.v1`
reference. Purchasing never requires this step.

The projection uses a reviewed allowlist and omission list, not a guarantee
that leftover fields are harmless. A schema-valid export is user-selected
unverified evidence, never automatic public-safe certification. Private
source text, authorization, receipt secrets, and legal/customer identifiers are
omitted by default and cannot be selected.

```bash
NOW="$(date -u +%Y-%m-%dT%H:%M:%SZ)"
node tools/result-reuse/cli.mjs preview --input tools/result-reuse/fixtures/accepted-page-change.json --task-id vendor-watch --subject vendor-page-result --sequence 1 --clock "$NOW"
node tools/result-reuse/cli.mjs export --input tools/result-reuse/fixtures/accepted-page-change.json --task-id vendor-watch --subject vendor-page-result --sequence 1 --clock "$NOW" --opt-in --out /tmp/reuse-observation.json
node --test tools/result-reuse/test/export.test.mjs
```

Does not fetch, pay, or host a social backend. Default page-change and record
outputs are not rewritten. Task identity, subject, revision sequence, and a real
caller clock are required; the helper does not invent them. When an original
evidence URL is absent, the contract source URI is explicitly marked as a reuse
recipe locator, not original evidence. Input is limited to 1 MiB, 24 nested
levels, 1,000 entries per array/object, 20,000 total nodes, and 64 KiB per string;
the projected payload is limited to 32 KiB. Observation identity is a stable
SHA-256 derivation of the explicit task ID and subject; revision identity is the
explicit sequence. N54 import is later composition work.

## Decide or reuse

`decide-or-reuse` binds one useful `source-change-alert` or
`verification-reconcile` decision to the public
manifest that exists before that producer runs. It does not add a store, a
network call, a payment, or a schema family. The manifest carries the recipe
id, the recipe version, the prior public capture, and the current public
capture. The saved observation's `source.version` is the digest of that
manifest. The useful outcome, recovery, and field diff are stored on the same
observation and returned on a hit.

Preview and export are unchanged. An observation they write is an unbound
result record. It is not upgraded into a before-work decision.

```bash
node tools/result-reuse/cli.mjs decide-or-reuse \
  --input before-work.json \
  --produced source-change-alert-result.json \
  --out /tmp/reuse-observation.json \
  --task-id source-change-example \
  --subject source-change-example-decision \
  --sequence 1 \
  --clock 2026-09-09T08:00:00.000Z \
  --horizon 168 \
  --opt-in

node tools/result-reuse/cli.mjs decide-or-reuse \
  --input before-work.json \
  --decision /tmp/reuse-observation.json \
  --task-id source-change-example \
  --subject source-change-example-decision \
  --sequence 1 \
  --clock 2026-09-09T08:00:00.000Z \
  --horizon 168 \
  --opt-in
```

### Second decision on the same capture

`verification-reconcile` is the second supported recipe. It reads the same
saved capture and prior and answers a different question: is the later
observation still the delivered content (`noChangeProven`), without replaying a
payment. Its manifest is the same shape with `recipeId: "verification-reconcile"`;
`fields` is optional. Produce it once with the recipe CLI
(`--recipe verification-reconcile --prior <prior> --candidate <capture>`), bind
it with `--produced`, then reuse it with `--decision`. Each recipe has its own
before-work digest, so a saved `source-change-alert` decision is never served as
a `verification-reconcile` answer (`recipe_changed`). The stored evidence keeps
only the capture identity, mismatched field names, `partial`, `noChangeProven`
and `automaticPaymentReplay: false`; the candidate path is not stored. Any other
recipe id is still refused: bind exits 1 naming the supported recipes, and the
reuse form returns `recompute` with `input_not_before_work`.

`--produced` is the decision the useful job already returned. `--decision` is
the bound observation written by the first command. `--opt-in` affirms that
the earlier opt-in is still in force. `--withdraw-opt-in` records that it was
withdrawn. `--producer` may name the job, and this command never executes it.

| Verdict | When |
| --- | --- |
| `reuse` | Before-work digest, recipe, task and subject identity, revision, opt-in, and clock all match. Returns the useful saved decision and its provenance. |
| `recompute` | Reason is `digest_mismatch`, `recipe_changed`, `revision_changed`, `stale_clock`, `subject_mismatch`, `opt_in_withdrawn`, `unbound_legacy`, `invalid_saved_state`, or `input_not_before_work`. No fresh answer is invented. |
| `rejected` | A private field is present. It is not hashed into the decision. The top-level N45 boolean `payment` marker remains an origin flag. |

The cost baseline is the recurring-job note for the bound recipe (`source-change-alert` on unbound paths): offline
compare does not invoke a merchant charge, and operator compute stays
`costs_unknown`. The live metric on every verdict is unset:
`distinctLaterAcceptedTasksTakingReuse` is null and
`recomputeCostAvoidedNetOfUpkeep` is `costs_unknown`. A hit shows that this
caller supplied the same before-work manifest. It cannot establish that live
page bytes beyond that manifest are unchanged, that a later accepted task took
the reuse, that recompute cost was avoided net of upkeep, or that the result
is public-safe or accepted by a merchant.

Existing preview and export outputs stay byte-identical. Limits and the
omission list are unchanged.
