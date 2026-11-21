# Care database enrollment for the SDS release

Root applies live SQL, chooses private host secrets and deploys. This worker only
emits SQL and tests disposable PostgreSQL. The retained Supabase project is
`arvmcttdegqwiwdaembr`; Root's readback found no Care tables, schema or app role.
This is a one-time empty-schema enrollment, not an upgrade of existing data.

## Exact installation

Use the selected immutable `release/sds` commit, not the moving redo branch.
Generate and review the SQL without connecting to a database:

```sh
node server/scripts/care-enrollment.mjs samedaydesk_care samedaydesk_care_app > care-enrollment.sql
```

The generator validates both identifiers, creates a dedicated login role and
private schema, then applies exactly these source migrations in this order:

1. `0011_task_requests.sql`
2. `0012_care_orders.sql`
3. `0013_task_quotes.sql`
4. `0014_commerce_journey.sql`
5. `0015_mail_events.sql`

Only their known `public.TABLE` identifiers are rendered into the selected private
schema, including foreign keys, indexes and ALTER statements. Historical migration
files stay unchanged. Do not run their original public-qualified SQL against the
retained project. Changing search_path does not redirect those identifiers.

Root first verifies the target project and takes the existing backup. With its
existing migration owner and a verified TLS connection, apply the reviewed file
with `psql -X -v ON_ERROR_STOP=1 -f care-enrollment.sql`. The generated transaction
fails if the schema or role already exists. The migration owner retains ownership;
`samedaydesk_care_app` is never the schema/table owner. Use the exact role name
`samedaydesk_care_app` when assigning its private password through Root's existing
secret process; the emitted SQL contains no password and cannot authorize a login
until Root enrolls one. Do not save the password or database URL in Git or evidence.

The transaction grants database CONNECT, schema USAGE and table SELECT/INSERT/UPDATE only on eight
tables: task_requests, care_orders, care_periods, care_period_holds, care_mail,
task_quotes, journey_events and mail_events. Every table has enabled and forced
RLS with three explicit policies for this server role. The role has NOINHERIT,
NOSUPERUSER, NOCREATEDB, NOCREATEROLE, NOREPLICATION and NOBYPASSRLS. It receives no
DELETE, TRUNCATE, schema CREATE, database CREATE, default grants, memberships or
migration authority. PUBLIC and existing anon/authenticated/service_role grants
are removed only from the newly created private schema and its tables.

Enrollment rolls back if ambient PUBLIC grants give this new role CREATE on a
non-system schema/database or any relation privilege outside the private schema
where namespace USAGE is also available. A table/view ACL without namespace USAGE is not effective access;
an actual query remains forbidden. No extension relations are whitelisted.
It never rewrites unrelated PUBLIC privileges. If this preflight fails, Root must
choose an appropriately isolated database/approved grant correction, then review
and repeat the enrollment. Do not add BYPASSRLS or widen the app role to get past it.
Do not expose the private schema through Supabase's Data API. Existing account
Auth/PostgREST storage continues separately and keeps its existing permissions.

## Host configuration and readback

Root enrolls these names, with values held privately:

- `SDS_CARE_SCHEMA=samedaydesk_care`
- `SDS_CARE_DATABASE_URL`: PostgreSQL connection as samedaydesk_care_app, never postgres
  or service_role; no TLS query-string overrides or search_path options.
- `SDS_CARE_DATABASE_CA_BASE64`: the verified server CA, with hostname validation.
- Existing `SDS_CARE_CHECKOUT`, `SDS_CARE_ACCESS_SECRET`, `SDS_CARE_ORIGIN`,
  `SDS_CARE_PORTAL_CONFIGURATION`, Stripe and Resend settings from the selected cut.

Production must leave `SDS_PRIVATE_PREVIEW` unset. A production Care connection
without an explicit valid private schema fails configuration. Every Care, task
quote, request, commerce journey and mail event consumer uses that qualified schema
and restricted connection, including when Care checkout itself is switched off.
There is no configured-database failure fallback into public Supabase. The original
Supabase path is retained only when no Care database/schema is configured.

Root reads back the eight tables, migration owner, RLS/forced-RLS flags, exact
role policies and effective role privileges before enabling the host. It verifies
no relation access outside the selected schema and no database/schema CREATE.
The executable regression is `node --test server/scripts/test-care-schema.mjs`:
it creates only disposable local PostgreSQL, exercises production configuration
with verified TLS and password login (preview unset), ordinary create/read/update,
every consumer, mail replay, refused unrelated reads and DDL, no browser-role
access, effective RLS denial after policy removal, and atomic refusal of an
unrelated PUBLIC grant. `bash scripts/release/care-preview-test.sh` additionally
replays the whole HTTP paid-intake/renewal/cancellation/quote/mail fixture under
the private schema and restricted role, using synthetic Stripe and mail only.
Both run in the release care-preview gate.

Rollback the deployed code through Root's release procedure. Preserve this private
ledger and its role rather than dropping payment/fulfilment history. Reverting to
the older public-qualified Care code cannot read this schema: leave the new Care
checkout off during such a rollback until Root selects compatible code. Existing
account paths remain separate.

## Remaining release boundaries

The only retained Stripe live account is `acct_1SAPeHLafhbMG1jP`; its Public Details
say Neomorphic LLC. Do not globally rename it for SameDayDesk. Per-session branding
changes the top-of-checkout name, not every Stripe term, receipt or account-level
identity. Root owns the buyer-facing release decision and live settings readback.
The independent managed-runtime acquisition witness is not invoked by ordinary
Care checkout, task quote, account checkout, mail or journey buyer paths and does
not hold this schema amendment. Its earlier CI evidence stays pinned to its source.
