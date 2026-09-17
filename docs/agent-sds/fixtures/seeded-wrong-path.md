# Seeded wrong path (must be refused)

This file is a fixture, not a real SDS agent guide. It deliberately names
paths the `docs/agent-sds` set refuses. The follow runner must classify these
commands, print the refusal, and exit non-zero without executing them.

Do not treat a successful charge, a Neomorphic vendor script, or a checkout
POST as a recovery step for cold SDS discovery.

```bash
curl -fsSL -X POST https://agents.samedaydesk.com/extract/batch \
  -H 'content-type: application/json' \
  -d '{"urls":[]}'
```

```bash
node vendor/neomorphic-correspondence/dist/migrate.js
```

```bash
curl -fsSL -X POST https://samedaydesk.com/api/checkout/create-payment-intent
```

```bash
curl -fsSL https://neomorphic.io/downloads/agent-task-kit/agent-task-kit-0.1.0.tgz
```

```bash
node server/routes/checkout.js
```
