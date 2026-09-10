SameDayDesk’s published extract/read/batch routes can **describe** a static-page brief and **challenge** for payment; they cannot **execute** that fetch unpaid. They are the wrong path for a complete GitHub issue-discussion brief. A free GitHub REST call already returned the full thread.

## Receipt

| Field | Value |
|---|---|
| **Model used** | Grok 4.6 (xAI) |
| **Tool names used** | `web_fetch`, `search_tool` (MCP probe), `run_terminal_command`/`curl` |
| **SameDayDesk MCP on this host** | None (`search_tool` returned 0 MCP tools) |
| **402 stop** | **Yes.** Unpaid `GET /extract` returned **HTTP 402**. No wallet, signing, payment, paid retry, or other paid tools. |

### Requested / observed URLs and HTTP statuses

| URL | Method | Status | Size | Notes |
|---|---|---|---|---|
| `https://agents.samedaydesk.com/openapi.json` | GET | **200** | 130970 | OpenAPI **3.1.0**, gateway **1.23.46** |
| `https://agents.samedaydesk.com/.well-known/skills/index.json` | GET | **200** | 1355 | Skills: `web-extract`, `page-change`, `explicit-record` |
| `https://agents.samedaydesk.com/.well-known/skills/web-extract/SKILL.md` | GET | **200** | 3324 | Public skill contract |
| `https://agents.samedaydesk.com/extract?url=https%3A%2F%2Fexample.com%2F` | GET (unpaid, `X-SameDayDesk-Agent-Source: agent-skills-v1`) | **402** | 5911 | Payment challenge only |
| `https://api.github.com/repos/NousResearch/hermes-agent/issues/99533` | GET | **200** | 11820 | Issue JSON |
| `https://api.github.com/repos/NousResearch/hermes-agent/issues/99533/comments?per_page=100` | GET | **200** | 5188 | 2 comments, no `Link` pagination |
| `https://github.com/NousResearch/hermes-agent/issues/99533` | GET HTML (no-JS) | **200** | 360350 | Comparison only; not a SameDayDesk call |

---

### 1. Extract / read / batch contract (source quality vs paid envelope)

From live OpenAPI **1.23.46**, Web Data ops only:

**`GET /extract`** (`extractUrl`) — **$0.005** USDC, x402 exact / MPP `evm/charge` on Base (`eip155:8453`).  
No-JS fetch, redirects, **12s timeout**, **3 MB** cap. Excerpt is **not** the full page.

| Envelope (paid HTTP 200) | Source quality |
|---|---|
| `ok` = typed record **after payment** | `status` = **source** HTTP status |
| HTTP 200 = **merchant delivery**, not source success | `sourceOk` false + `error` = source 4xx/5xx |
| `requestedUrl` vs `finalUrl` | `capture` labels method/limits (`http-get-no-javascript`, `javascriptExecuted`, `textTruncated`, `bodyTruncated`) |
| Documented responses: **200, 402** only | `text` is not a completeness proof |

Required 200 fields: `ok`, `url`, `title`, `status`, `sourceOk`, `requestedUrl`, `finalUrl`.

**`GET /read`** (`readUrlAsMarkdown`) — same **$0.005**.  
200 is merchant delivery. `truncated` + `capture` label **40,000-character** and **3 MB** no-JS limits. **Missing discussion text is not proof of absence.**

**`POST /extract/batch`** (`extractPublicUrlsBatch`) — flat **$0.01** (10000 atomic) for a **1–5 URL attempt**, not per-
...
); **#99549** emptiness-gate misses that; **#99556** `status >= 400` catches it; `_trim_results` drops `metadata.statusCode`

**No-JS HTML** of the same issue: **200**, **360,350** bytes. Issue body **and** both comments are present, but as late Relay/JSON (comment authors ~offset **260k–266k**), not as `comment-body` articles. `/read`’s **40,000-character** markdown cap is far below that HTML. SameDayDesk `/extract` excerpt is contractually not the full page.

**What free GitHub REST provides that no-JS page extract cannot guarantee:** complete comment list as first-class objects (ids, `author_association`, timestamps, `html_url`); full issue body without excerpt/40k truncation; labels/state/reactions; pagination via `Link`; a 403/404 as **HTTP status**, not an empty “success” page. That is the same `statusCode`-vs-empty confusion this issue is about.

---

### Separation: install / model / free / pay

| Layer | What it is | What it is not |
|---|---|---|
| **Skill install** | Free docs at `/.well-known/skills/…` (HTTP 200) | Not execution, not payment capability |
| **Model selection** | This run: Grok 4.6 | Does not unlock paid routes or MCP |
| **Free execution** | OpenAPI, skills, 402 offer, GitHub REST/HTML, origin GET | No SameDayDesk source fetch |
| **Payment** | Required for live `/extract`, `/read`, `/extract/batch` | 402 ≠ source error; paid 200 ≠ complete page |

---

### Recommendation (evidence-backed)

1. **(a) Static-page brief (e.g. example.com):** Published SameDayDesk `GET /extract` is the paid path and is **shaped** for this (OpenAPI example is example.com). On this host it is **not obtainable unpaid** (402 stop). A caller can learn **price, networks, field names, and an example record** from OpenAPI + 402 without paying. For the page itself, fetch the origin directly; do not pay SameDayDesk unless you need their **typed** `sourceOk`/`status`/`capture` envelope.

2. **(b) Complete GitHub issue-discussion brief:** **Do not use** SameDayDesk extract/read/batch. The skill forbids treating missing discussion as absence; capture is no-JS with excerpt/40k/3MB limits. **Use GitHub REST** (`issues/{n}` + `…/comments`). That already returned the full #99533 thread for free.

3. **Do not pay** to “complete” this task. 402 is a challenge, not a source failure. Paying would still not make a GitHub discussion complete under the published capture contract.

4. **This session has no SameDayDesk MCP tools.** Skill text on disk is not a live extractor.
