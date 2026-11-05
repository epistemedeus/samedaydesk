# Maintained user route: useful-jobs via ordinary npm

Accepted finding (N5-E06 RESULT): both the pin-acquire helper and ordinary `npm install` of the hosted tarball suffice. Prefer this npm route. Do not add an installer.

Synthetic owner-run only. Not a customer, bill, live quote, or purchase authority.

## Pins (from RESULT.md)

| Pin | URL | bytes | sha256 | npm integrity |
| --- | --- | --- | --- | --- |
| B 1.4.7 (current) | https://samedaydesk.com/for-agents/useful-jobs/useful-jobs-1.4.7.tar.gz | 5255824 | `e2e9b44e4d7318ac55052953318f05e53dbc121ab02e2762e34c919ac5469dec` | `sha512-eDKT6Be1gin85rE1BmzNMVG3UGw/IwxNK1X8lzCAvo+HQLKO0vmGAc6YFRjTx73+I0rede5XaCQ+aDw+HYZzKQ==` |
| A 1.4.0 (prior) | https://samedaydesk.com/for-agents/useful-jobs/useful-jobs-1.4.0.tar.gz | 2575215 | `2b1949189f0ad2e3c1bd5f7a43f7eda800fd5f0dc3a395415689feee0419ff4f` | `sha512-OR+ZfCqQMZoEmW/UgzKWMrp4T3PoQ1PwQtdP1JtjMCKCnQNildwWkyNtzmUWNDRuyMgyBS47v46Ha/iLlZvWPw==` |

Git blob for the 1.4.7 archive at E06 head: `d8aecf276ce2eb23f4d30f5575085bc992134841`.

## Cold consumer (ordinary useful later agent)

Work in an empty directory that is not the E06 writer checkout. Node >= 22. npm writes `package.json` and the lockfile; do not hand-edit hashes on this route.

```bash
mkdir -p /tmp/useful-jobs-cold && cd /tmp/useful-jobs-cold
npm init -y
# optional sibling install if your consumer already depends on local packages
npm install
npm install "https://samedaydesk.com/for-agents/useful-jobs/useful-jobs-1.4.7.tar.gz"
# Confirm lock integrity matches the B pin above, then:
node node_modules/useful-jobs/bin/useful-jobs.mjs version
node node_modules/useful-jobs/bin/useful-jobs.mjs run vendor-budget-impact \
  --before samples/pricing/caller-alpha/before.json \
  --after samples/pricing/caller-alpha/after.json
```

Kit-relative samples live inside the installed package under `samples/`. Use `--out-dir` when you want durable output. Expected B digest for vendor-budget-impact in E06 evidence: `0ea6c814c944ec14`.

Update: `npm install` the 1.4.7 URL again (or a later published pin with its integrity). Remove: `npm uninstall useful-jobs`. After remove, invoke must exit non-zero and must not recreate `node_modules/useful-jobs`.

## Refuse

- Unknown versions such as 1.4.6 and 9.9.9: hosted HTTP 404; npm install non-zero.
- Wrong integrity / truncated body: non-zero; do not invent a recovery installer. Restore a known-good lockfile and `npm ci` if you broke `node_modules` with a bad lock.
- Discovery document still at 1.4.0 while running 1.4.7 jobs may surface `version_not_approved` through the capability binder; that is separate from this install route.

## Named later consumer

A fresh cold agent that installs useful-jobs@1.4.7 with the B integrity above, then runs `vendor-budget-impact` on supplied-row samples. That agent is not the E06 writer and not this experiment harness.

## Compounding asset

This file. Later agents reuse the npm pin and integrity instead of re-deriving an acquire helper. Upstream owners keep at most this one new useful artifact for the E06 finding.

## Fair routes

See [FAIR-ROUTES.md](./FAIR-ROUTES.md) for direct vs public-artifact vs maintained comparison (GRAND-PLAN B1).
