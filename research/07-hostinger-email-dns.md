# 07 — Hostinger Email + DNS: `contact@samedaydesk.com` (receive/forward/send-as) coexisting with Resend (send)

**Scope:** Current (2025–2026) Hostinger process to (1) create a custom mailbox `contact@samedaydesk.com`, (2) have the operator read it (forward to `vanbarthelemy@gmail.com`) and **send as it** from inside Gmail via SMTP, and (3) reconcile all DNS so Hostinger **receiving** and Resend **sending** coexist on one domain.

**Date of research:** June 2026. **Domain:** `samedaydesk.com` (Neomorphic LLC). **Operator inbox:** `vanbarthelemy@gmail.com`.

**TL;DR recommendation:** Use **Hostinger Email "Free Email"** (the free mailbox bundled with the hosting plan) for `contact@samedaydesk.com`. Point the **root-domain MX + SPF** at Hostinger for *receiving*. Create a **forwarder** `contact@ → vanbarthelemy@gmail.com` so the operator reads it. Add **"Send mail as"** in Gmail using `smtp.hostinger.com:465 SSL` so the operator can reply/send as `contact@samedaydesk.com`. Keep **Resend** on the **`send.` subdomain** (its own SPF/MX/DKIM) so it never collides with the root-domain mail records. The only record that must be *merged* by hand is the root-domain SPF — and in practice it does **not** need a Resend include, because Resend signs from the `send.` subdomain.

---

## 0. The single most important fact (why this is actually easy)

The "trickiness" everyone fears — "two SPF records will conflict", "Resend MX vs mail MX will fight" — **mostly does not happen here**, because the two systems live on **different DNS names**:

| Concern | Hostinger (receive + send-as) | Resend (transactional send) |
|---|---|---|
| MX record | on **root** `samedaydesk.com` (`mx1/mx2.hostinger.com`) | on the **`send.` subdomain** (`send.samedaydesk.com`), value `feedback-smtp.<region>.amazonses.com` |
| SPF (TXT) | on **root** `@` → `v=spf1 include:_spf.mail.hostinger.com ~all` | on **`send.` subdomain** → `v=spf1 include:amazonses.com ~all` |
| DKIM | `hostingermail-a/b/c._domainkey` (auto) | `resend._domainkey` (root) |

Because Resend's MX and SPF are on `send.samedaydesk.com`, **they are different DNS nodes** from the root `@` MX/SPF. There is **no second root-level MX**, and **no second root-level SPF**. So there is nothing to merge at the root for SPF *unless you also send transactional mail from the root domain* (you don't — Resend's "From" should be `noreply@send.samedaydesk.com` or you accept relaxed SPF alignment; see §8). DKIM keys are independent TXT records with different names and never conflict.

