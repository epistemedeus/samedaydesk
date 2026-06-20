# DNS records for samedaydesk.com (Hostinger zone)

Architecture (per synthesis §3, refined): **transactional sending is isolated to the
`mail.samedaydesk.com` subdomain** (Resend) so it never affects the root domain's
reputation. The root domain handles **receiving** (`contact@` mailbox via Hostinger) and
the operator's Gmail "send-as". They don't conflict — different names.

## A. Resend sending (add now) — names relative to the `samedaydesk.com` zone

| Type | Name (host) | Value | Priority | TTL |
|---|---|---|---|---|
| TXT | `resend._domainkey.mail` | `p=MIGfMA0GCSqG…6XYJ8WQIDAQAB` (full DKIM — **copy from Resend**, do not transcribe) | — | Auto |
| MX | `send.mail` | `feedback-smtp.us-east-1.amazonses.com` | 10 | 3600 |
| TXT | `send.mail` | `v=spf1 include:amazonses.com ~all` | — | 3600 |
| TXT | `_dmarc` | `v=DMARC1; p=none;` (optional; root DMARC monitoring) | — | Auto |

After adding → Resend domain page → **Verify DNS Records**. Source of truth: Resend
account `vanbarthelemy@gmail.com` → Domains → `mail.samedaydesk.com`.

App config (already set in `.env`): `RESEND_FROM_EMAIL="SameDayDesk <hello@mail.samedaydesk.com>"`,
`RESEND_REPLY_TO=contact@samedaydesk.com`.

## B. Hostinger receiving + Gmail send-as (P6 — add when creating the `contact@` mailbox)

| Type | Name | Value | Priority | Purpose |
|---|---|---|---|---|
| MX | `@` | `mx1.hostinger.com` | 5 | Receive at contact@ |
| MX | `@` | `mx2.hostinger.com` | 10 | Receive (backup) |
| TXT | `@` | `v=spf1 include:_spf.mail.hostinger.com ~all` | — | Authorize Hostinger send (covers Gmail send-as) |
| TXT/CNAME | `hostingermail-a/b/c._domainkey` | (auto from hPanel) | — | Hostinger DKIM |

Hostinger "Connect automatically" writes the §B records in one click (domain is on
Hostinger nameservers). The §A root TXT `_dmarc` is shared by both senders — keep `p=none`
until reports are clean, then ramp to `quarantine` → `reject`.
