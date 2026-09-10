# Request → output map (S123)

One page. Maps the Agensi opportunity surface to this package’s actual output.

| Input | Observed | Output of this branch |
| --- | --- | --- |
| `/requests` board | Public bounty program; active list empty | Qualification only |
| MCP `get_skill_requests` open | `[]` | Stop: no original skill |
| MCP / Supabase historical row | One fulfilled $10 receipt-organizer bounty | Documented; not rebuilt |
| Creator Studio List-a-Skill (Root) | Free/paid ZIP + SKILL.md + review SLA | Requirements recorded; no submit |
| Pilot scope filter | Machine-work / source-data / collaboration / business-activation | N/A (no open brief) |
| S121 / S122 ownership | Distinct product owners | No duplicate brief (no candidate) |
| Official SKILL.md / creator guides | Learn hubs on www.agensi.io | Cited; unused for packaging |
| This package | Probe + facts + negative result | `scripts/probe-requests.mjs` + `S123_RESULT.md` |

## Acceptance for a future positive flip

1. `node scripts/probe-requests.mjs` fails with exit 2 (open non-empty), or Root supplies exact open request id/title with date/status/bounty/escrow.
2. Full request constraints, existing marketplace alternatives, license, and buyer motivation read.
3. Request in Pilot scope and not owned by S121/S122.
4. Then: original tested skill, SKILL.md, one-command clean-archive tests, licenses, Root review for publication.
