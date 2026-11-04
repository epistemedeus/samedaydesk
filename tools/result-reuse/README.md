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

`decide-or-reuse` compares a saved observation with a later public result. It
does not add a store, a network call, a payment, or a schema family. The saved
decision is keyed by the digest of the projected public inputs
(`source.version`, a SHA-256 of those inputs). The caller supplies the same
task id, subject, revision sequence, and clock used for export, plus a recipe
window in hours. The window is the recurring-job stale baseline: a saved clock
older than the supplied horizon is recomputed. The helper does not invent the
horizon.

```bash
node tools/result-reuse/cli.mjs decide-or-reuse \
  --decision /tmp/reuse-observation.json \
  --input tools/result-reuse/fixtures/n45-page-change-result.json \
  --task-id n45-example-com \
  --subject n45-example-com-result \
  --sequence 1 \
  --clock 2026-09-09T08:00:00.000Z \
  --horizon 168 \
  --opt-in
```

`--decision` is an observation previously written by `export`, or a preview
envelope that contains one. `--opt-in` affirms that the earlier opt-in is still
in force. `--withdraw-opt-in` records that it was withdrawn.

| Verdict | When |
| --- | --- |
| `reuse` | Public digest, task and subject identity, revision, opt-in, and clock all match. Returns the decision, input digest, source URI, revision, and clock. |
| `recompute` | Reason is `digest_mismatch` (changed public page bytes), `revision_changed`, `stale_clock`, `subject_mismatch`, or `opt_in_withdrawn`. |
| `rejected` | A private field is present. It is not hashed into the decision. The top-level N45 boolean `payment` marker remains an origin flag. |

The cost baseline is the recurring-job note for `source-change-alert`: offline
compare does not invoke a merchant charge, and operator compute stays
`costs_unknown`. The live metric on every verdict is unset:
`distinctLaterAcceptedTasksTakingReuse` is null and
`recomputeCostAvoidedNetOfUpkeep` is `costs_unknown`. A verdict shows that the
supplied public inputs match or miss the saved decision. It cannot establish
that live page bytes beyond that input are unchanged, that a later accepted
task took the reuse, that recompute cost was avoided net of upkeep, or that the
result is public-safe or accepted by a merchant.

Existing preview and export outputs stay byte-identical. Limits and the
omission list are unchanged.
