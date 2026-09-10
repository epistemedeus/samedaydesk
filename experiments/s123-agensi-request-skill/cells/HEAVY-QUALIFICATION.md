# S123 Heavy qualification — Agensi original-skill request

**Verdict: NEGATIVE. Do not invent a skill.**

No current **open** skill request qualifies. Cash 0. No git push. No signup, paid credits, `submit_skill_request`, paid-skill install, marketplace listing, comment, or submission.

Probed independently by S123 Heavy on **2026-09-10T10:05:55Z–10:05:59Z** (UTC). Cursor is transport only.

---

## method

1. Hosts in this pass: `https://mcp.agensi.io/mcp` and `https://www.agensi.io` only. Not `agensi.dev`. No other APIs.
2. MCP JSON-RPC 2.0 `POST https://mcp.agensi.io/mcp` with `Content-Type: application/json` and `Accept: application/json, text/event-stream`.
3. `initialize` then `tools/list` (read-only). Confirmed public tools; did **not** call auth/paid tools (`submit_skill_request`, `install_skill`, `my_credits`, `my_purchases`, `my_library`, `get_updates`, `get_skill` with `confirm`).
4. Required verification calls (this turn, not reused from disk):
   - `tools/call` `get_skill_requests` `{status:"open", limit:50}`
   - `tools/call` `get_skill_requests` `{status:"all", limit:50}`
   - `tools/call` `get_skill_requests` `{status:"fulfilled", limit:50}`
   - `tools/call` `get_creator` `{slug:"sameday"}`
5. Corroboration: `GET https://www.agensi.io/requests` (public HTML). Request cards are not SSR; live list is the MCP result.
6. Scope gate (only if an **open** row existed): machine-work / useful source-data delivery / agent collaboration / business-activation; public HTTP/API/MCP only; not S121/S122 owned recipes.
7. Package files under this experiment were **read** for prior context; they were not treated as live truth. Live MCP matched the prior empty-open result.

MCP server this pass: `agensi` **1.1.0**, protocol **2025-03-26**.

---

## open_count

**0**

`get_skill_requests({status:"open", limit:50})` → `[]`

HTTP/2 200, `x-railway-request-id: guyQfdcYQPq_iefXAXC71g`, date `Thu, 10 Sep 2026 10:05:56 GMT`.

Content SHA-256 of the tool text payload `[]`:

`4f53cda18c2baa0c0354bb5f9a3ecbe5ed12ab4d8e11ba873c2f11161202b945`

---

## all rows summary

`status=all` and `status=fulfilled` both return **exactly one** historical row. Same object. No second title.

| Field | Value |
| --- | --- |
| title | Receipt Finder & Organizer |
| status | `fulfilled` (not open) |
| is_bounty | true |
| bounty | 10 |
| urgency | nice |
| vote_count | 0 |
| tags | null |
| created_at | 2026-07-30T10:09:46.836463+00:00 |
| description | Email business-expense receipts → forward to a finance mailbox and save into a folder updated monthly |

MCP does not return escrow / winner / `fulfilled_at` on this tool. Those fields are not required to disqualify: **status is already `fulfilled`.**

Creator `sameday` (live `get_creator`):

| Field | Value |
| --- | --- |
| name | SameDayDesk |
| slug | sameday |
| verified | false |
| skill_count | **0** |
| total_installs | 0 |
| skills | `[]` |
| url | https://agensi.io/creators/sameday |

Zero published skills. Acquisition surface exists; this pass does not list or package anything against it.

`www.agensi.io/requests` (HTTP/2 200, 81082 bytes, title `Skill Requests & Bounties | Agensi`): bounty-program marketing only (escrow, 7-day window, refund-if-none). HTML does **not** contain “Receipt Finder”. No SSR request cards. Matches empty open set.

---

## qualify_or_negative

**NEGATIVE — no original skill.**

Stop conditions hit:

- Open set empty → nothing to fulfill.
- The only board row is already `fulfilled`.
- Building a free prototype “because receipts are useful” would invent a customer and ignore the open-request gate.
- Public-HTTP-only rule: even if this row were still open, the brief needs the buyer’s email inbox. That is not public MCP/HTTP. Out of this worker’s allowed surface.

S123 in-scope themes (machine-work, source/data delivery, agent collaboration, business-activation) are **N/A** until an **open** brief exists in those lanes.

---

## Receipt Finder — actionable?

**No.**

| Check | Result |
| --- | --- |
| Current open request? | No. `status: fulfilled` |
| Funded open bounty to compete for? | No. Historical `$10` bounty; board closed |
| Public HTTP/API/MCP delivery possible without auth/mailbox? | No. Requires the requester’s email |
| Would building it invent a customer? | Yes |
| Action this pass | Document and stop. Do not scaffold SKILL.md |

---

## S121 / S122 overlap note

No overlapping **open** request, so no duplicate build and no handoff brief beyond this line.

- **S121** owns Grexal Gitdiff / Agensi reused-recipe packaging. Receipt Finder is not a gitdiff or reused-recipe job.
- **S122** owns recurring public-data recipes. Receipt Finder is private mailbox traffic, not a public-data cadence.

If a future **open** request is gitdiff/reused-recipe → stop and leave it to S121. If it is a recurring public-data harvest → stop and leave it to S122. Neither case is live today.

---

## command evidence

All commands below were run this turn against live hosts. Auth-gated tools were listed by `tools/list` and **not** invoked.

### initialize

