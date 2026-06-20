# SameDayDesk — landing update plan (post sales-playbook) · 2026-06-20

The site is already strong and on-strategy (same-day, teaser-first, server-authoritative pricing, named-guarantee + proof sections). These are **conversion-leverage** updates from the Hormozi distillation — not a redesign. Prioritized P0→P2. The site is supporting cast; **don't let polishing it delay outreach.**

## P0 — highest leverage, do first
1. **Cut teaser friction (the #1 lever).** Hero/How-It-Works CTA currently routes `to="/signup"`. Cold traffic won't create an account to *see a free sample*. Let them request the teaser with **just an email + paste/upload** (role, job link, current file); create the account at payment time, not before. Files: `components/Hero.tsx`, `components/HowItWorks.tsx`, `pages/Auth.tsx`, `routes/teaser.js`.
2. **Honest capacity scarcity.** Add "Only **5 free teasers/day** — N left today" near the hero CTA and How-It-Works. True (we batch), Hormozi's most ethical scarcity. Static N is fine to start; later wire to a real daily counter.
3. **Name the guarantees.** Rename the generic guarantee → **"The 'More Interviews or I Keep Working' Guarantee"** (career), and add **"It Reads Better or You Don't Pay"** (copy) + **"It Runs or It's Free"** (code). Files: `components/Guarantee.tsx`.

## P1 — offer depth (restructure the catalog)
4. **Tier the flagship good-better-best with a high anchor.** Replace flat résumé $59 + bundle $79 with: **Refresh $49** (résumé only) · **Reboot $89** (résumé + LinkedIn + ATS Match Report — "Most popular") · **Career Relaunch $149** (everything + cover + 2 tailored versions + recruiter outreach pack). The $149 anchor makes $89 the obvious pick. Update BOTH `client/src/lib/services.ts` AND `server/pricing.js` (server-authoritative), and the **live Stripe products** to match.
5. **Value-stack each card.** Show named bonus line-items with crossed-out "$X value" summing high, then the price (e.g. "$360 value · today $89"). Bonuses are cheap for us to deliver: ATS Match Report, 15-sec Recruiter Hook template, one free revision.
6. **Promote a Code/Data card** out of "Something else?" into a real offer: "Same-Day Bug-Squash / Data Cleanup — from $69 · *It Runs or It's Free*."

## P2 — proof & objection-handling
7. **More proof.** Add 2–3 anonymized before/afters from `pilot/assets/sample-proof.md` beside the existing ticket animation; add real testimonials as we earn them.
8. **FAQ** with playbook objection-handling (Is this AI? Why pay upfront? How fast? Is it legit?).
9. **Custom Order checkout path.** Wire the "Tell us the task" flow to the LIVE "customers choose what to pay" Payment Link (or a server Checkout Session w/ operator-set amount).

## Cross-cutting
- Keep prices identical across `services.ts`, `pricing.js`, and live Stripe (server re-validates at fulfillment — mismatch = failed orders).
- Pricing/Stripe model rationale: see `pilot/plan/PLAN.md` → Payment model.
