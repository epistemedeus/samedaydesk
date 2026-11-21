# Human-facing changes

Homepage copy, offers, layout and design changes need the operator's review before publication. Prepare a focused diff or preview; do not merge or deploy those changes without that review. Keep agent and backend development independent.

# Selling rules and the live design

Every word on a page or machine file follows `design/SELLING-RULES.md`: say what the visitor gets, the price and the next action, for a reader who has never heard of MCP or x402 first and an engineer second. No internal names, no statements of what we are not, no status words or zeros. `npm run build` ends with `npm run check:copy`, which renders every public route and fails on a blocked finding.

Design work starts from `design/BASELINE.md`. Its keep list is binding (the reticle, the drafting frame, both themes, the FIG. labels, the offer cards, GSAP with Lenis); `npm run test:keep-list` guards it.
