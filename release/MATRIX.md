# SameDayDesk release matrix

The SDS lane's checklist: one row per line of the pass bar (16 §3), per priced offer and per
signed-in state. "State" is where the line stood when the foundation was laid on November 21, 2026
(from the pass bar tracker in BUILD-RECEIPTS and the foundation run). A result counts only for the
commit it names. Update the lane status file (`overview/grand-phase/release/SDS.md`), not this file,
as lines pass; refresh this file when the list itself changes.

Commands: `npm run release:check`, `npm run release:sweep -- --cheap|--key`, `npm run release:stripe`,
`node scripts/release/post-status.mjs <sha> <state> <log-url>`.

In one checkout, start Stripe after release:check's install and build gates finish; it can run
alongside the remaining gates. npm ci replaces dependencies and Vite replaces build assets, so
starting the payment preview during those writes is a startup fault. Sweeps select their own free
port and verify the private source header. `--port` is an explicit override; `--url` deliberately
targets an already-running preview. Do not stop another checkout's server to obtain a port.

Machine discovery derives the optional accepted-work collection from the existing reviewed public-read
profile. When disabled, declarations retain the offline query-key runner and omit that collection.
Care, commerce and mail writers share one database URL/TLS parser and use private Unix sockets in preview.

## A. Every page, automated (`release:sweep -- --cheap`, 51 sitemap pages)

| Line | State at foundation | How to pass |
| --- | --- | --- |
| A1 status 200 or one 301 | passed (51/51) | rerun on the final commit |
| A2 copy check 0 blocked | passed (0 blocked, warnings only) | rerun |
| A3 internal and external links | passed on `36bd5464` after composing (the Sol branch fixed the trailing-slash links); list the hosts that block bots from release/out/sweep-cheap.json in the status file | rerun |
| A4 console and failed requests on load | passed | rerun |
| A5 axe serious or critical | passed on `36bd5464` | rerun |
| A6 machine files parse and list only what works | passed on `36bd5464` | rerun |
| A7 locales | n/a (English only) | |

## B. Key pages (`release:sweep -- --key`, release/key-pages.json)

| Line | State at foundation | How to pass |
| --- | --- | --- |
| B1 captures 390, 768, 1440, both themes, reviewed | not run on the composed head | run `--key --no-lighthouse`, look at every capture, compare the homepage with `design/BASELINE.md` |
| B2 every action does what it says; no priced offer ends in an email | not run | the sweep presses every in-page button; check each checkout entry by hand once |
| B3 keyboard, focus, contrast, reduced motion | not run | the sweep records focus stops without a visible ring and long motion under reduced motion |
| B4 Lighthouse (LCP 2.5 s, CLS 0.1, TBT 200 ms, five runs, idle VM) | earlier receipt: 50/50 budgets on the earlier candidate | run on an idle VM (load under 1) on the frozen candidate |

## C. Money (Stripe test mode, `release:stripe`)

| Line | State at foundation | How to pass |
| --- | --- | --- |
| C1 success | passed (agent_front_door, hosted 4242, four records; run SDS-202611210927-8aeb9d) | rerun on the frozen candidate |
| C1 issuer decline | passed (run SDS-202611211048-5875b9) | rerun |
| C1 3D Secure pass and fail | passed (run SDS-202611211055-d69ec5) | rerun |
| C1 block | passed (run SDS-202611211048-5875b9) | rerun |
| C1 abandoned (session expired) | passed (`expire`) | rerun |
| C1 replay (one order) | passed: Stripe's own resend and a signed replay, one order | rerun |
| C1 lost response (one order) | passed (`lost-response`: same session, one row) | rerun |
| C1 refund, buyer page shows it | passed ("Payment refunded.") | rerun |
| C2 readback = shown price, per offer | passed for all four care offers | rerun |
| C2 one hosted 4242 per offer | passed for all four care offers (runs SDS-202611211058-cc56dd, SDS-202611211102-bf2f61) | rerun |
| C2 recurring: renewal by test clock, cancellation | not built | add a `renewal` case (test clock) and a `cancel` case (portal) for keep_it_working |
| C4 receipt email in our mailbox, SPF/DKIM/DMARC pass; bounce recorded | not run | Resend test addresses and our own mailbox only |

### Per offer (release/offers.json)

