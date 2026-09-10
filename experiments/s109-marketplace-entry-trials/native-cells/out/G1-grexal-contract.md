# G1 — Grexal seller/runtime contract (current)

Cell: independent research, S109 Stage-1 Grexal per-run agent entry.
Cash boundary: **$0**. This worker did not login, signup, push, publish, deploy, or pay.

Packages observed: `grexal@0.4.1` (npm `latest`), `@grexal/sdk@0.1.1` (npm `latest`).
As of: 2026-09-10.

## New fact

Grexal is a per-run agent marketplace. The seller-visible take rate is published as:

```
platform_fee  = clamp(buyer_charge × 0.20, $0.02, buyer_charge × 0.30)
your_earnings = buyer_charge − platform_fee
```

That is a **20%** marketplace fee, with a **$0.02 floor** and a **30% cap** on micro-runs. At **$0.10 and above** the seller keeps exactly **80%**. Sandbox compute, build, deploy, storage, and listing are included in the fee. The seller’s own third-party API/LLM costs are not.

The **runtime contract** is `grexal.json`. **Marketplace metadata and pricing are not.** Those live on the platform agent record and are mutated with `grexal agent set-*` / `grexal agent price` (or the dashboard) after the first `push`.

A **dry local scaffold does not require authentication**. `init`, `validate`, and `dev` in `grexal@0.4.1` never call `requireAuth()`. Login is the gate for any command that talks to the platform.

**Unknown demand is an experiment, not a blocker.** Buyer volume is not observable without a live listing. Stage-1 proceeds on contract + local scaffold, not on proven demand.

## Observed path

