# Focused integration suggestion for Root and CLI owner

No reserved human-facing file is modified in this branch.

1. Receive the gateway package and the focused SameDayDesk host patch. Activate
   the zero-payment configuration on the existing Node host, then run the
   readiness and actual authenticated free caller commands in `RUNBOOK.md`.
2. Retain production health/discovery, exact receipt ID and restart readback
   evidence. Update only `public/machine/machine-gateway.json` with the observed
   endpoint and deployment SHA. Until then its state remains
   `prepared-not-deployed` with no verified live URL.
3. The CLI owner can read `/v1/discover` and its schema links, obtain a scoped
   bearer, request a bound quote and persist the same key before executing.
   Handle 202/running and recover through authenticated receipt readback.
4. Root can prepare a separate focused preview for the Machine gateway row in
   `commerce.astro` after observing the actual host. Suggested factual boundary
   for that future preview: “Authenticated free routes; paid routes disabled.”
   Human copy/navigation changes still need operator review before publication,
   per the owning `AGENTS.md`. This branch does not propose changing homepages.

No main push, production deployment, live payment, or new hosting subscription
is part of this implementation branch.