| Offer | Price | Readback | Hosted 4242 | Notes |
| --- | --- | --- | --- | --- |
| agent_front_door | 249 USD | passed | passed | |
| machine_payment_route | 499 USD | passed | passed | |
| agent_storefront | 999 USD | passed | passed | |
| keep_it_working | 100 USD a month | passed | passed | renewal and cancellation cases to add |
| task quote | set per quote | not in harness | not in harness | payment link from `issue-task-quote.mjs`; add an adapter case |
| x402 seller report | 490 USD | not in harness | not in harness | payment link (`SDS_TEST_SELLER_CONFORMANCE_LINK`); add a case |
| account checkout (`/checkout`) | per product | not in harness | not in harness | PaymentIntent fulfilment; map each product |

### Signed-in and capability states

C4 mail: a private preview defaults to the synthetic outbox. For the authorized external test,
set `SDS_PREVIEW_RESEND=1`, supply `RESEND_API_KEY` and remove `SDS_PREVIEW_MAIL_OUTBOX`. This route
permits only Resend's delivered/bounced/complained test addresses and `contact@samedaydesk.com`;
it rejects customer addresses, cc/bcc and other-brand senders before calling the provider. Install
`0015_mail_events.sql` in Supabase and the preview Care database. `RESEND_WEBHOOK_SECRET` verifies
raw provider signatures at `/api/webhooks/resend`; the signed event ID is stored once in
`public.mail_events`, without recipients or message bodies. An unavailable store returns 503.
`node --test server/scripts/test-resend-preview.mjs` and the Care PostgreSQL acceptance cover
the boundary. They are synthetic tests, not the required real Resend delivery or inbox headers.

| Screen | State | Fixture | At foundation |
| --- | --- | --- | --- |
| /care/intake | paid | `release:stripe --cases success` | buyer screen captured ("Paid: 249 USD.") |
| /care/intake | expired | `--cases expire` | captured ("This checkout expired. No payment was confirmed.") |
| /care/intake | refunded | `--cases success,refund` | captured ("Payment refunded.") |
| /care/intake | no link | none | in key pages |
| /care/subscription | paid monthly | `--offers keep_it_working --cases success` | not run |
| /dashboard | signed in | needs a test Supabase session | no fixture yet (lane adds one) |

## D, E, F, G

D: `node scripts/check-receipts-chain.mjs` reads every published settlement from Base and checks
its finalized block, USDC Transfer, authorization input, payer, amount and timestamp. It never
signs or sends a transaction. `BASE_HASH_RPC` selects an HTTPS read endpoint; failures are retained,
with no retry. Supply the admitted `RECEIPTS_PRIVATE_EXPORT` for the current hashed-wallet and
transaction exclusions. Without it, the public policy check is partial and D remains incomplete.
The report is `release/out/receipts-chain.json`. A scheduled rebuild separately needs `BASE_RPC`,
that private export and `SDS_RECEIPTS_SNAPSHOT_PATH`; the static test write is not a chain rebuild.

F4 uses migration `0014_commerce_journey.sql`: the five commerce events are persisted in
`public.journey_events`, separate from the diagnostic UI counters. Production uses the existing
server Supabase client. A private preview writes only to its loopback Care database, and every row
has `test=true`. Apply the migration to both stores before enabling the new checkout. The Care
session column binds visits, checkout creation, verified webhook payments and accepted receipt mail;
`return` means another paid order from the same verified buyer. Replays keep one row per event key.
Run `bash scripts/release/care-preview-test.sh` for the real PostgreSQL receipt, including invalid
signature rejection, mismatched-payment rejection and replay deduplication. A local mail outbox
remains synthetic evidence; the external Resend and inbox proof is still required by C4.

| Line | State at foundation | How to pass |
| --- | --- | --- |
| D accounts and data (15 §5 C) | route log export received earlier; recheck on the final head | see 15 §5 C |
| E agents: cold agent by CLI, MCP, HTTP, test-mode payment | not run on the composed head | temporary tunnel, fresh runner |
| F1 test error in the tracker tagged preview | not run | |
| F2 uptime heartbeat ready | earlier receipt (private receiver) | |
| F3 rollback rehearsed | earlier receipt (staging workflow) | rerun on the final commit |
| F4 five journey events, flagged as tests | not run | |
| G `release:check` green and status posted | 9/9 passed on `36bd5464`; receipt pushed for the controller (16 §4) | on the final commit: run, push `previews/samedaydesk/release/check-<sha>.log`, the controller posts |
