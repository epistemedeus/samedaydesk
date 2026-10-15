# Examples

These files are operator fixtures. They do not subscribe to a paid plan and
they do not call a remote host.

| File | Use |
| --- | --- |
| `subscription.release-gate.json` | Opt-in subscription for `release-gate:route-lock@0.1.0`. The destination is the receiver id `local-vm`. |
| `subscription.source-projection.json` | Opt-in subscription for one maintained source, `source-projection:moltjobs`. |
| `rejected-url-subscription.json` | Seeded rejection. `subscribe` exits 2 because `destination.url` is present. |
| `unavailable-not-zero.json` | Supplied fixture (`capture: "fixture"`). Availability is `unavailable` and `jobCount` is `0`. That `0` must not become a content change. It is not a live capture. |
| `cold-consumer.mjs` | Reads a state file, prints consumable events, and can acknowledge accepted deliveries. |
| `loopback-receiver.mjs` | Enrolled local receiver. Binds `127.0.0.1` on an ephemeral port and prints `{ "baseUrl" }`. |
| `cold-install.mjs` | Copies this package into a second directory, GETs public Release Gate 0.1.4, and runs the public-baseline, seeded-change, restart, correct, pause, and cancel journey. The seed is not natural customer demand. `delivered` stays false until the loopback receiver accepts the event. |

The receivers file is separate operator config. The CLI accepts only
`local-http` origins on `127.0.0.1` or `localhost`.

```bash
node examples/cold-consumer.mjs --state ./var/state.json --subscription rg-route-lock
node examples/cold-install.mjs --dest /tmp/change-monitor-cold
```

Pass `--ack --by <name>` to acknowledge deliveries that are already `accepted`.
Acknowledgement does not create delivery success.
