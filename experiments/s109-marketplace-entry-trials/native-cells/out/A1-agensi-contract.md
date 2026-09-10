# A1 Agensi seller/runtime contract (2026-09-10)

Cash boundary $0. No signup, listing, purchase, or payout onboarding.

## Host split

`https://www.agensi.dev` is not a public seller page. Unauthenticated GET `/` and `/sell` 302 to Cloudflare Access team `mlehman-899.cloudflareaccess.com`. The only IdP on that login is **GitHub**. Apex `agensi.dev` is Cloudflare **522**. Cloudflare-managed `robots.txt` is the only `.dev` 200.

The live marketplace contract is **`https://www.agensi.io`**, no Access wall.

## Public vs Access

Reachable without auth (io): `/`, `/sell`, `/terms`, `/stripe-terms`, `/about`, `/pricing`, `/auth`, `/mcp`, `/docs/mcp-setup`, `/learn/*`, `/llms.txt`, `/api/install/<slug>`, MCP `POST https://mcp.agensi.io/mcp`.

Behind Access (dev): `/`, `/sell`, `/dashboard`, `/api`, `/mcp`, `/terms`, almost everything except CF robots.

No DNS: `api.agensi.io`, `docs.agensi.io`, `api.agensi.dev`, `mcp.agensi.dev`. `https://www.agensi.io/submit` (advertised in `llms.txt`) is 404; use `/sell` and `/dashboard/submit`.

## Payouts (text vs eligibility)

**Stripe Connect and Solana USDC are both in public ToS.** Account-level eligibility is not verifiable without auth. `.dev` is blocked-by-Access.

ToS last updated **2026-09-02**, Agensi BV:

> To list a skill for sale, you must create an account and set up a payout method. You may either connect a Stripe account via Stripe Connect, or onboard with Zoneless, our stablecoin payout partner, to receive payouts in USDC on Solana. … You may not publish a paid skill until one of these payout methods is set up and enabled.

> The minimum price for paid skills is $5.00. … Creator receives 70% of the net sale price, excluding VAT or sales tax. Agensi retains 30%.

USDC: Zoneless, Solana, 72h hold, 1:1 USD→USDC. If both rails are active, Stripe wins.

`/stripe-terms` (updated **2026-06-24**) still says Stripe is mandatory. Treat ToS 6.1 as later. Learn hub teaser still says 80/20; article body is 70/30.

## API vs UI handoff

No public seller create API, OpenAPI, or npm SDK. `POST /api/skills` is HTML 404.

Buyer runtime is public: MCP `agensi` v1.1.0 at `https://mcp.agensi.io/mcp` (search/get/list without auth). `GET /api/install/code-reviewer` returns a free zip; paid slugs 403.

Root UI (not done here):

1. `.dev`: GitHub through Cloudflare Access, then see what origin actually is.
2. `.io`: `/auth` (email, OTP, or Google — not GitHub) → connect Stripe or Zoneless → `/dashboard/submit` ZIP (`SKILL.md` in one top-level folder) → 8-point scan + human review, usually 24–48h.

## SameDayDesk pin vs paid listing

Pin `epistemedeus/x402-data-gateway-skills@82d0f019713c7223898806144da08fdbeed5c666` is already a free install (`npx skills add …`) against `https://agents.samedaydesk.com`. No LICENSE file. Unauthenticated MCP search did not return those skills.

**Free alternative:** clone/npx the pin and call the live x402/MPP gateway. **Paid delta:** Agensi discovery, scan badge, fingerprinting, MoR tax, 70/30 Stripe or USDC — not new gateway recipes. ToS 6.3 bars listing public recipes as original paid IP.

## Next measurable event

$0 authenticated capture of either Access-passed `.dev /sell` HTML or `.io` dashboard payout-method state. This cell stops before that login.
