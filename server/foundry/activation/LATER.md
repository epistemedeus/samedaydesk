# Later retrieval while production activation is HOLD

`productionActivate` is **HOLD**. `productionReady` stays false. This note separates the public useful-jobs path, which is already retrievable, from foundry behavior that becomes true only after Root activates the host.

## True now

`GET https://samedaydesk.com/for-agents/useful-jobs` is the human page. `GET /for-agents/useful-jobs/catalog.json` is the machine catalog. The first job is `lockfile-pin-delta`. `GET /discovery/useful-jobs.json` names the same package. Those bytes are the offline useful-jobs package. They are not foundry execution, not a correspondence store, and not a production activation. This amend does not change those pages.

On a private PostgreSQL cluster that is not the product Supabase project, `node server/foundry/activation/cold-job.mjs` runs the official visitor client and Wasmtime 49.0.0. The held-out case is `case:project-created`. A second visitor, after the HTTP process restarts, reads the same output. Rollback then boots with foundry variables unset. The `pilot_correspondence` tables and the published row stay. That receipt still has `productionReady: false`, `launchedService: false`, and `hostingerMeasured: false`.

`node server/foundry/activation/later-retrieval.mjs` re-reads the live catalog and the human page and exits 0 only while they still match this tree and do not claim production activation.

## True only after Root activation

Root activation means all of the following, and this package does none of them:

1. Authorize a Postgres URL that does not reuse the product Supabase project `arvmcttdegqwiwdaembr`. A URL that does is class `correspondence_reuses_product_data_service` and is refused before connect.
2. Run `node server/foundry/install.mjs --migrate` and then `--migrate --install` against that URL.
3. Set `FOUNDRY_HOST_OPT_IN`, `CORRESPONDENCE_DATABASE_URL`, and `CORRESPONDENCE_ADMIN_TOKEN`, plus the other serving names in `ACTIVATION.md`, on the existing Hostinger app.
4. Restart the process that runs `node server/index.js`.

Only after that restart can `https://samedaydesk.com` show correspondence healthz `enabled: true`, the foundry facade, and a later visitor reading a published portable result from the enrolled store.

Missing any of `FOUNDRY_HOST_OPT_IN`, `CORRESPONDENCE_DATABASE_URL`, or `CORRESPONDENCE_ADMIN_TOKEN` is class `host_configuration_withheld`. A launch claim on a database the installer has not enrolled is class `hosted_success_without_enrolled_store`. Neither class sets `productionReady`.

## Still false after that restart

Leave `FOUNDRY_PRODUCTION_ACTIVATE` unset or `HOLD`. This package keeps `productionReady` false. Human pages are not part of the restart. Product Supabase, Stripe, and email settings stay as they are. Do not drop `pilot_correspondence`.
