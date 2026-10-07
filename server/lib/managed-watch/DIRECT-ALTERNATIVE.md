# Direct alternative

The caller can run the same pinned change-monitor 0.1.0 archive without this host. That path is equally equipped for one source and the material-fields predicate. The caller then owns the timer, the state file, the lock, restart, and unknown-delivery reconcile. `server/lib/managed-watch/direct-alternative.mjs` runs that path and records exits.

```bash
tar -xzf server/lib/managed-watch/pins/change-monitor-0.1.0.tgz -C /tmp/l12-direct
node /tmp/l12-direct/package/src/cli.mjs subscribe --state ./var/state.json --file subscription.json --receivers ./receivers.json --now 2026-10-07T00:00:00.000Z
node /tmp/l12-direct/package/src/cli.mjs observe --state ./var/state.json --subscription moltjobs-maintained --file baseline.json --now 2026-10-07T00:00:00.000Z
node /tmp/l12-direct/package/src/cli.mjs observe --state ./var/state.json --subscription moltjobs-maintained --file baseline.json --now 2026-10-07T01:00:00.000Z
node /tmp/l12-direct/package/src/cli.mjs observe --state ./var/state.json --subscription moltjobs-maintained --file changed.json --now 2026-10-07T02:00:00.000Z
node /tmp/l12-direct/package/src/cli.mjs pause --state ./var/state.json --subscription moltjobs-maintained --now 2026-10-07T02:10:00.000Z
```

A later process that observes again while paused exits 3 and does not admit. The caller sleeps for the cadence between observes. That sleep is not counted as a public GET.

Hosted libraries that also do not schedule, and are not duplicated here:

- maintained-useful-delivery 0.3.1, sha256 `0963ce3be29185a82c0cc11aec0a8eaa3fde7d7a94a9fc6a4e9de4c3513578e5`, `paidServiceLaunch: false`, `subscriptionOffered: false`
- maintained-operations 0.1.0, sha256 `b68024a3b359b354b6869cfdc4621f1eb2947cb40311bf7bafcbd546b0cdabc9`

The staged 0.3.1 seal `d2b093c5…` is not the hosted archive and is not loaded.
