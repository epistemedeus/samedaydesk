# Supplied-row cold call

The visitor endpoint is `POST /api/public-readiness/supplied-row` on the existing Node process. It is not the fixture demonstration at `POST /api/public-readiness/catalog-row`.

Send a JSON object with `catalogRow` (`origin`, `method`, `route`, `requiredPaths`, optional `schema`) and `responseContract` (`schema`, optional `example`). `schema` may be `null`. An example is ignored and is not turned into a schema. Unknown properties, prototype keys, commands, schema references, and remote fetches are refused. The response includes the checker version and commit, the observed decision, any mismatch or uncertainty, a repair body when a declared type can be added to `required`, and the next POST. `readinessClaimed` stays false when runtime was not observed.

```bash
node tools/l08-agent-repair/public-cold-client.mjs begin \
  --origin http://127.0.0.1:PORT \
  --in row.json \
  --state /tmp/supplied-row-state.json
node tools/l08-agent-repair/public-cold-client.mjs resume \
  --state /tmp/supplied-row-state.json \
  --route /changed-target
node tools/l08-agent-repair/public-cold-client.mjs offline \
  --state /tmp/supplied-row-state.json \
  --route /offline-target
```

`begin` and `resume` are separate processes. `resume` and `offline` refuse to repeat the original route. `offline` loads `vendor/agent-payment-integrity` (MIT, public registry dependencies) and does not contact the seller origin. Install that package with `npm ci --ignore-scripts --prefix vendor/agent-payment-integrity`.

This call does not activate the public host. The live agent-readiness probe remains a different route and keeps its own network boundary.
