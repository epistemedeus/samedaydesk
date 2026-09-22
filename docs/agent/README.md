# Agent docs (Diátaxis)

One SameDayDesk surface: the public **useful-jobs 1.4.7** offline package.

These pages are for a cold agent. They do not start Stripe, x402, or
`/extract/batch`. After extract, jobs run on local files with Node 22.

| Quadrant | Question | Page |
| --- | --- | --- |
| Tutorial | Teach me by doing | [tutorial.md](tutorial.md) |
| How-to | I have a goal | [how-to.md](how-to.md) |
| Reference | Exact pins, flags, refusals | [reference.md](reference.md) |
| Explanation | Why this shape | [explanation.md](explanation.md) |

## Surface pin (must match the public archive)

| Field | Value |
| --- | --- |
| Package | `useful-jobs` |
| Version | `1.4.7` |
| Archive | `/for-agents/useful-jobs/useful-jobs-1.4.7.tar.gz` |
| Bytes | `5255824` |
| SHA-256 | `e2e9b44e4d7318ac55052953318f05e53dbc121ab02e2762e34c919ac5469dec` |
| Discovery | `/discovery/useful-jobs.json` |
| Catalog | `/for-agents/useful-jobs/catalog.json` |
| Outcomes | `/for-agents/useful-jobs/jobs-outcomes.json` |
| Purchase | none (`purchaseAuthority: false`) |

Older tarballs at 1.0.0 through 1.4.0 stay at their original URLs. They are
not this lesson.

## Cold follow-the-doc run

From the repository root, Node 22, no `npm install`, no payment:

```bash
node docs/agent/follow-the-doc.mjs
```

The runner reads the tutorial and how-to fences, serves the **committed**
archive from `client/public/` (not a live purchase), executes the documented
commands, and then replays the seeded failures those pages say must be
refused. A passing run prints JSON with `"ok": true` and exit 0.

```bash
node --test docs/agent/follow-the-doc.test.mjs
```

That test is the same proof plus assertions on the JSON envelope.

## Out of scope

- Paid machine gateway (`https://agents.samedaydesk.com/extract/batch`)
- Apex MCP tool calls that settle
- Editing prices, SKUs, or merchant routes
- Treating a labeled `--example` result as a customer delivery
