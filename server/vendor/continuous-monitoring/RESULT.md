Imported only this service from `0ad6691f79225cfba782971a910c0e79d371c8f3`.
Repaired dispatch/revocation fences, elapsed deadlines and runtime arithmetic,
foreign/linked store acceptance, projection crashes, missing/duplicate metrics
and notification error privacy. Existing foundation source is reused unchanged.

- Branch: `codex/ae18-service-review-243002`.
- Validated implementation head: `4248874f2fa63636659fad164fb29ed193018104`;
  subsequent result/evidence-only commit changes no runtime.
- Actual tests: original **22/22** reproduced; final **36/36**, including cold
  source/demo, real processes/sockets, upload role rotation and live old-worker
  lease recovery. Rendered systemd recipes verify; none were installed.
- Offline foundation **4/4** passes. Full inherited foundation remains **4 pass,
  1 fail** because its live baseline assumption rejects current partial metrics.
  Final public read: 33,783 bytes / 630 ms; `partial_metrics` alert acknowledged
  through the local API. [Actual evidence](evidence/receiving/VALIDATION.md).

Remaining deployment action: 243001 installs reviewed ingress/API/worker settings
on existing durable infrastructure, provisions private tenant grants, and proves
production source-to-consumer delivery. Local useful execution is verified;
production installation and paid subscription integration remain unverified.
No homepage/SameDayDesk change, live payment, automatic charge, production write,
additional model job or new provider spend occurred.
