# SameDayDesk daily counts

Use `samedaydesk_care.daily_site_counts(date)` for a closed UTC day through the existing `samedaydesk_demand_reader`. It is one read-only JSON aggregate. The North Star counts are retained account profiles, accepted order starts and first distinct paid orders. Letter signing and checking are both inapplicable. Counts exclude marked QA through authoritative order, session and account links. An unjoined history gap stays visible. Provider-only direct links and House-owned Report payments are outside the local paid projection. The accepted SameDayDesk Report handoff does contribute an order start.

## Existing owner install

1. Receive the exact application source and managed profile. The scope-only changes add an idempotent existing `journey_events` paid fact for retained hosted Card orders and a start fact after the actual Report order is accepted. They also preserve the existing order metadata with an explicit provider test marker when present. These paths do not need a new app credential or a grant on another table.
2. On the already enrolled SameDayDesk Supabase project `arvmcttdegqwiwdaembr`, use the existing native `postgres` owner to apply `supabase/private-migrations/0026_daily_site_counts.sql`. The private migration follows Care enrollment and does not run as a generic public migration. Production was read as PostgreSQL 17.6 and the existing Care relations are forced RLS, owned by `postgres`. The function uses that existing owner and a pinned search path. Its caller receives only `EXECUTE`. Existing table and schema grants and RLS are preserved.
3. Use the existing `postgres` owner to enroll verified owned, test and sponsored profile exclusions in `samedaydesk_care.daily_account_exclusions`, including profiles with no journey or order yet. Supply the actual profile UUID privately as `verified_profile_id` and one of `owner`, `test`, `sponsored` as `verified_scope`. This uses one existing profile and retains only its site-scoped digest. The reader and app roles have no table access. Keep the root-held verified source for each exclusion.

```sql
insert into samedaydesk_care.daily_account_exclusions(profile_digest,scope)
select sha256(convert_to('samedaydesk/daily-account-exclusion/v1/'||id,'UTF8')), :'verified_scope'
from public.profiles where id=:'verified_profile_id'::uuid
on conflict (profile_digest) do update set scope=excluded.scope;
```

4. After receiving the runtime and verified exclusions, set the function's owner-managed coverage date to the first complete UTC day under the received producers. With the existing owner in `psql`, supply `first_full_utc_day` as an explicit `YYYY-MM-DD` variable and apply:

```sql
select format('comment on function samedaydesk_care.daily_site_counts(date) is %L',
              'coverage-from:' || :'first_full_utc_day'::date::text) \gexec
```

5. From the existing reader profile, feed the exact closed day to the ordinary reader or its underlying SQL. The output has one aggregate object and no row identity. Confirm a wrong role cannot execute and the reader cannot select from the exclusions table, `public.profiles`, `public.orders` or `auth.users`.

```sql
begin read only;
select samedaydesk_care.daily_site_counts(:'utc_day'::date);
commit;
```

Before the coverage date, account/start/paid values are null with explicitly narrower retained counts. After it, the measured local authority stays labeled `retained`, with the source limitations alongside each field. A restored process uses the same stored order identity and does not recount Stripe, USDC or invoice retries. Refunded original payments remain paid outcomes on their original authoritative day.

Rollback as the same owner with `drop function samedaydesk_care.daily_site_counts(date);`. Preserve the owner-verified exclusions table for recovery. The reader reports UNKNOWN while the function is unavailable. To pause just prospective publication, set the function comment back to `coverage-pending`.

Run `bash scripts/release/test-daily-site-counts.sh` on a Grand disposable PostgreSQL instance. It verifies the pre-existing reader column grant and RLS behavior before and after the callable, checks UTC and QA linkage, and rehearses dropping the function. The fixture does not stand in for installed production receiving.
