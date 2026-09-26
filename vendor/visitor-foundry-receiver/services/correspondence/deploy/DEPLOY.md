# Correspondence closed-pilot — root activation sequence
#
# Separate from the static neomorphic.io Hostinger publish.
# Do not attach a Node start command to the static site. Do not migrate the
# homepage to SSR. Do not buy provider capacity from this branch; root owns
# credentials and any Railway change.
#
# Base: public main `0656bc35a27a14c7633ae389056b14dbd5b80e6f`
#       + S23 `3cb5c53054269482917e030828be66eeacb94442`
# Branch: `codex/s29-closed-pilot-correspondence-20260909`
# Scope: deployable package + consumer operability — not a claimed production cutover.

## 0) Preflight

```bash
cd services/correspondence
node -v   # expect v22.x
npm ci
npm run build
NODE_ENV=test CORRESPONDENCE_STORE=memory \
  CORRESPONDENCE_ADMIN_TOKEN=test-admin-token-please-change-now \
  npm test
```

## 1) Runtime choice (bounded estimate; no purchase from this branch)

Reuse the existing Pilot Railway account and an existing Postgres when safe.
Otherwise a small dedicated Postgres under the same account.

Official Railway rates (https://docs.railway.com/pricing/plans):

| Resource | Official rate |
| --- | --- |
| Hobby plan | $5 / month (includes $5 usage credit) |
| Pro plan | $20 / month (includes $20 usage credit) |
| RAM | $10 / GB / month |
| CPU | $20 / vCPU / month |
| Volume storage | $0.15 / GB / month |
| Network egress | $0.05 / GB |

Bounded experiment estimate (not production, not a purchase):

- Service ≈ 0.5 vCPU + 0.5 GB RAM → ≈ $15 / month before credit
- Postgres ≈ 0.5 vCPU + 0.5 GB + 1 GB volume → ≈ $15.15 / month before credit
- Always-on pair → ≈ $30.15 / month plus egress; do not subtract a fresh credit mid-cycle
- Prefer reusing existing Pilot Postgres so only the Node service is incremental

### Rollback

Stop the correspondence service; the static site is unaffected. Rotate the administrator token and revoke issued grants. Drop only a dedicated trial database if needed, never unrelated databases. Revert the service release and clear browser tokens and the saved remote base URL.

## 2) Secrets (root-owned, mode 0600)

```bash
umask 077
mkdir -p ~/.config/neomorphic/correspondence
openssl rand -base64 32 > ~/.config/neomorphic/correspondence/admin.token
chmod 600 ~/.config/neomorphic/correspondence/admin.token
```

Browser tokens stay memory-only in the existing workbench client. No second
auth system. No public OAuth.

## 3) Database init (idempotent)

```bash
export DATABASE_URL='postgres://…'   # disposable or dedicated pilot DB only
npm run migrate                      # CREATE IF NOT EXISTS via migrations/001_init.sql
```

Re-running migrate is safe. Do not point at an unrelated production database.

## 4) Process environment

```text
NODE_ENV=production
PORT=8787
CORRESPONDENCE_STORE=postgres
DATABASE_URL=<pilot postgres url>
CORRESPONDENCE_ADMIN_TOKEN=<contents of admin.token>
CORRESPONDENCE_CORS_ORIGINS=https://neomorphic.io
CORRESPONDENCE_TRUST_PROXY=1
```

Notes:

- `CORRESPONDENCE_CORS_ORIGINS` — canonical origins only; unexpected browser
  origins denied. Loopback is not implied.
- `CORRESPONDENCE_TRUST_PROXY=1` — only behind Railway’s TLS terminator (one hop).
  Code default is `0` (ignore client `X-Forwarded-For`).
- Start: `npm start` (`deploy/railway.json`). Health: `GET /healthz`.
- Node engine: `22.x` (`package.json` engines + `nixpacks.toml` + `Dockerfile`).

## 5) Create the invited trial once

```bash
export BASE=https://<correspondence-host>

npm run pilot-trial -- create-trial \
  --base-url "$BASE" \
  --admin-token-file ~/.config/neomorphic/correspondence/admin.token \
  --state-file ~/.config/neomorphic/correspondence/trial-state.json \
  --owner-token-file ~/.config/neomorphic/correspondence/owner.token \
  --title "Closed-pilot shared task trial" \
  --summary "Invited S29 trial tenant. Not a public marketplace."

# Re-run the same command to recover an unknown outcome without a second project
# (the state file stores the immutable request and Idempotency-Key before POST).
# Exit 2 if bootstrap_recovery_required.

npm run pilot-trial -- issue-grant \
  --base-url "$BASE" \
  --state-file ~/.config/neomorphic/correspondence/trial-state.json \
  --role writer \
  --out-token-file ~/.config/neomorphic/correspondence/writer.token

npm run pilot-trial -- issue-grant \
  --base-url "$BASE" \
  --state-file ~/.config/neomorphic/correspondence/trial-state.json \
  --role reader \
  --out-token-file ~/.config/neomorphic/correspondence/reader.token
```

Hand writer/reader token files to the invited operator out of band.
Do not put bearer tokens in URLs, logs, or chat.
If a grant response is lost, the CLI leaves a pending grant-intent receipt and
refuses to create another grant automatically. Reconcile that outcome before
choosing a new explicit token path.

## 6) One-shot acceptance

Local disposable PG:

```bash
export CORRESPONDENCE_TEST_DATABASE_URL='postgres://correspondence:correspondence@127.0.0.1:5432/correspondence_test'
export CORRESPONDENCE_ADMIN_TOKEN="$(openssl rand -base64 32)"
npm run build
npm run accept:closed-pilot
```

Remote HTTPS (root supplies URL + admin token file):

```bash
export CORRESPONDENCE_ACCEPT_BASE_URL=https://<correspondence-host>
export CORRESPONDENCE_ACCEPT_ADMIN_TOKEN_FILE=~/.config/neomorphic/correspondence/admin.token
npm run accept:closed-pilot
```

Exercises the real HTTP path: health, missing-token reject, idempotent create,
dual clients, cursor after empty page then correction, cross-tenant deny, and
(local) process restart. Touches only S29-marker trial tenants. No public posts
or payment.

## 7) Point shared-task workbench at the HTTPS origin

Reuse the existing shared-task client / bootstrap replay. Set the workbench
base URL to `$BASE` after real auth — no local demo server for the second
runtime. Tokens remain memory-only in the browser session.

## Explicit non-goals

- email / outbox worker
- public OAuth or a second identity system
- object storage / callbacks / arbitrary URL fetch
- payment authority / model API keys
- Hostinger Node startup or SSR homepage migration
- provider purchases or production DB mutation from this branch
