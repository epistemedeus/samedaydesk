# Root publication and existing-provider enrollment

The tested receiving branch starts exactly at `685f90f6b48d9b141afc5c5dc1e2d09c839a3182`.
It applies the original `ROOT-MOUNT.patch` to the existing Express app/index,
serves a digest-checked minimal client through the new machine API, and retains
supplied recipe output in the existing correspondence Postgres receipt table.
There is no new storage, queue, scheduler, inference worker or public grant maker.

On 2026-10-02, anonymous production readback found correspondence disabled with
`reason: unconfigured`, its visitor entry returning 503, and the hosted-useful
recipes/health/client routes returning 404. The existing public-readiness checker
is enabled. The public offline useful-jobs 1.4.7 archive was acquired and verified
at 5,255,824 bytes and SHA256
`e2e9b44e4d7318ac55052953318f05e53dbc121ab02e2762e34c919ac5469dec`.
Those are distinct observations; the old archive does not execute retained jobs.
See [PRODUCTION-READBACK.json](PRODUCTION-READBACK.json).

The existing web provider is **Hostinger**, with Node 22/Express and
`node server/index.js`, as recorded by the inherited
[activation delta](../../../server/foundry/activation/DELTA.md) and
[host receiver](../../../docs/FOUNDRY-HOST-RECEIVER.md). This receiving did not
read a hosting panel or modify that provider. The configured product data provider
is **Supabase**; today's anonymous `/api/health` confirms the configuration flag.
Its HTTP URL/service-role key is not a correspondence PG connection, and the
existing product-isolation guard explicitly refuses its reuse for correspondence.

The existing correspondence authority is canonical VF1652533 Postgres, namespace
`pilot_correspondence`. Its production provider/connection identity is **not
exposed or enrolled in the received public/source evidence**. Root must resolve
the already recorded private provider enrollment and use that provider's existing
authorized PG connection. This plan supplies the exact supported installation
step; it does not invent a database host, project, grant, profile or provider.
An absent authorized connection remains a publication/enrollment condition.

1. Receive the exact branch and source hashes in [TEST-RECEIPT.json](TEST-RECEIPT.json).
   The mount is already applied; do not apply it twice. Keep every human file,
   vendored receiver and frozen predecessor unchanged. Review the three owning
   fixes: cumulative HTTP/backend byte accounting, source-pin sealing, and
   issue-brief Update/Add action extraction. The readiness test now checks live
   MCP names and existing discovery links instead of requiring literal names in
   human copy. The original assertion fails at unchanged receiving base.
2. On the existing authorized provider, with foundry opt-in still unset, supply
   `CORRESPONDENCE_DATABASE_URL` through the existing secret configuration,
   `CORRESPONDENCE_PG_SCHEMA=pilot_correspondence`, and the existing
   `FOUNDRY_HOST_PROFILE_FILE`, `FOUNDRY_PARTICIPATION_KEY_FILE`, and installer-only
   `FOUNDRY_PRIVATE_PROFILE_FILE`. Private files remain outside Git at mode 0600.
   The exact supported step is:

   ```sh
   node server/foundry/install.mjs --migrate --install
   ```

   This existing installer applies correspondence/VF02/VF04/entry/receiving
   migrations and installs the original private profile. Same-profile repeats
   preserve charged counts/terms; different profiles are refused. Startup never
   migrates. Follow the owning
   [ACTIVATION.md](../../../server/foundry/activation/ACTIVATION.md), not an HTTP
   service-key substitution or a fabricated enrollment record. None of this
   production step was performed by379.
3. After the existing installation receipt is true, Root sets the serving
   `FOUNDRY_HOST_OPT_IN=1`, `HOSTED_USEFUL_JOURNEY_OPT_IN=1`,
   `CORRESPONDENCE_STORE=postgres`, `CORRESPONDENCE_PG_SCHEMA=pilot_correspondence`,
   the existing 24+ character `CORRESPONDENCE_ADMIN_TOKEN`, PG URL and host/key
   paths. Retain the owning pool/body/CORS/trust-proxy values; the recommended
   base pool is 2 and foundry body limit is 524288. Journey intake separately
   refuses bodies above 65536 bytes. It adds at most two active PG connections
   through the installed-client transaction seam. One foundry web process with
   base pool 2 plus this adapter can use 10; an already existing worker would add
   its existing two. Check existing consumers against the recorded connection
   envelope; no plan upgrade or additional worker is proposed.
4. Root alone merges/deploys this source and restarts the existing Node process.
   The archive stays under `tools/hosted-useful-journey-100346/successors/0.1.1`;
   the same backend serves `/api/hosted-useful/client` and `/client/archive`.
   Independently GET recipes, healthz, client metadata and archive from the real
   production origin; compare actual archive size/SHA to the release. Verify
   the old MCP inventory, uploads refusal, site pages and prices. Update only
   the publication fact actually read back. `enabled: true` alone does not
   establish production readiness, outside usefulness, export or payment.
5. An actual visitor supplies their own snapshot request and an already
   authorized project owner/writer grant using [COLD-CLIENT.md](../../../tools/hosted-useful-journey-100346/COLD-CLIENT.md).
   Evaluate separately, then run with a saved operation key/journal; retrieve
   the retained digest after process loss and supply that exact digest as a
   later task's prior. A changed input needs a new task/operation. Optional
   export requires current authority, `optIn: true`, matching digest and
   `purpose: later-task-reuse`. No public contribution/acceptance/reward write
   is implied. Root separately records the visitor's review and actual use.

Each client command shares a deadline and byte ledger across intake, journal,
HTTP, PG, owned child groups and output. Admission durably records the original
deadline, reduced caps and a conservative final-admission charge. A committed
execution reservation prevents starting a second child after unknown physical
consumption. Same-key recovery can retrieve a committed result; an interrupted
reservation requires review, preserving unknown outcome. A later retrieval has
its own bounded read allowance and cannot replenish the original execution.

Rollback: unset `HOSTED_USEFUL_JOURNEY_OPT_IN` and restart SDS. Evaluation/client
acquisition remain public, admission returns 503, and all existing receipts,
grants and cells remain. The owning foundry opt-out is separate. No data drop,
reset, price change, purchase, paid route call or outreach is needed.

Today's next real visitor action is to acquire the already public offline1.4.7
package from `/discovery/useful-jobs.json` and use caller-owned files. The retained
hosted journey becomes a visitor action only after Root's publication and existing
authority enrollment. Source receiving and production hosting remain separate.
