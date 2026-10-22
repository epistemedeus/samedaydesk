# SDS agent docs (Diataxis)

Audience: an agent operating against SameDayDesk (SDS) from a cold clone of
`epistemedeus/samedaydesk`. Node **22.x**. No `npm install`. No payment,
publish, registry write, or checkout mutation.

This set lives under `docs/agent-sds/**`. It teaches existing unpaid SDS
helpers. It does not change `tools/`, `server/`, or any Neomorphic tree.

| Kind | Doc | Use when |
| --- | --- | --- |
| Tutorial | [quickstart.md](quickstart.md) | First unpaid SDS loop from a clean checkout |
| How-to | [howto/discover.md](howto/discover.md) | Discover SDS surfaces without paying |
| How-to | [howto/route-a-job.md](howto/route-a-job.md) | Map a known job to an existing SDS offer |
| How-to | [howto/reuse-a-result.md](howto/reuse-a-result.md) | Preview or export already-held JSON |
| How-to | [howto/refuse-wrong-path.md](howto/refuse-wrong-path.md) | Refuse paid, checkout, and Neomorphic paths |
| Reference | [reference.md](reference.md) | Commands, outcomes, exit codes, path policy |

## Cold follow-the-doc

From the repository root:

```text
node docs/agent-sds/follow.mjs
```

That runner extracts the `bash` blocks in `quickstart.md`, refuses any path
outside the SDS allowlist, runs the rest, and exits 0 when the documented
expects hold.

## Seeded wrong path

```text
node docs/agent-sds/follow.mjs --seed docs/agent-sds/fixtures/seeded-wrong-path.md
```

Expected: exit 2, `executed: false`, `error: "wrong_path_refused"`. The seed
names paid extract, Neomorphic vendor/migrate, checkout, and `neomorphic.io`.
The runner classifies and stops. It does not send HTTP, migrate, or checkout.

## Bounds

In scope: offline fixture cold-read, task-to-offer routing, opt-in result
reuse preview/export on in-repo fixtures.

Out of scope: `vendor/neomorphic*`, `neomorphic.io`, `POST /extract/batch`,
`GET /extract`, `/api/checkout`, Stripe Payment Links, MCP Registry writes,
price or SKU edits.

The offer matrix may *name* Neomorphic products. Naming is not a license to
fetch or run them from this doc set.
