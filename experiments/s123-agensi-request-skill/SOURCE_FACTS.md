# Source facts (S123)

## Domains in scope

- `https://www.agensi.io` and `https://mcp.agensi.io` only
- Not `agensi.dev` or unrelated hosts

## Public HTTP

| URL | Result (2026-09-10 probes) |
| --- | --- |
| `/requests` | 200 HTML; title Skill Requests & Bounties; no SSR request cards |
| `/skills` | 200; marketplace listings present |
| `/api/requests`, `/api/v1/requests`, `/docs` | 404 |
| `api.agensi.io`, `docs.agensi.io` | DNS fail |
| `/learn/skill-md-format`, `/learn/for-creators` | 200 guide hubs (article index, not upload form) |
| `/docs/mcp-setup`, `/mcp` | 200 |

List-a-Skill UI constraints (Root-observed Creator Studio; not automated here): Free / One-time / Subscription; ZIP with `SKILL.md`; max 50MB; name max 60 characters; summary; rich description; buyer prompt + full result demo; compatibility note; optional tags/permissions/docs/logo/screenshots; Submit for Review with stated 24-48h admin review; payout required only for paid.

## MCP tools (public)

`search_skills`, `get_skill`, `list_categories`, `get_popular`, `get_creator`, `get_skill_requests`, plus auth-gated purchase/library tools (not used).

`get_skill_requests` params: `status` ∈ `open|fulfilled|all`, `limit` ≤ 50. Default open.

## Sole historical request (not actionable)

```json
{
  "title": "Receipt Finder & Organizer",
  "description": "I get a lot of receipts for business expenses to my email, I would like a skill that automatically finds all these receipts and forwards them to our finance email and saves them all in a folder that is updated monthly for record-keeping.",
  "status": "fulfilled",
  "is_bounty": true,
  "bounty": 10,
  "created_at": "2026-07-30T10:09:46.836463+00:00"
}
```

Supabase public row adds: `escrow_status: "released"`, `submission_deadline_at: "2026-08-07T13:05:58.711994+00:00"`, `fulfilled_at: "2026-08-07T09:01:35.445+00:00"`, `id: "aa7caca2-fb79-42d7-9b59-cbd4b03f2bf8"`.

## Pilot prior research

`overview/research/09-platform-experiment-inventory-2026-08-08.md`: Agensi evaluated as agent-skill marketplace and **killed before signup** (unproven demand / KYC-gated payout). No service-registry Agensi account entry found.

## Creator alias

MCP public creator slug `sameday` → SameDayDesk, zero published skills. Confirms acquisition surface exists without inventing listings.

## Intentionally unused

Paid MCP credits, `submit_skill_request`, `install_skill`, Stripe/checkout, local Mac UI/auth, forum spam, S121 Grexal packager, S122 recurring public-data recipes.
