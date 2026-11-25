# SkillGuard Watch private enrollment

The existing Hostinger scheduler runs `server/scripts/skill-watch-tick.mjs`. The command uses the existing Care database role, paid periods, mail claims and SameDayDesk sender. It requires no migration, installed worker or GitHub credential. Preserve the current public Watch configuration and use disposable data for owned checks. This job is separate from the managed source-projection watcher and from the receipt snapshot cron.

## Controller setup

1. Receive the exact source through the saved Node 22 Express build profile (`build:managed-foundry`, `server/index.js`, repository root, default output). Verify the deployed command exists under the live source path. Preserve the controller's current complete environment, including Watch, the seven legacy offers, Report and Care. Existing terms and issued quotes do not need any change.
2. Obtain [SkillGuard v1.3.0](https://github.com/epistemedeus/skillguard/releases/tag/v1.3.0) `index.js` from the [immutable Git commit](https://github.com/epistemedeus/skillguard/blob/14705f72f8daa56f986401554783992a598b0f08/index.js), 13,298 bytes, SHA-256 `0db78baedbf2b475d8cf762608e5bcee12b05e53a93e8e8b29b58d6f1af6f79f`. Verify the bytes before saving a regular 0600 file under a private 0700 directory. Set only `SKILLGUARD_SOURCE` to its absolute path, for example `/home/u188979531/.samedaydesk-skill-watch/skillguard-v1.3.0-index.js`.
3. Reuse `SDS_CARE_CHECKOUT`, `SDS_CARE_DATABASE_URL`, `SDS_CARE_DATABASE_CA_BASE64`, `SDS_CARE_SCHEMA`, `SDS_CARE_ACCESS_SECRET`, `RESEND_API_KEY`, `RESEND_FROM_EMAIL` and the optional `RESEND_REPLY_TO`. Do not pass credential values as arguments. Use the existing protected complete-env broker to enroll the scanner path without replacing other values.
4. Use the controller's existing Hostinger authentication to read `GET /api/hosting/v1/accounts/u188979531/cron-jobs` and match the command below. Receive the returned schedule and the existing job's `GET /api/hosting/v1/accounts/u188979531/cron-jobs/{uid}/output`. The intended schedule is `17 * * * *` UTC. Keep the received job if it matches. The command uses the current deployment symlink and the protected dotenv file. [Hostinger cron API](https://github.com/hostinger/api-php-sdk/blob/main/docs/Api/HostingCronJobsApi.md)

```sh
/opt/alt/alt-nodejs22/root/usr/bin/node --env-file=/home/u188979531/domains/samedaydesk.com/hbuilds/config/.env /home/u188979531/domains/samedaydesk.com/hbuilds/current/nodejs/server/scripts/skill-watch-tick.mjs
```

## Receive and roll back

- The controller's prior receiving recorded an installed empty cron run and a private source alert with zero sends on repeat. The current scheduler record and latest output are separate readbacks. If the paid queue is empty, the existing release part reports zero claims, upstream requests and paid Watch mail.
- One tick claims up to eight repositories, one at a time. Care records the claim in `care_periods.report.watchSchedule`, while `report.releases` and other report fields survive. Unvisited active repositories come first, followed by the least recently claimed. A claim records scheduling progress even when the repository is unsupported or its response is empty or failed. On rate limits or exhaustion the tick stops, leaving unattempted repositories in their previous positions. The next hourly tick resumes from PostgreSQL, including after a restart. An unreceived checkpoint stops the tick. Inspect the stored state rather than replaying the claim.
- The runner retains the limits of ten recent releases per repository, 45 upstream requests and two minutes for upstream reads. Unsupported repositories, incomplete pages and exhausted budgets surface as issues. The existing manual release consumer remains available for a larger verified Git snapshot. Each acquisition rejects redirects, private DNS, mismatched refs and blob identities, nonregular files, truncated trees and excessive sizes. The worker removes its own snapshot and executes only the digest-pinned scanner.
- The existing mail sender claims only `skill_watch_alert` messages during this job. A deferred or timed-out provider response is unresolved. Receive the original outbox claim, acceptance and provider idempotency key before taking action. The existing five-minute retry due time and 23-hour same-key window still apply. Do not reset those claims or replay an unknown send manually. A zero count does not prove that a prior deferred item was delivered.
- To pause only official sources, use the owner enrollment pause below. To pause the whole Watch worker, disable this one cron entry and preserve original paid periods, observations and outbox claims. If removing the scanner, remove only its pointer from the full environment. No other mail kind, receipts job or database migration depends on this entry.

### Official pages for the operator

Use the same native cron command and current environment. The controller can apply [the private enrollment SQL](../scripts/release/official-watch-enrollment.sql) through its existing Supabase owner route on project `arvmcttdegqwiwdaembr`. It adds one existing Care review record and one review window for `contact@samedaydesk.com`. Both remain outside payment, checkout and paid-period selection. The enrollment leaves public Watch settings unchanged.

The [source list](../server/lib/watch-official-pages.js) covers Delaware, Wyoming, New Mexico, the IRS, Google Play, Apple, Stripe, PayPal REST payments, D&B and FinCEN. The worker fetches these exact public addresses with no redirects. Each has a six-second, 2,500,000-byte limit. HTML fingerprints use material text, including availability labels and links to public fee documents. PDF fingerprints use the delivered bytes without opening the file. A replacement link on an index alerts the operator to review the new document address. Read failures leave the previous baseline intact.

The first successful read of each page stores its baseline without opening a task. A changed digest opens a review task in the existing `care_mail` claim and the same tick drains it to the SameDayDesk owner inbox. The task payload at `details.task` has schema `sds.watch.official-source-task.v1`, action `review_official_source`, `target`, `label`, `url`, UTC `observedAt`, `beforeSha256` and `afterSha256`. Those fields describe public sources. The queue and recipient remain private. The existing Node command is the drain entry point. It uses the existing Care connection and `RESEND_API_KEY` with the enrolled SameDayDesk sender. It needs no HTTP drain route or extra schedule.

Receive the `official` results in the usual cron JSON and inspect the reserved window's `report.officialPages` and its `care_mail` claims through the owner route. Keep the same claim on unknown delivery and confirm provider acceptance separately from the actual inbox message. The worker uses the existing five-minute due time and 23-hour same-key claim window.

Qualify baseline, changed content, unchanged content, failed fetch, duplicate tick and notification recovery with `SKILLGUARD_SOURCE=/absolute/verified/skillguard.js bash scripts/release/care-preview-test.sh --watch-only` on disposable PostgreSQL. For live receiving, wait for the next existing scheduled output after enrollment, record all received baseline digests, and follow later normal outputs. The first actual live change and owner review remain unreceived until a source changes and the inbox message arrives.

To pause only official-page alerts, let an already started tick finish, then use the existing owner connection to empty the reserved record's targets. Preserve the row, observations and mail claims. The paid-repository schedule continues.

```sql
update samedaydesk_care.care_orders
set intake=jsonb_set(intake, '{officialPages}', '[]'::jsonb)
where id='505a0b26-a89a-4f45-8d2a-a3e1780ef6c6'
  and state='review' and not live_mode and integration_id='official-watch-owner-v1';
```

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
