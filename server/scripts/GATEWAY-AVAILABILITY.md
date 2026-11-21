# Receive a paid-gateway dependency transition

Merchant recovery has an apex consumer handoff. After Root receives the configured
merchant runtime, authority and retained-state semantics, publish the complete
received state at an immutable evidence commit. Bind `received.receipt` to that
commit's receiving and state paths; retain its actual `observedAt`, source,
deployment and five evidence predicates. HTTP health 200 or a payment challenge
402 cannot establish availability. Retained-state receiving must follow the
installed expiry/claim contract: an expired authorization can be absent from
active replay while its unchanged archive and original unknown remain intact.
Never reinsert/replay that record to satisfy a receiver.

On the admitted installed-source successor, consume the handoff once:

```sh
NODE_OPTIONS=--max-old-space-size=768 UV_THREADPOOL_SIZE=1 OMP_NUM_THREADS=1 \
  node server/scripts/project-gateway-availability.js --receive RECEIVED_STATE.json
```

The producer validates the evidence and requires a strictly newer observation
than the previous state. Reusing the same receipt correctly refuses. A later
pause requires a later full receiving before restoration; never move the clock
to make old evidence pass. A normal rebuild reprojects the already received
state without receiving it again:

```sh
NODE_OPTIONS=--max-old-space-size=768 UV_THREADPOOL_SIZE=1 OMP_NUM_THREADS=1 RAYON_NUM_THREADS=1 \
  npm --prefix client run build
```

Use the existing installed lock/toolchain. The owning projection is
`client/public/llms.txt`'s marked block and `discovery/paid-gateway.json`.
`server/lib/paid-gateway-availability.js` also feeds dynamic `/skill.md`,
`/openapi.json`, `/.well-known/api-catalog`, `/.well-known/agent-card.json` and the
runtime descriptor. The existing task router shares its refusal. Receive every
one of those consumers, including dynamic skill output, rather than stop at a
healthy merchant or regenerated static file. Other service availability and
MPP/Vibes flags have their own qualification; do not infer them here.

```sh
NODE_OPTIONS=--max-old-space-size=768 UV_THREADPOOL_SIZE=1 OMP_NUM_THREADS=1 \
SAMEDAYDESK_CLIENT_DIST="$PWD/client/dist" \
  node --test --test-concurrency=1 \
  server/scripts/test-gateway-availability.js \
  server/scripts/test-machine-discovery-journey.js \
  server/scripts/test-machine-guide-links.js \
  server/scripts/test-spa-route-shells.js server/scripts/test-spa-fallback.js \
  tools/offer-routing/route-job.test.mjs tools/offer-routing/review.test.mjs
```

Keep a same-source, same-input preimage before receiving and rebuilding. Compare
all emitted files as raw bytes, including human HTML and JS/CSS/assets; unchanged
templates alone do not establish preservation. The gateway producer already owns
only machine consumers, so this transition needs no human redesign or partition.
Root owns the managed release using current private source succession, provider
preimage and actual frontend inputs. Receive installed source/build, all machine
responses and unchanged hosted human output separately. Source/build/fixtures
are neither hosted restoration nor customer/revenue evidence.
