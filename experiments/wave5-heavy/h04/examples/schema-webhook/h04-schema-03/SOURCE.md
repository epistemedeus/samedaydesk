# h04-schema-03 — meaningful no-change control

Primary source: [cloudevents/spec](https://github.com/cloudevents/spec) JSON Event Format example at tag **v1.0**.

| Item | Value |
| --- | --- |
| repo | `cloudevents/spec` |
| tag | `v1.0` |
| SHA | `d665aa6402a7ed5d0e506dc1c3cc408dba88d085` |
| path | `json-format.md` (first JSON object example under Attributes / Envelope) |
| URL | https://github.com/cloudevents/spec/blob/d665aa6402a7ed5d0e506dc1c3cc408dba88d085/json-format.md |
| license | Apache-2.0 bounded excerpt |

`before.json` is that public example (structured-mode CloudEvent with `specversion` `1.0`, `type` `com.example.someevent`, `source` `/mycontext`, `id` `A234-1234-1234`, XML `data`).

`after.json` is a **caller-owned no-op** of the same public example: object keys reordered and unused sibling `debug: "formatter-trace"` added. Used pointers `/id`, `/type`, `/source`, `/specversion` keep the same JSON types and values. A whole-document hasher would report a change; a used-path compatibility job must report **no consumer action**.

W4 `webhook-drift` at `94c7bfdfeaa99f5e70f341504df3051cc7717f91` emits `status=informational` with `unchangedCount=4` and does not mention `debug`. The useful-job oracle uses `status=unchanged` / `consumersBreak=false`.

This is not a second public revision of `json-format.md`. Both `beforeSha` and `afterSha` bind to v1.0 `d665aa6402a7ed5d0e506dc1c3cc408dba88d085`. Not a copy of W4 SAMPLE fixtures.