Sources: [Resend Managing Domains](https://resend.com/docs/dashboard/domains/introduction), [dmarc.wiki/resend](https://dmarc.wiki/resend), [Hostinger SPF article (via easydmarc)](https://easydmarc.com/blog/hostinger-email-spf-and-dkim-configuration-step-by-step-guideline/).

---

## 1. Which email product Hostinger offers now (2025–2026)

Hostinger bundles **exactly one** email product with a given hosting/domain plan — you do **not** get to mix them per domain. The three products are: **Hostinger Email**, **Titan Email**, and **Google Workspace** (paid add-on). Check which you have in **hPanel → Emails** — the plan name shows under the section.
Source: [How to Check the Email Service Included in Your Hosting Plan](https://www.hostinger.com/support/5832752-how-to-check-the-email-service-included-in-your-hosting-plan-at-hostinger/).

### 1a. Hostinger Email (the in-house product — most likely what you have)
Tiers: **Free Email**, **Business Starter**, **Business Premium**.

- **Free Email (bundled):** Since **March 18, 2025**, new Web/Cloud hosting plans include **2 free mailboxes per hosted domain for 12 months**. This is the path to use — **no extra cost**. In hPanel it appears as "Free Email" and you "Claim FREE Email."
- **Business Starter** — **~$0.99/mo per mailbox**: 10 GB storage, 10 forwarding rules, 50 aliases.
- **Business Premium** — **~$2.99/mo per mailbox**: 50 GB storage, 50 forwarding rules, 50 aliases, antivirus + advanced anti-spam.

Webmail: `mail.hostinger.com`. 30-day money-back guarantee.
Sources: [Hostinger Email pricing review](https://bloggingjoy.com/hostinger-email-hosting-review/), [Truehost pricing](https://www.truehost.com/hostinger-email-pricing/), [free mailbox change note](https://www.mybestwebsitebuilder.com/free-email-hosting).

### 1b. Titan Email (alternative bundled product on some plans)
Paid plans from **~$0.99/mo**; features include antivirus, multi-device, calendars/contacts, rich webmail; higher tiers add unlimited filters, **30 GB** storage, **50 aliases**. Some plans give a **free Titan trial** first. Webmail: `hostinger.titan.email`.
Source: [Parameters and Limits of Titan Email at Hostinger](https://www.hostinger.com/support/5326155-parameters-and-limits-of-titan-email-at-hostinger/).

### 1c. Google Workspace
A **paid** add-on (full Gmail/Drive/Meet on your domain). Overkill and unnecessary cost for a single `contact@` mailbox you're forwarding to a personal Gmail anyway. **Skip.**

### Decision
**Use the free bundled mailbox** (Hostinger Email "Free Email", or a Titan free trial if your plan bundles Titan). One mailbox is enough; the operator never logs into webmail day-to-day — they live in Gmail. The mailbox exists so that (a) it can receive, (b) the forwarder has a real source, and (c) Gmail's SMTP "Send mail as" has real credentials to authenticate against.

---

## 2. hPanel: create the mailbox `contact@samedaydesk.com` and set a password

> Path A is Hostinger Email (default). If your plan bundles Titan, the screens differ slightly but the concept is identical — see §2b.

### 2a. Hostinger Email — create mailbox
1. Log in to **hPanel** (`hpanel.hostinger.com`).
2. Top nav → **Emails**. Find `samedaydesk.com` in the list.
3. If the free mailbox isn't claimed yet, click **Claim FREE Email** (or **Buy email** for a paid tier). Pick the **Hostinger Email / Free Email** plan and the domain `samedaydesk.com`.
4. After the plan is attached to the domain: **Emails → (samedaydesk.com) → Email Accounts → Create**.
   - Email name: `contact`  → produces `contact@samedaydesk.com`.
   - Password: a strong 12+ char password (upper/lower/digit/symbol). **Store it in the password manager** — Gmail's "Send mail as" needs this exact password later.
   - Click **Create**.
5. (Reset later if needed) **Email Accounts** → find `contact@samedaydesk.com` → **Change password** (no need to know the old one).

Sources: [Create mailboxes in Hostinger Email](https://support.hostinger.com/en/articles/1583217-how-to-create-and-manage-email-accounts-for-hostinger-email), [How to use Hostinger Email](https://www.hostinger.com/tutorials/how-to-use-hostinger-email).

### 2b. Titan Email — create mailbox (only if your plan bundles Titan)
**Emails → manage Titan on the domain → Create email account** → user `contact`, set password, Create. Webmail at `hostinger.titan.email`. Same downstream forwarding/send-as steps, but use Titan's SMTP host (§6b).

---

## 3. MX records — what's required and whether Hostinger sets them automatically

**Receiving** `contact@samedaydesk.com` requires the **root domain's MX** to point at Hostinger's mail servers.

### Hostinger Email MX (root `@`)
| Type | Name | Value | Priority | TTL |
|---|---|---|---|---|
| MX | `@` | `mx1.hostinger.com` | **5** | 14400 |
| MX | `@` | `mx2.hostinger.com` | **10** | 14400 |

Source: [Hostinger Email MX Records](https://www.hostinger.com/support/4407237-hostinger-email-mx-records/).

### Titan Email MX (only if using Titan)
| Type | Name | Value | Priority |
|---|---|---|---|
| MX | `@` | `mx1.titan.email` | **10** |
| MX | `@` | `mx2.titan.email` | **20** |

Source: [Titan SPF/setup](https://support.titan.email/hc/en-us/articles/900000573186-What-are-SPF-records-and-why-are-they-important).

### Does Hostinger set them automatically?
**Yes — if the domain uses Hostinger nameservers.** In hPanel: **Emails → (domain) → Domain settings → Connect automatically → Yes, proceed.** Hostinger then auto-writes the **MX, SPF, and DKIM** records into the DNS zone. If DNS is hosted **elsewhere** (e.g., Cloudflare, another registrar), you must add the MX/SPF/DKIM by hand. Allow **up to 24 h** for propagation.
Sources: [Set Up a Domain for Hostinger Email Automatically](https://www.hostinger.com/support/8671304-set-up-a-domain-for-hostinger-email-automatically/), [DNS records overview](https://www.hostinger.com/support/email/hostinger-email-dns-records/).

> **For samedaydesk.com:** since the domain is at Hostinger, use **Connect automatically** — it writes MX + SPF + DKIM correctly in one click. Then layer Resend's `send.` records on top (they don't touch the root MX/SPF).

---

## 4. Forwarding `contact@samedaydesk.com → vanbarthelemy@gmail.com`

This is how the operator **reads** the mail (everything lands in their personal Gmail). Two options; use a **specific forwarder**, not catch-all, to avoid spam amplification.

### Create the forwarder (Hostinger Email)
1. hPanel → **Emails** → click the `samedaydesk.com` row.
2. Left sidebar → **Forwarders**.
3. **Create a forwarder.**
4. **Forward from:** `contact@samedaydesk.com` (select the mailbox). **Forward to:** `vanbarthelemy@gmail.com`.
5. Leave **"Save copies of forwarded emails"** ON (keeps a copy in the Hostinger mailbox — useful as a backup and so SMTP auth target stays "warm").
6. **Create.** Hostinger sends a **verification link** to `vanbarthelemy@gmail.com` — open Gmail and click it to activate. (External forwarders require destination confirmation.)

Sources: [Set up a forwarder for Hostinger Email](https://www.hostinger.com/support/1583221-how-to-set-up-a-forwarder-for-hostinger-email/), [Forward your emails](https://www.hostinger.com/ca/tutorials/email-how-to-forward-your-emails), [Catch-all / forwarder / alias differences](https://www.hostinger.com/support/4469114-differences-and-applications-of-catch-all-forwarder-and-email-alias-at-hostinger/).

> **Catch-all alternative** (route *every* unknown address `*@samedaydesk.com` to the inbox): Forwarders → **Create catch-all** → pick the destination mailbox → confirm via verification link. Useful later for `hello@`, `support@`, etc., but start with a single explicit forwarder. ([Catch-all guide](https://support.hostinger.com/en/articles/1583450-how-can-i-catch-all-emails-on-hpanel))

**Limitation to know:** Hostinger forwarding can be rate-limited and is subject to SPF/DMARC re-checks at Gmail (forwarded mail can occasionally be flagged because the original sender's SPF no longer aligns after the hop). Keeping a copy on Hostinger mitigates loss. ([Forwarding limitations](https://www.hostinger.com/support/email-forwarding-known-limitations-and-alternatives/))

---

## 5. The critical 2026 Gmail change — read this before choosing how the operator reads mail

**As of January 2026, Gmail removed two *inbound* features:**
- **"Check mail from other accounts" via POP3** (Gmail pulling mail from an external mailbox), and
- **Gmailify** (linking external IMAP/Yahoo/Outlook to get Gmail's spam/inbox features).

**Web-browser POP3 import and Gmailify are gone.** IMAP-adding an external account still works **only in the Gmail mobile app**.
Sources: [Hostinger note on Jan 2026 change](https://www.hostinger.com/support/4768560-how-to-set-up-hostinger-email-on-gmail-for-android-ios/), [Gmail POP3 deprecation](https://cybersecuritynews.com/gmail-drop-pop3/), [MailBridge: what still works](https://mailbridge.app/gmail-pop3/).

**What this means for us:**
- ❌ Do **not** rely on Gmail's "Check mail from other accounts" (POP3) to pull `contact@` into Gmail — it's dead on the web.
- ✅ **Use a Hostinger forwarder instead** (§4) to get inbound mail into Gmail. Forwarding is server-side and unaffected by the Gmail change.
- ✅ **"Send mail as" (outbound SMTP) is NOT affected** by the January 2026 change — it relies on authenticated SMTP, which Gmail still fully supports. This is exactly what we use in §6.

So the architecture is: **Hostinger forwarder (inbound) + Gmail "Send mail as" SMTP (outbound)** = a complete read+send experience inside one Gmail window, with no dependence on the deprecated POP3/Gmailify paths.

---

## 6. Gmail "Send mail as" (SMTP) — send as `contact@samedaydesk.com` from inside Gmail

This lets the operator pick `contact@samedaydesk.com` in the **From** dropdown when composing/replying in Gmail. Outbound goes through Hostinger's SMTP authenticated with the mailbox password from §2.

### 6a. Hostinger Email SMTP credentials
| Field | Value |
|---|---|
| SMTP server | `smtp.hostinger.com` |
| Port / security | **465 / SSL** (primary). Fallback: **587 / TLS (STARTTLS)** |
| Username | full address `contact@samedaydesk.com` |
| Password | the mailbox password set in §2 |

Source: [Email account configuration details](https://www.hostinger.com/support/1575756-how-to-get-email-account-configuration-details-for-hostinger-email/).

### 6b. Titan Email SMTP (only if using Titan)
| Field | Value |
|---|---|
| SMTP server | `smtp.titan.email` |
| Port / security | **465 / SSL** (or 587 / STARTTLS) |
| Username | `contact@samedaydesk.com` |
| Password | Titan mailbox password |

Source: [Titan IMAP/SMTP settings](https://www.mailjerry.com/titan-email-imap-settings/).

### 6c. Exact Gmail steps (do this in the operator's Gmail, logged in as `vanbarthelemy@gmail.com`)
1. Gmail → **gear ⚙ → See all settings → Accounts and Import** tab.
2. In **"Send mail as"**, click **Add another email address**.
3. **Name:** `SameDayDesk` (or "Van — SameDayDesk"). **Email address:** `contact@samedaydesk.com`. Keep **"Treat as an alias"** checked. → **Next Step**.
4. SMTP settings:
   - **SMTP Server:** `smtp.hostinger.com`
   - **Port:** `465`
   - **Username:** `contact@samedaydesk.com`
   - **Password:** the mailbox password
   - Select **"Secured connection using SSL"** → **Add Account**.
   - (If port 465/SSL errors out, retry with **Port 587** + **"Secured connection using TLS"**.)
5. Gmail emails a **confirmation code** to `contact@samedaydesk.com`. Because the forwarder (§4) routes that mailbox to `vanbarthelemy@gmail.com`, **the code arrives in the same Gmail inbox**. Open it → click the verification link **or** paste the code into the Accounts tab → **Verify**.
6. (Recommended) Set **"When replying to a message: Reply from the same address the message was sent to."** Now replies to mail received at `contact@` automatically go out *as* `contact@`.
7. Compose → click the **From** dropdown → choose `contact@samedaydesk.com`.

Sources: [Gmail: send from a different address/alias](https://support.google.com/mail/answer/22370?hl=en), [Hostinger Gmail send-as note](https://www.hostinger.com/support/4768560-how-to-set-up-hostinger-email-on-gmail-for-android-ios/), [Send mail as 2026 guide](https://forwardemail.net/en/guides/send-mail-as-gmail-custom-domain).

> **Why this is robust:** Outbound from Gmail leaves Hostinger's SMTP, so the `MAIL FROM` is a `hostinger.com` host that the root SPF (`include:_spf.mail.hostinger.com`) authorizes, and Hostinger DKIM-signs it with `hostingermail-*._domainkey`. The message passes SPF+DKIM+DMARC as `samedaydesk.com`. **No Resend involvement** in human mail.

---

## 7. DKIM for Hostinger receive/send-as

When you use **Connect automatically** (§3), Hostinger adds its DKIM keys automatically — typically three CNAME/TXT records named like `hostingermail-a._domainkey`, `hostingermail-b._domainkey`, `hostingermail-c._domainkey` (rotating keys). If managing DNS manually, copy them from **hPanel → Emails → (domain) → "Increase Email Deliverability" / Custom DKIM**.
Source: [Hostinger DKIM (via easydmarc)](https://easydmarc.com/blog/hostinger-email-spf-and-dkim-configuration-step-by-step-guideline/).

These DKIM names are **distinct** from Resend's `resend._domainkey`, so both coexist with zero conflict.

---

## 8. Resend (transactional send) records and how they coexist

Resend authenticates a domain by asking you to add records on a **dedicated sending subdomain** (default `send`, configurable). For `samedaydesk.com`:

| Type | Name (host) | Value | Notes |
|---|---|---|---|
| MX | `send` | `feedback-smtp.us-east-1.amazonses.com` | priority **10**; region suffix matches your Resend region (`us-east-1`, `eu-west-1`, etc.) — **copy the exact value Resend shows you** |
| TXT (SPF) | `send` | `v=spf1 include:amazonses.com ~all` | SPF for the **subdomain only** |
| TXT (DKIM) | `resend._domainkey` | `p=MIGfMA0...` (long key Resend gives you) | DKIM, root-level name, **no conflict** with Hostinger DKIM |
| TXT (DMARC) | `_dmarc` | `v=DMARC1; p=none; rua=mailto:dmarc@samedaydesk.com;` | one shared DMARC for the whole domain |

Sources: [Resend Managing Domains](https://resend.com/docs/dashboard/domains/introduction), [dmarc.wiki/resend](https://dmarc.wiki/resend), [Resend SPF/DKIM/DMARC setup](https://dmarcdkim.com/setup/how-to-setup-resend-spf-dkim-and-dmarc-records).

### Why there is NO SPF conflict (the key reconciliation)
- The **root** `@` has **exactly one** SPF: `v=spf1 include:_spf.mail.hostinger.com ~all` (for Hostinger receive + Gmail-via-Hostinger send-as).
- The **`send`** subdomain has **its own** SPF: `v=spf1 include:amazonses.com ~all` (for Resend).
- They are **different DNS names** → **two SPF records on two different nodes is valid**. The "only one SPF per name" rule is per-hostname; it is **not** violated here.
- The forbidden state is **two `v=spf1` TXT records on the same name** (e.g., two on root `@`). As long as Resend sends from `...@send.samedaydesk.com`, you never put `include:amazonses.com` on the root, and there is **nothing to merge**.

**SPF merge only becomes necessary IF** you decide to send Resend mail from the **root** `From` (e.g., `noreply@samedaydesk.com`) AND want strict SPF alignment. In that case you'd merge into ONE root SPF:
```
v=spf1 include:_spf.mail.hostinger.com include:amazonses.com ~all
```
(One `v=spf1`, one `~all`, both includes in the middle.) **Recommended instead:** send Resend from `noreply@send.samedaydesk.com` (or set Resend's "From" to the subdomain) and leave the root SPF Hostinger-only. DKIM (which DMARC can pass on alone with relaxed alignment) covers root-domain `From` either way.
Sources: [Merging SPF records (only one per host)](https://wpmailsmtp.com/fix-multiple-spf-records/), [combining SPF includes](https://improvmx.com/guides/combining-spf-records/).

### DMARC alignment note
Resend gives **strict DKIM alignment** (the DKIM `d=` matches `samedaydesk.com`) and **relaxed SPF alignment** (SPF domain is the `send` subdomain). DMARC passes on DKIM alone, so root-domain `From` works. Keep DMARC at `p=none` initially to monitor, then tighten to `quarantine`/`reject` after both Hostinger and Resend show consistent pass in the `rua` reports.
Source: [Resend email authentication guide](https://resend.com/blog/email-authentication-a-developers-guide).

---

## 9. FINAL DNS RECORD TABLE for `samedaydesk.com` (Hostinger receive + Gmail send-as + Resend send)

Assuming **Hostinger Email** (the free bundled product). Replace `us-east-1` and the DKIM `p=` blobs with the exact strings Resend/Hostinger display.

| # | Type | Name / Host | Value | Priority | Purpose |
|---|---|---|---|---|---|
| 1 | MX | `@` | `mx1.hostinger.com` | 5 | Receive at `contact@` (Hostinger) |
| 2 | MX | `@` | `mx2.hostinger.com` | 10 | Receive (backup MX) |
| 3 | TXT (SPF) | `@` | `v=spf1 include:_spf.mail.hostinger.com ~all` | — | Authorize Hostinger to send (covers Gmail send-as via `smtp.hostinger.com`) |
| 4 | TXT/CNAME (DKIM) | `hostingermail-a._domainkey` | (auto value from hPanel) | — | Hostinger DKIM key A |
| 5 | TXT/CNAME (DKIM) | `hostingermail-b._domainkey` | (auto value from hPanel) | — | Hostinger DKIM key B |
| 6 | TXT/CNAME (DKIM) | `hostingermail-c._domainkey` | (auto value from hPanel) | — | Hostinger DKIM key C |
| 7 | MX | `send` | `feedback-smtp.us-east-1.amazonses.com` | 10 | Resend bounce/complaint feedback |
| 8 | TXT (SPF) | `send` | `v=spf1 include:amazonses.com ~all` | — | Resend SPF (subdomain) |
| 9 | TXT (DKIM) | `resend._domainkey` | `p=MIGfMA0GCSq...` (Resend value) | — | Resend DKIM key |
| 10 | TXT (DMARC) | `_dmarc` | `v=DMARC1; p=none; rua=mailto:dmarc@samedaydesk.com; fo=1` | — | One shared DMARC policy (start at p=none) |

Notes:
- Rows **1–6** = Hostinger (receive + human send-as). Rows **7–9** = Resend (transactional send). Row **10** = shared.
- **No row is duplicated on the same name.** The two SPFs (rows 3 and 8) are on **different hosts** (`@` vs `send`) — valid.
- If you choose **Titan** instead of Hostinger Email, swap rows 1–6 for: MX `mx1.titan.email` (pri 10), MX `mx2.titan.email` (pri 20), SPF `@` `v=spf1 include:spf.titan.email ~all`, plus Titan's DKIM (`titan1._domainkey` etc. from hPanel).
- If you later send Resend from the **root** `From`, replace row 3 with the merged SPF in §8 and drop the standalone need — but the subdomain approach (rows 7–9) is cleaner; keep it.

---

## 10. Ordered, Chrome-driveable RUNBOOK

> Two browser tabs: **hPanel** (`hpanel.hostinger.com`) and **Resend** (`resend.com/domains`), plus the operator's **Gmail**. Steps are sequential; DNS edits can take up to 24 h to propagate before email flows.

**Phase A — Mailbox (hPanel)**
1. Open `https://hpanel.hostinger.com` → **Emails**.
2. On `samedaydesk.com`, click **Claim FREE Email** (or **Buy email** → Hostinger Email Free) and attach to the domain.
3. **Email Accounts → Create** → name `contact`, strong password, **Create**. Save the password.

**Phase B — Receiving DNS (hPanel, automatic)**
4. **Emails → (samedaydesk.com) → Domain settings → Connect automatically → Yes, proceed.** This writes MX (rows 1–2), SPF (row 3), DKIM (rows 4–6).
5. (If DNS is NOT on Hostinger nameservers) add rows 1–6 manually under **Domains → DNS Zone**.

**Phase C — Forwarder (hPanel)**
6. **Emails → (samedaydesk.com) → Forwarders → Create a forwarder.** From `contact@samedaydesk.com`, To `vanbarthelemy@gmail.com`, keep "Save copies" ON → **Create**.
7. Open the operator's **Gmail**, find the Hostinger verification email, click the link to **activate the forwarder**.

**Phase D — Gmail "Send mail as" (Gmail)**
8. Gmail → **Settings → Accounts and Import → Send mail as → Add another email address.**
9. Name `SameDayDesk`, address `contact@samedaydesk.com`, "Treat as alias" checked → Next.
10. SMTP: `smtp.hostinger.com`, port **465**, username `contact@samedaydesk.com`, the mailbox password, **SSL** → **Add Account**. (Fallback 587/TLS.)
11. Gmail mails a confirmation code → it forwards into the same Gmail inbox (thanks to Phase C) → **verify**.
12. Set **"Reply from the same address the message was sent to."**

**Phase E — Resend sending DNS (Resend + hPanel)**
13. In Resend → **Domains → Add Domain** → `samedaydesk.com`. Resend shows the `send.` MX + SPF and `resend._domainkey` DKIM.
14. In hPanel **Domains → DNS Zone**, add rows 7, 8, 9 **exactly** as Resend shows (copy region + key blobs verbatim).
15. Back in Resend → **Verify** (turns green once DNS propagates).

**Phase F — DMARC + verification**
16. Add row 10 (`_dmarc` → `v=DMARC1; p=none; rua=mailto:dmarc@samedaydesk.com; fo=1`).
17. **Test inbound:** email `contact@samedaydesk.com` from a phone → confirm it lands in `vanbarthelemy@gmail.com`.
18. **Test send-as:** in Gmail compose, pick From `contact@samedaydesk.com`, send to a Gmail/Outlook test address → check headers show SPF=pass, DKIM=pass, DMARC=pass (use Gmail "Show original").
19. **Test Resend:** trigger a transactional send from the app; in Resend logs and the recipient's "Show original", confirm DKIM `d=samedaydesk.com` pass and SPF (relaxed) pass.
20. After ~1–2 weeks of clean `rua` reports, tighten DMARC to `p=quarantine` then `p=reject`.

---

## 11. Gotchas / pitfalls

- **Don't add a second SPF on the root.** If you ever paste `include:amazonses.com` onto `@`, merge it into the single root SPF — never create two `v=spf1` TXT on `@`. ([wpmailsmtp](https://wpmailsmtp.com/fix-multiple-spf-records/))
- **Forwarder needs destination confirmation** — the click in Gmail is mandatory or no mail flows. ([forwarder guide](https://www.hostinger.com/support/1583221-how-to-set-up-a-forwarder-for-hostinger-email/))
- **Gmail send-as verification code** only arrives if the forwarder (Phase C) is live first. Do Phase C before Phase D.
- **Don't try Gmail's "Check mail from other accounts" (POP3)** — removed Jan 2026; use the forwarder. ([cybersecuritynews](https://cybersecuritynews.com/gmail-drop-pop3/))
- **Region in Resend MX** (`us-east-1` vs `eu-west-1`) must match your Resend account region — copy it exactly. ([Resend](https://resend.com/docs/dashboard/domains/introduction))
- **Propagation** up to 24 h; verify with `dig MX samedaydesk.com`, `dig TXT samedaydesk.com`, `dig TXT send.samedaydesk.com`, `dig TXT resend._domainkey.samedaydesk.com` before assuming a misconfig.
- **Trailing dots / spaces** in MX values break delivery — paste cleanly. ([Hostinger MX article](https://www.hostinger.com/support/4407237-hostinger-email-mx-records/))
- **Titan plan?** If your hosting bundles Titan instead of Hostinger Email, every step is the same but use Titan MX (`mx1/mx2.titan.email`, pri 10/20), Titan SPF (`include:spf.titan.email`), and Titan SMTP (`smtp.titan.email:465 SSL`).

---

## 12. Sources
- Hostinger — [Email service included in plan](https://www.hostinger.com/support/5832752-how-to-check-the-email-service-included-in-your-hosting-plan-at-hostinger/)
- Hostinger — [Create/manage email accounts](https://support.hostinger.com/en/articles/1583217-how-to-create-and-manage-email-accounts-for-hostinger-email)
- Hostinger — [Email account configuration details (IMAP/SMTP)](https://www.hostinger.com/support/1575756-how-to-get-email-account-configuration-details-for-hostinger-email/)
- Hostinger — [Email MX records](https://www.hostinger.com/support/4407237-hostinger-email-mx-records/)
- Hostinger — [Set up domain for Hostinger Email automatically](https://www.hostinger.com/support/8671304-set-up-a-domain-for-hostinger-email-automatically/)
- Hostinger — [Set up a forwarder](https://www.hostinger.com/support/1583221-how-to-set-up-a-forwarder-for-hostinger-email/) · [Catch-all](https://support.hostinger.com/en/articles/1583450-how-can-i-catch-all-emails-on-hpanel) · [Forwarder/alias/catch-all differences](https://www.hostinger.com/support/4469114-differences-and-applications-of-catch-all-forwarder-and-email-alias-at-hostinger/) · [Forwarding limitations](https://www.hostinger.com/support/email-forwarding-known-limitations-and-alternatives/)
- Hostinger — [Gmail setup + Jan 2026 POP3/Gmailify deprecation note](https://www.hostinger.com/support/4768560-how-to-set-up-hostinger-email-on-gmail-for-android-ios/)
- Hostinger Email pricing/specs — [bloggingjoy review](https://bloggingjoy.com/hostinger-email-hosting-review/) · [Truehost pricing](https://www.truehost.com/hostinger-email-pricing/) · [free mailbox change](https://www.mybestwebsitebuilder.com/free-email-hosting)
- Titan — [Parameters/limits at Hostinger](https://www.hostinger.com/support/5326155-parameters-and-limits-of-titan-email-at-hostinger/) · [SPF / setup](https://support.titan.email/hc/en-us/articles/900000573186-What-are-SPF-records-and-why-are-they-important) · [IMAP/SMTP settings](https://www.mailjerry.com/titan-email-imap-settings/)
- Hostinger SPF/DKIM — [easydmarc step-by-step](https://easydmarc.com/blog/hostinger-email-spf-and-dkim-configuration-step-by-step-guideline/)
- Resend — [Managing Domains](https://resend.com/docs/dashboard/domains/introduction) · [Email authentication guide](https://resend.com/blog/email-authentication-a-developers-guide) · [dmarc.wiki/resend](https://dmarc.wiki/resend) · [dmarcdkim Resend setup](https://dmarcdkim.com/setup/how-to-setup-resend-spf-dkim-and-dmarc-records)
- Gmail — [Send mail as a different address/alias](https://support.google.com/mail/answer/22370?hl=en) · [Send-as 2026 guide](https://forwardemail.net/en/guides/send-mail-as-gmail-custom-domain)
- Jan 2026 Gmail POP3 change — [cybersecuritynews](https://cybersecuritynews.com/gmail-drop-pop3/) · [MailBridge: what still works](https://mailbridge.app/gmail-pop3/)
- SPF merging — [wpmailsmtp](https://wpmailsmtp.com/fix-multiple-spf-records/) · [improvmx](https://improvmx.com/guides/combining-spf-records/)
