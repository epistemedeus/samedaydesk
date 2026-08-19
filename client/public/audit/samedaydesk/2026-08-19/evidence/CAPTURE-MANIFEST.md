# T0 capture manifest

Engagement: SDD-SELF-2026-01. Subject: https://samedaydesk.com/
First fetch (UTC): 2026-08-19T15:30:34Z. All captures in this directory were taken
inside the same session, before any remediation existed on the production branch.

Production deploy under test: commit 7978869 (public repo
https://github.com/epistemedeus/samedaydesk, branch main at capture time).

Tools, pinned:

| Tool | Version | Used for |
|---|---|---|
| curl | 8.14.1 (x86_64-pc-linux-gnu) libcurl/8.14.1 OpenSSL/3.5.6 | every first-byte fetch, headers, status codes |
| Google Chrome (headless, --dump-dom) | 151.0.7922.71 | the rendered-DOM capture only |
| python3 | 3.x standard library (re, json) | JSON-LD and noscript extraction |
| sha256sum (GNU coreutils) | system | SHA256SUMS.txt |

Baseline: logged out, no cookies, no cache, IPv4 egress from a Linux host,
viewport not applicable for curl captures, Chrome default viewport for the
rendered capture, virtual time budget 8000 ms.

User agents used:

- `SameDayDeskAudit/0.1 (+https://samedaydesk.com/audit)` for every first-byte capture
- `OAI-SearchBot/1.4` for the crawler-parity capture of the homepage

File naming: captured bodies keep a `.txt` extension so this directory serves
frozen evidence as plain text and never as a second live copy of the site.
Byte contents are unmodified, so the hashes in `SHA256SUMS.txt` match what the
live URLs returned at T0.

| File | Source URL | Fetched as |
|---|---|---|
| homepage.firstbyte.html.txt | https://samedaydesk.com/ | SameDayDeskAudit/0.1 |
| homepage.oai-searchbot.html.txt | https://samedaydesk.com/ | OAI-SearchBot/1.4 |
| homepage.rendered-dom.html.txt | https://samedaydesk.com/ | Chrome headless, JS executed |
| homepage.firstbyte.jsonld.json | extracted from homepage.firstbyte.html.txt | python3 re |
| homepage.firstbyte.noscript.html.txt | extracted from homepage.firstbyte.html.txt | python3 re |
| x402.firstbyte.html.txt | https://samedaydesk.com/x402 | SameDayDeskAudit/0.1 |
| llms.txt | https://samedaydesk.com/llms.txt | SameDayDeskAudit/0.1 |
| sitemap.xml.txt | https://samedaydesk.com/sitemap.xml | SameDayDeskAudit/0.1 |
| robots.txt | https://samedaydesk.com/robots.txt | SameDayDeskAudit/0.1 |
| agent-card.json.txt | https://samedaydesk.com/.well-known/agent-card.json | SameDayDeskAudit/0.1 |
| resources.html.txt | https://samedaydesk.com/resources.html | SameDayDeskAudit/0.1 |
| ai-visibility-audit.html.txt | https://samedaydesk.com/ai-visibility-audit.html | SameDayDeskAudit/0.1 |
| sitemap-url-status.txt | status code of all 44 sitemap URLs | SameDayDeskAudit/0.1 |
| *.headers.txt | response headers for the matching capture | as above |

What was not run: no Lighthouse, no axe, no WAVE, no authenticated surface, no
checkout, no email, no locale other than the default, no mobile emulation.
Absence of a card is not a pass.