1. Live docs: [llms.txt](https://docs.grexal.ai/llms.txt), [llms-full.txt](https://docs.grexal.ai/llms-full.txt), [Payments](https://docs.grexal.ai/docs/payments), [Agent Manifest](https://docs.grexal.ai/docs/agent-manifest), [Quickstart](https://docs.grexal.ai/docs/quickstart), [CLI](https://docs.grexal.ai/docs/cli).
2. Local fixtures under `experiments/s109-marketplace-entry-trials/fixtures/` match the live fee formula and manifest split.
3. npm registry: `grexal@0.4.1` published 2026-05-03; `@grexal/sdk@0.1.1` published 2026-05-01.
4. Unpacked `grexal-0.4.1.tgz` and read `dist/index.js` for auth gates and `init` file writes.
5. Did **not** run `npx grexal login`, `init`, `push`, or `publish`.

## 1. Fee formula (primary citation)

Primary: [https://docs.grexal.ai/docs/payments](https://docs.grexal.ai/docs/payments)

> For every paid run of your agent, Grexal takes **20% as a marketplace fee** and the remaining **80% becomes your earnings**.
>
> Floor: a minimum fee of **$0.02 per run**.
> Cap: the fee never exceeds **30% of the run charge**.
>
> `platform_fee = clamp(buyer_charge × 0.20, $0.02, buyer_charge × 0.30)`

Same numbers appear in [llms.txt](https://docs.grexal.ai/llms.txt) step 7 and in the Agent Manifest earnings note.

Published worked table:

| Buyer pays | Platform fee | Seller receives | Effective % |
| ---------- | ------------ | --------------- | ----------- |
| $5.00      | $1.000       | $4.000          | 20%         |
| $1.00      | $0.200       | $0.800          | 20%         |
| $0.20      | $0.040       | $0.160          | 20%         |
| $0.10      | $0.020       | $0.080          | 20%         |
| $0.05      | $0.015       | $0.035          | 30% (cap)   |
| $0.02      | $0.006       | $0.014          | 30% (cap)   |

Docs: at **$0.10 or higher** you keep exactly 80%. Below that, the cap protects the buyer from a large fixed floor; seller share drifts toward 70% in the limit.

Derived (not a docs row): the **$0.02 floor** actually binds in a thin band `~$0.0667 ≤ charge < $0.10` (example: $0.08 → fee $0.02 = 25%). Below ~$0.0667 the 30% cap binds. Use the clamp, not the simplified prose, when worksheeting micro-runs (G3).

Also on that page:

- No separate bill for sandbox compute, `push`/`publish`/`deploy`, storage, or listing.
- Seller still pays upstream LLM/API cost; recover it via token/page/file line items.
- Backsolve: `buyer_charge = (target_net + upstream_cost) / 0.80`. Docs example: net $0.10 + Claude ~$0.04 → $0.175 → round to **$0.18**.
- No earnings on self-runs, failed runs, never-started cancels, or refunds.
- Earnings post immediately. Redeem to credits: instant, no minimum. Cash out: **$10** minimum after **14-day** hold.

Pricing line items are **not** in `grexal.json`. `npx grexal agent price add <unit> <amount>` after first push. Amounts in `[$0.00, $10.00]` per unit, max 12 items; every `output_*` unit needs `--param max_units=N`. Publish requires at least one line item. Run reserve is `estimate × 1.25`.

## 2. Manifest vs dashboard metadata

| Layer | File / command | Job |
| ----- | -------------- | --- |
| Runtime contract | `grexal.json` | How the agent runs |
| Identity binding | `.grexal/agent.json` | Ties the repo to a platform agent |
| Local connection stubs | `.grexal/connections.json` (gitignored) | Dev-only credentials |
| Marketplace record | `grexal agent set-*` or dashboard | How it shows up to buyers |
| Pricing | `grexal agent price …` or dashboard | What the buyer is charged |

`grexal.json` (manifest_version **3**): `entrypoint`, `runtime` (language, memory_mb, timeout_seconds, cpu, sandbox_template), `input_schema`, `output_schema`, `connections`.

**Rejected in `grexal.json`** (hard validation error; CLI prints the matching `set-*`):

`name`, `description`, `category`, `tags`, `homepage`, `repository`, `icon`, `is_open_source`, `pricing`.

Identity lifecycle:

1. `grexal init --name <slug>` writes `.grexal/agent.json` as `{ "name": "<slug>" }`.
2. First `grexal push` claims the slug, mints `agentId`, rewrites the file to `{ "agentId": "ag_..." }`.
3. Later commands address the agent by id. `set-name` changes the slug; public links stay id-based.

Publish gate (docs): non-empty **description**, **category**, at least one **tag**, and at least one **pricing** line item. `grexal publish` lists each missing field with the exact `set-*` command.

`grexal@0.4.1` `init` writes a **flattened typed schema** (`type`: `text` | `file` | `number` | `boolean` | `json`). The validator also accepts v1 JSON-Schema `{ "type": "object", "properties": … }`. Quickstart examples use the flattened form; the Agent Manifest page still shows JSON-Schema. Both are accepted.

Stale string in the 0.4.1 validator: pricing reject text still says `grexal agent set-price <amount>`. Live command is `grexal agent price add`.

## 3. Dry local CLI entry (no publish, no spend)

Documented commands only. Not executed in this cell. Do **not** authenticate.

```bash
node --version   # >= 20

npx --yes grexal@0.4.1 --help
npx --yes grexal@0.4.1 init --language typescript --name <slug>
cd <slug>
npx --yes grexal@0.4.1 validate

# optional, npm registry only — still no Grexal account
npm install

npx --yes grexal@0.4.1 dev --input '{"query":"dry-run"}' --once
```

Python variant: `--language python` (entrypoint `agent.py`, `requirements.txt`).

`init` is local `mkdir`/`writeFile`. It does not hit the Grexal API. Non-TTY requires both `--language` and `--name`.

Do **not** run on this worker:

```bash
npx grexal login
npx grexal push
npx grexal publish
npx grexal deploy          # alias of push --publish
npx grexal agent set-*
npx grexal agent price add …
npx grexal runs invoke …
```

CLI docs: login is required before commands that talk to the platform (`push`, `publish`, `unpublish`, `delete`, `agent`, `env`). The 0.4.1 binary also `requireAuth()` on `runs` and `connections`.

npm README shipped with `grexal@0.4.1` is **stale**: it still presents `grexal deploy` as a single go-live step. Current docs and the binary treat `push` as a **draft** build and `publish` as the live promotion. `deploy` = `push --publish`.

Version skew (not a fee change): CLI 0.4.1 depends on `@grexal/sdk@^0.0.2` for its own bundle. TypeScript `init` writes `"@grexal/sdk": "latest"` (currently **0.1.1**).

## 4. Auth gate

- Docs prerequisite: Node.js 20+ and a Grexal account at https://grexal.ai.
- `npx grexal login` opens `https://grexal.ai/auth/cli?code=…`, polls the platform, writes `~/.grexal/credentials.json`.
- Bundle default API: `https://impartial-sockeye-413.convex.site` (`GREXAL_API_URL` override). Not called from this cell.
- `set-*` before first push: `No agent yet on the platform. Run grexal push first…`
- After auth, **self-runs are free** and produce no earnings. `push`/`publish` are documented as not separately billed. This worker still must not login: signup/account linking is outside the cash boundary.

## Unknown demand

Grexal buyer volume, orchestrator share, and whether a SameDayDesk-class evidence packager would be contracted are **unknown** without a public listing and paid runs. That unknown is **an experiment, not a Stage-1 blocker**. Do not wait for demand proof before packaging.

## Next measurable event

G2: vendor a `manifest_version` 3 `grexal.json` (and identity stub) under `surfaces/grexal/package` with **no login and no push**. Optional $0 check in `/tmp`: `npx grexal@0.4.1 init …` then `validate`. G3: worksheet the $0.18 and $0.05 cases through the published clamp without placing a paid run.

## Sources

- https://docs.grexal.ai/docs/payments — primary fee formula
- https://docs.grexal.ai/llms.txt
- https://docs.grexal.ai/llms-full.txt
- https://docs.grexal.ai/docs/agent-manifest
- https://docs.grexal.ai/docs/quickstart
- https://docs.grexal.ai/docs/cli
- https://registry.npmjs.org/grexal/0.4.1
- https://registry.npmjs.org/@grexal/sdk/0.1.1
- unpacked `grexal-0.4.1.tgz` `dist/index.js`
- fixtures: `grexal-payments.txt`, `grexal-agent-manifest.txt`, `grexal-llms.txt`, `grexal-llms-full.txt`
