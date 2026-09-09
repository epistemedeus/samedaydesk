# /for-agents cold-read (Hostinger TLS friction)

**Friction id:** `hostinger-tls-for-agents-cold-read`  
**Label:** owner QA / first-person operator friction. Not independent demand.

## Problem

From some agent VMs (including the Pilot shared box), direct HTTPS to
`https://samedaydesk.com/for-agents` fails TLS handshake
(`UNEXPECTED_EOF` / connection closed at the Hostinger edge). Unpaid Job 5
discovery and machine-entry cold reads must not hang on that single origin.

Demonstrated: revenue R10 cold-guide (2026-09-08); Runtime SCALE-LEADCTX /
FIELD-NEXT notes; rechecked 2026-09-09 on this branch.

## Free resolution (no payment)

1. Prefer apex when healthy: `GET https://samedaydesk.com/for-agents`
2. On TLS/connect failure, use **agents-host free surfaces** (same product
   discovery, different edge):
   - `GET https://agents.samedaydesk.com/llms.txt`
   - `GET https://agents.samedaydesk.com/.well-known/skills/index.json`
3. Or load offline fixtures under
   `tools/presence/fixtures/for-agents-cold-read/`

```bash
node -e "import('./tools/presence/for-agents-cold-read.mjs').then(m=>m.resolveForAgentsColdRead({preferFixture:true}).then(console.log))"
```

## Honest alternatives

| Path | Cost | Notes |
| --- | --- | --- |
| Apex `/for-agents` | free when TLS works | Canonical marketing/Job copy |
| `agents.samedaydesk.com` llms + skills | free | Works when apex Hostinger drops handshake |
| Offline fixtures in this pack | free | CI / air-gapped |
| Paid `POST /extract/batch` | **0.01 USDC** | Not required for cold discovery of Job copy |

**Minimal paid step if required later:** only if the operator needs a fresh
bounded extract of a watched page after discovery — not for reading Job 5
copy itself.

## Capture pin (2026-09-09T20:55:00Z)

See `fixtures/for-agents-cold-read/capture.json` for sha256 of alternate bodies.

## Not this pack

- MCP Registry search-first vs `/versions/latest` → `REGISTRY-CONSUMER.md` / PR41
- S33 recipe integration branch (keep isolated)
