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