```bash
curl -sS -X POST 'https://mcp.agensi.io/mcp' \
  -H 'Content-Type: application/json' \
  -H 'Accept: application/json, text/event-stream' \
  -H 'MCP-Protocol-Version: 2025-03-26' \
  --data '{"jsonrpc":"2.0","id":1,"method":"initialize","params":{"protocolVersion":"2025-03-26","capabilities":{},"clientInfo":{"name":"s123-heavy-qual","version":"0.1"}}}'
```

Result (JSON, HTTP/2 200, `x-railway-request-id: xBbGyiwQTY2OlKuVipRofQ`):

```json
{"jsonrpc":"2.0","id":1,"result":{"protocolVersion":"2025-03-26","serverInfo":{"name":"agensi","version":"1.1.0"},"capabilities":{"tools":{"listChanged":true}}}}
```

### get_skill_requests — open / all / fulfilled

```bash
# open
curl -sS -X POST 'https://mcp.agensi.io/mcp' \
  -H 'Content-Type: application/json' \
  -H 'Accept: application/json, text/event-stream' \
  --data '{"jsonrpc":"2.0","id":3,"method":"tools/call","params":{"name":"get_skill_requests","arguments":{"status":"open","limit":50}}}'

# all
curl -sS -X POST 'https://mcp.agensi.io/mcp' \
  -H 'Content-Type: application/json' \
  -H 'Accept: application/json, text/event-stream' \
  --data '{"jsonrpc":"2.0","id":4,"method":"tools/call","params":{"name":"get_skill_requests","arguments":{"status":"all","limit":50}}}'

# fulfilled
curl -sS -X POST 'https://mcp.agensi.io/mcp' \
  -H 'Content-Type: application/json' \
  -H 'Accept: application/json, text/event-stream' \
  --data '{"jsonrpc":"2.0","id":5,"method":"tools/call","params":{"name":"get_skill_requests","arguments":{"status":"fulfilled","limit":50}}}'
```

| Call | HTTP | railway-request-id | Tool text | Content SHA-256 |
| --- | --- | --- | --- | --- |
| open | 200 | `guyQfdcYQPq_iefXAXC71g` | `[]` | `4f53cda18c2baa0c0354bb5f9a3ecbe5ed12ab4d8e11ba873c2f11161202b945` |
| all | 200 | `XqZnILYyQkWM5B7yVOLIQQ` | one fulfilled Receipt Finder row | `ef9fb1e59446052e9881c2c4e44abf72bbba3892a7a57820488478a15822b5a7` |
| fulfilled | 200 | `wkvZpQcHRc2QIcdCipRofQ` | same row as `all` | `ef9fb1e59446052e9881c2c4e44abf72bbba3892a7a57820488478a15822b5a7` |

`all` SSE body (tool text decoded):

```json
[
  {
    "title": "Receipt Finder & Organizer",
    "description": "I get a lot of receipts for business expenses to my email, I would like a skill that automatically finds all these receipts and forwards them to our finance email and saves them all in a folder that is updated monthly for record-keeping.",
    "vote_count": 0,
    "status": "fulfilled",
    "tags": null,
    "urgency": "nice",
    "is_bounty": true,
    "bounty": 10,
    "created_at": "2026-07-30T10:09:46.836463+00:00"
  }
]
```

### get_creator slug sameday

```bash
curl -sS -X POST 'https://mcp.agensi.io/mcp' \
  -H 'Content-Type: application/json' \
  -H 'Accept: application/json, text/event-stream' \
  --data '{"jsonrpc":"2.0","id":6,"method":"tools/call","params":{"name":"get_creator","arguments":{"slug":"sameday"}}}'
```

HTTP/2 200, `x-railway-request-id: hqV1TOUXSF-Gdie6ipRofQ`, date `Thu, 10 Sep 2026 10:05:58 GMT`.

```json
{
  "name": "SameDayDesk",
  "slug": "sameday",
  "bio": "Practical workflows for agent-run work: source-change evidence, delivery checks and machine-commerce tools. Built by SameDayDesk.",
  "verified": false,
  "skill_count": 0,
  "total_installs": 0,
  "url": "https://agensi.io/creators/sameday",
  "skills": []
}
```

### public page

```bash
curl -sS -D - -o /dev/null 'https://www.agensi.io/requests'
```

HTTP/2 200, `content-type: text/html; charset=utf-8`, date `Thu, 10 Sep 2026 10:05:59 GMT`. Title: Skill Requests & Bounties. No request-card payload in HTML.

### tools/list (read-only; not a request row)

12 tools. Public request tool schema: `status` ∈ `open|fulfilled|all`, `limit` max 50, default open, no auth. Description: community-requested skills that have not been built yet.

Intentionally unused this pass: `submit_skill_request`, `install_skill`, `my_credits`, `my_purchases`, `my_library`, `get_updates`, Stripe/checkout, any `confirm` credit spend.

---

## smallest next action

**Stop.** Do not author SKILL.md, ZIP, or a prototype.

Next Heavy action, and only then: when Root reports a **new open** request on `www.agensi.io/requests`, or when the same four MCP calls return `status=open` non-empty, re-qualify **that exact row** (title, constraints, bounty/escrow, public-HTTP feasibility, S121/S122 ownership). Build only if that row is open, in S123 scope, and not S121/S122.

Until then, `open_count` remains 0 and this experiment stays a negative qualification.

---

## this-pass bounds

- Cash: 0
- Git push: not done
- Original skill invented: no
- Marketplace listing / comment / submit: no
- File written: this document only
