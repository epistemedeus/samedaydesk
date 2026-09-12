# Delivery-negative: missing promised pin-delta.json

This case is **not** an engine refusal. The tiny lock pair in `before.json` / `after.json` is a valid npm lockfileVersion 3 pair. `lockfile-pin-delta` would succeed: stdout `ok: true`, `status: actionable`, and it would write the catalog promised files.

Promised outputs (M01 catalog `lockfile-pin-delta.outputs`):

- `pin-delta.json`
- `pin-delta.md`

`expected-delivery.json` requires:

```json
{ "promised": ["pin-delta.json", "pin-delta.md"], "missingOutputMustFail": true }
```

The accept-pack **runner** (parent-owned; not implemented here) must fail delivery when those promised files are missing **even when stdout is `ok: true`**.

M01 `classifyInvocation` (`experiments/wave5/m01/lib/classify.mjs`):

1. If the spawn is a valid catalog refuse → `kind: refused`
2. Else if exit 0 and stdout `ok: true` **and** `missingOutputs.length` → `kind: incomplete-delivery`, `code: missing-promised-output`
3. Else if exit 0 and stdout `ok: true` and files present → `kind: analysis`

Protocol for this case:

1. Invoke `lockfile-pin-delta` on this pair with `--out-dir`.
2. Confirm the engine would succeed (analysis).
3. If `pin-delta.json` (or `pin-delta.md`) is absent — including a post-run deletion used only to exercise the classifier — classify as `incomplete-delivery` / `missing-promised-output`.
4. Treat that as a **failed** accept-pack delivery. Do not pass because stdout looked successful.

Do not patch `tools/` or M01. Do not treat this as `refused`.
