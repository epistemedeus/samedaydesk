# SkillGuard Watch private enrollment

The existing hourly-capable Hostinger scheduler can run `server/scripts/skill-watch-tick.mjs` once per hour. The command uses the existing Care database role, paid periods, mail claims and SameDayDesk sender. It requires no migration, installed worker or GitHub credential. Keep `SDS_SKILL_WATCH_USDC` off during owned receiving. This job is separate from the managed source-projection watcher and from the receipt snapshot cron.

## Controller setup

1. Receive the exact source through the saved Node 22 Express build profile (`build:managed-foundry`, `server/index.js`, repository root, default output). Verify the deployed command exists under the live source path before scheduling it. Preserve the controller's 109 received environment values, including the seven legacy offers, Report and Care. Keep Watch off. Existing terms and issued quotes do not need any change.
2. Obtain [SkillGuard v1.3.0](https://github.com/epistemedeus/skillguard/releases/tag/v1.3.0) `index.js` from the [immutable Git commit](https://github.com/epistemedeus/skillguard/blob/14705f72f8daa56f986401554783992a598b0f08/index.js), 13,298 bytes, SHA-256 `0db78baedbf2b475d8cf762608e5bcee12b05e53a93e8e8b29b58d6f1af6f79f`. Verify the bytes before saving a regular 0600 file under a private 0700 directory. Set only `SKILLGUARD_SOURCE` to its absolute path, for example `/home/u188979531/.samedaydesk-skill-watch/skillguard-v1.3.0-index.js`.
3. Reuse `SDS_CARE_CHECKOUT`, `SDS_CARE_DATABASE_URL`, `SDS_CARE_DATABASE_CA_BASE64`, `SDS_CARE_SCHEMA`, `SDS_CARE_ACCESS_SECRET`, `RESEND_API_KEY`, `RESEND_FROM_EMAIL` and the optional `RESEND_REPLY_TO`. Do not pass credential values as arguments. Use the existing protected complete-env broker to enroll the scanner path without replacing other values.
4. Run the exact command once. Read its JSON and exit status. Save the same one-command native cron at minute 17 every hour, UTC, after the command is verified. The command uses the current deployment symlink and the protected dotenv file.

```sh
/opt/alt/alt-nodejs22/root/usr/bin/node --env-file=/home/u188979531/domains/samedaydesk.com/hbuilds/config/.env /home/u188979531/domains/samedaydesk.com/hbuilds/current/nodejs/server/scripts/skill-watch-tick.mjs
```

## Receive and roll back

- The controller received zero production Watch orders, paid periods or pending alerts. Receive the actual installed cron's empty canary separately. Its expected receipt has zero claims, upstream requests and Watch mail. Use the isolated owner QA below for actual inbox delivery before changing the public Watch flag.
- One tick claims up to eight repositories, one at a time. Care records the claim in `care_periods.report.watchSchedule`, while `report.releases` and other report fields survive. Unvisited active repositories come first, followed by the least recently claimed. A claim records scheduling progress even when the repository is unsupported or its response is empty or failed. On rate limits or exhaustion the tick stops, leaving unattempted repositories in their previous positions. The next hourly tick resumes from PostgreSQL, including after a restart. An unreceived checkpoint stops the tick. Inspect the stored state rather than replaying the claim.
- The runner retains the limits of ten recent releases per repository, 45 upstream requests and two minutes for upstream reads. Unsupported repositories, incomplete pages and exhausted budgets surface as issues. The existing manual release consumer remains available for a larger verified Git snapshot. Each acquisition rejects redirects, private DNS, mismatched refs and blob identities, nonregular files, truncated trees and excessive sizes. The worker removes its own snapshot and executes only the digest-pinned scanner.
- The existing mail sender claims only `skill_watch_alert` messages during this job. A deferred or timed-out provider response is unresolved. Receive the original outbox claim, acceptance and provider idempotency key before taking action. The existing five-minute retry due time and 23-hour same-key window still apply. Do not reset those claims or replay an unknown send manually. A zero count does not prove that a prior deferred item was delivered.
- To pause, disable this one cron entry, leave the public Watch flag off and preserve original paid periods, observations and outbox claims. If removing the scanner, remove only its pointer from the full environment. No other mail kind, receipts job or database migration depends on this entry.

### Controller-only owner inbox receiving

On the controller's protected host, use the exact qualified source and the same disposable PostgreSQL setup as [`care-preview-test.sh`](../scripts/release/care-preview-test.sh). Keep the test database and receipts until acceptance is reconciled. Use only a private 0700 socket directory (`WATCH_QA_DIR`), no TCP listener, and enroll a separate `sds_watch_owner_qa` schema and `sds_watch_owner_qa_app` role with `node server/scripts/care-enrollment.mjs sds_watch_owner_qa sds_watch_owner_qa_app`. In that new database only, seed the following single synthetic period. No money moves and no production Care record is created.

```sql
begin;
insert into sds_watch_owner_qa.care_orders
  (id,offer,amount_cents,live_mode,checkout_expires_at,checkout_origin,integration_id,state,rail_email,intake)
values ('140f9929-52ac-435f-abcb-11f5a0896d01','legacy_skill_watch',1200,false,now(),
  'https://samedaydesk.com','synthetic-watch-owner-qa','paid','contact@samedaydesk.com',
  '{"repositories":["https://github.com/epistemedeus/skillguard"]}');
insert into sds_watch_owner_qa.care_periods(invoice_id,order_id,period_start,period_end)
values ('synthetic-watch-owner-inbox','140f9929-52ac-435f-abcb-11f5a0896d01','2026-06-23T00:00:00Z','2026-07-23T00:00:00Z');
commit;
```

Use `WATCH_QA_MAIL_ENV_FILE` for an existing controller-owned 0600 dotenv file containing the enrolled `RESEND_API_KEY`, `RESEND_FROM_EMAIL` and optional `RESEND_REPLY_TO`. Keep it on the controller host. `WATCH_QA_SCANNER` points to the verified scanner. The command uses the existing recipient-restricted Resend preview with the static historical fixture clock. Run once on the fresh database and retain its JSON and exit status together with the exact source pin.

```sh
env -i HOME="$HOME" PATH="$PATH" node --input-type=module - "$WATCH_QA_DIR" "$WATCH_QA_SCANNER" "$WATCH_QA_MAIL_ENV_FILE" <<'NODE'
import assert from 'node:assert/strict';
import { lstat } from 'node:fs/promises';
import { isAbsolute } from 'node:path';
const [socket, scanner, envFile] = process.argv.slice(2);
assert([socket, scanner, envFile].every(path => path && isAbsolute(path)));
const dir = await lstat(socket), env = await lstat(envFile);
assert(dir.isDirectory() && dir.uid === process.getuid() && (dir.mode & 0o777) === 0o700);
assert(env.isFile() && env.uid === process.getuid() && (env.mode & 0o777) === 0o600);
process.loadEnvFile(envFile);
delete process.env.SDS_PREVIEW_MAIL_OUTBOX;
Object.assign(process.env, {
  SDS_PRIVATE_PREVIEW: '1', SDS_PREVIEW_RESEND: '1', SDS_CARE_CHECKOUT: '1',
  SDS_CARE_SCHEMA: 'sds_watch_owner_qa', SDS_CARE_ACCESS_SECRET: 'synthetic-watch-owner-inbox-scope-only',
  SDS_CARE_DATABASE_URL: `postgresql://sds_watch_owner_qa_app@127.0.0.1/postgres?host=${encodeURIComponent(socket)}&port=55493`,
  SKILLGUARD_SOURCE: scanner,
});
const { runConfiguredSkillWatchTick } = await import('./server/scripts/skill-watch-tick.mjs');
const receipt = await runConfiguredSkillWatchTick({ at: new Date('2026-06-25T00:00:00Z') });
console.log(JSON.stringify(receipt));
if (!receipt.ok) process.exitCode = 1;
NODE
```

Read `report.releases` on `synthetic-watch-owner-inbox` and the associated `care_mail` row by `details->>'invoiceId'`. Receive the same original provider ID and actual `contact@samedaydesk.com` inbox message with repository, commit `14705f72f8daa56f986401554783992a598b0f08` and the rule lines. Provider acceptance and inbox delivery are separate receipts. Once accepted, repeat against the same disposable database and require zero additional observations, alerts and sends. If acceptance is unknown, retain the database and claim and reconcile the original provider result without manually replaying the send. Record separately the source, synthetic period and clock, public upstream facts, actual owner message and production empty cron.
