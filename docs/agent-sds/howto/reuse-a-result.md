# How to reuse an already-held SDS result

Use this when you already have page-change, extract-batch, or record JSON and
want a bounded `neomorphic.task-memory.observation.v1` projection. Purchasing
never requires this step. The helper does not fetch or pay.

## Preview (default)

Caller clock, task id, subject, and sequence are required. The helper does not
invent them.

```bash
NOW=2026-09-17T00:00:00.000Z
node tools/result-reuse/cli.mjs preview --input tools/result-reuse/fixtures/accepted-page-change.json --task-id vendor-watch --subject vendor-page-result --sequence 1 --clock "$NOW"
```
<!-- follow-expect {"exit":0,"json":{"ok":true,"mode":"preview","optInRequiredToWrite":true,"purchaseRequiresPublish":false}} -->

A schema-valid preview is user-selected unverified evidence. It is not
automatic public-safe certification.

## Export (opt-in write)

Export requires `--opt-in` and `--out`. Use a fresh directory. Do not overwrite
the input fixture.

```text
PILOT_EXAMPLE_DIR="$(mktemp -d)"
NOW=2026-09-17T00:00:00.000Z
node tools/result-reuse/cli.mjs export \
  --input tools/result-reuse/fixtures/accepted-page-change.json \
  --task-id vendor-watch --subject vendor-page-result --sequence 1 --clock "$NOW" \
  --opt-in --out "$PILOT_EXAMPLE_DIR/reuse-observation.json"
```

Cold follow does not run export. Preview is enough to prove the helper. If you
export by hand, the written observation uses schema
`neomorphic.task-memory.observation.v1` and `execute: false`.

## Limits worth keeping

- Input is bounded (size, depth, node count, string length).
- Private source text, authorization, receipt secrets, and legal identifiers
  are omitted and cannot be selected.
- `charged: true` on a source is not useful output.
- Result reuse does not perform the page comparison itself. Route
  `page_change_evidence` first when you still need a compare.
