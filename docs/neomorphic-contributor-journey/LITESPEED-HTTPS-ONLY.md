# Received HTTPS-only LiteSpeed deployment

The chosen transport is the existing Hostinger Express/Node22 app and its single
`server/index.js` listener. `CONTRIBUTOR_DESK_INGRESS_MODE=litespeed-https-only`
requires a fresh controller-signed deployment qualification. It does not infer
TLS from XFP, `Forwarded`, a global, a helper hash, a local address or an env trust
boolean. Passenger and explicit trusted TCP/direct TLS retain their own contracts.
Public reads and both contributor serving flags stay off during installation.
This qualification is private transport admission, not human preview approval,
actual customer/task admission or settlement authority.

## What is received and what is still missing

Root reports exact SDS `f4d43dd14228d3f7ab2d3c0a5f97dca2ed00e23a` built on the
existing host at16:17:10UTC, October13. Its certificate-verified disabled receipt
at16:19:26.546UTC observes Node, the selected Unix listener/native pipe, LiteSpeed
global and loaded `lsnode.js`, patched listen/address and native `realListen`.
Native secure protocol is absent; ordinary XFP contains one `https`. The observed
helper is SHA256 `cd2b694a4a323b432b0a7095348d01d5ce24f73d8853e6fab546dbf8519174db`.
The provider SSL API reports active SSL/full-site HTTPS redirect, and actual HTTP
GET health/desk/signup (including spoofed indicators) redirects to exact HTTPS.
That is partial receiving; plaintext mutations, alias/backend isolation and the
whole hosted account journey remain unreceived. The old refusal is correct.

[LiteSpeed's Node documentation](https://docs.litespeedtech.com/lsws/extapp/nodejs/)
describes its Node front end. Its [published helper](https://github.com/litespeedtech/openlitespeed/blob/master/dist/fcgi-bin/lsnode.js)
selects a Unix path or an inherited descriptor, intercepts the listener and uses
an address getter. This explains why a Node pipe need not have a visible native
address. The current upstream SHA256 `a919533c99d912629df6b906d2a2fed4ea4353ff7a5aeb2979684f51ab78afe2`
differs from the actual host; it is neither an audited live copy nor vendored here.
The loader fingerprint binds the deployment identity only. The TLS authority is
the controller's independently received provider policy and backend isolation.

## Root's bounded external qualification

Keep `MODE=disabled`, `CONTRIBUTOR_DESK_MANAGED_ENABLED=0` and
`CONTRIBUTOR_JOURNEY_PUBLIC_READS=0`. Preserve the exact enrolled origin/store/
schemas and stable keys. Receive these four separate private records on the
candidate source, within ten minutes of issuing the qualification:

1. **providerHttpsPolicy:** authenticated provider readback identifies the same
   existing app/domain, completed exact candidate build, active valid SSL and
   forced HTTPS for the entire contributor/API paths. Receive the full original
   Node settings, environment key inventory and main Git linkage. A successful
   build/health request or a domain marketing page is insufficient.
2. **certificateVerifiedHttps:** requests to exact canonical HTTPS with normal
   certificate/hostname checks, no `-k`, no disabled certificate verification or
   redirect following. Receive the selected server/request/native pipe, actual
   loaded main/helper fingerprint and native `realListen` through the existing
   one-request disabled v2 probe. Its added single boolean
   `litespeedGlobalIsEventEmitter` must be true for this runtime identity. Exact
   Host/supplied Origin must match. Receive the edge's treatment of duplicate/
   wrong Host/origin; the guarded contributor refusals are also part of the later
   private enabled journey replay. Ordinary/native-looking forwarding must not
   change transport authority. This private observation is never a qualification.
3. **plaintextRefusal:** finite GET/HEAD/POST/PUT/PATCH/DELETE/OPTIONS requests to
   health, desk, signup, recovery and profile, with harmless QA bodies and no
   cookies, account IDs or credentials. Test no spoof, ordinary XFP/Forwarded/
   XFH/SSL indicators, and native-marker spoof/duplicates. Never follow the
   redirects or retry a mutation. Every case must redirect to its exact HTTPS
   URL or reject before the Node contributor handler, with no cookie/result/
   account mutation. `/api/health` gives200 at Node; the contributor disabled
   handlers do not issue301. A body-preserving public redirect still must be
   received explicitly; do not infer mutation behavior from GET.
4. **backendIsolation:** identify every provider alias/temporary hostname and
   backend route from authoritative provider settings, not guessed addresses.
   Receive that no public path can send plaintext to the qualified Node pipe
   while asserting the canonical Host. Alias HTTP must redirect/reject before
   Node; alias HTTPS must refuse the original Host or route through the same
   qualified TLS-only edge with exact canonical Host/origin enforced. Confirm
   the pipe/inherited descriptor is reachable only through that managed edge,
   not an exposed TCP listener or arbitrary external proxy. A Unix handle alone
   does not establish this. If provider visibility cannot establish isolation,
   leave qualification absent and use the existing independently supported TLS
   or explicitly trusted TCP ingress instead; do not guess a provider pass.

Each record has a SHA256 reference and its actual receiving time. The issuer
validates presence, separate references and freshness; it does **not** independently
execute or verify the contents of those external records. Signing is an explicit
controller attestation using the already enrolled integrity key, with a separate
HMAC purpose. An application/credential compromise is outside this transport
attestation's boundary. No extra key, task/money/account ledger or provider call
is introduced. The existing independent account/store enrollment remains required.

## Exact preparation and installation

Build/export the final committed Neo runtime and desk with the existing workflow.
Run `CONTRIBUTOR_JOURNEY_SOURCE_COMMIT=EXACT_NEO npm run build:managed-contributor`
in SDS. This composes **build:managed-foundry**, its deployable Python/Wasmtime
and capability probe, then contributor verification. Preserve saved Node22/Express
entry `server/index.js` and saved `build:managed-foundry`; Root selects the composed
script for the candidate build as already received. After every actual terminal
build, restore/read back the full original enabled main linkage: the provider
build API has an observed linkage side effect. Do not replace the app/listener.

In an exact owned SDS tree, `inspect` verifies both complete manifests, dependencies
and the owning edge/entrypoint bytes; it reads no store or provider:

```sh
node --env-file=/private/existing-stable.env server/scripts/qualify-contributor-https-edge.mjs inspect
```

Root writes an owner-only receiving input, filling actual values. This example
has no qualification until Root supplies the four independently received records:

```json
{
  "schema": "sds.contributor-https-only-receiving.v1",
  "profile": "live",
  "sdsCommit": "EXACT_CANDIDATE_SDS_COMMIT",
  "loaderSha256": "EXACT_RECEIVED_HELPER_SHA256",
  "expiresAt": "ABSOLUTE_ISO_UTC_AT_MOST_24_HOURS_FROM_ISSUE",
  "checks": {
    "providerHttpsPolicy": {"receivedAt": "ACTUAL_ISO_UTC", "receiptSha256": "EXACT_RECORD_SHA256"},
    "certificateVerifiedHttps": {"receivedAt": "ACTUAL_ISO_UTC", "receiptSha256": "EXACT_RECORD_SHA256"},
    "plaintextRefusal": {"receivedAt": "ACTUAL_ISO_UTC", "receiptSha256": "EXACT_RECORD_SHA256"},
    "backendIsolation": {"receivedAt": "ACTUAL_ISO_UTC", "receiptSha256": "EXACT_RECORD_SHA256"}
  }
}
```

The private stable env for issuing must retain the existing credentials/bindings,
disabled mode, managed0/public0 and final Neo source. Add
`CONTRIBUTOR_DESK_SDS_SOURCE_COMMIT=EXACT_CANDIDATE_SDS_COMMIT` to that **local**
private preparation env. Do not put credentials in prompts, Git or CLI arguments.

```sh
chmod 600 /private/edge-receiving.json
node --env-file=/private/existing-stable.env server/scripts/qualify-contributor-https-edge.mjs \
  issue /private/edge-receiving.json /private/new-edge-overlay.json
```

The output is an exclusive-create0600 file with four contributor settings: mode,
empty trusted TCP peers, exact SDS commit and signed qualification. It does not
send them. Combine it with the existing disabled installation overlay using the
received `prepare-contributor-environment.mjs` workflow. Hostinger GET masks
values and PUT replaces the entire set: use the full authoritative restricted
existing values and current GET **keys only**. Preserve every original key/value,
stable credential, schema, build setting and Git linkage; never PUT masked values.
Root owns the actual provider application/readback. Applying the full environment
restarts Express on this host, so no speculative second restart/build is needed.

Both prefixes refuse missing/invalid/signature/source/origin/store/expired
qualification. Request admission additionally requires the real loaded main
module/cache, qualified content identity, LiteSpeed EventEmitter, patched selected
listen/native realListen, actual pipe/request ownership and no physical TCP
listener. The inherited descriptor's native address may remain unknown. Wrong or
duplicate Host/origin refuse; forwarding values are discarded. No global proxy
trust or cookie/CSRF rule changes. Unrelated SDS routes remain available.

## Final private receiving, renewal and rollback

Qualification installation while disabled is not enabled hosted-journey proof.
Root receives the actual HTTPS compiled desk/assets/missing paths and account/
cookie/CSRF/isolation/recovery/cold restart under its separately authorized private
release controls. Human preview review, public activation and amount-free public
reads remain separate. No production customer/task/payment or paid badge follows
from this source/transport preparation.

Every request checks absolute expiry, at most24hours; restart does not extend it.
Renewal requires fresh receiving and a new signed packet, never an automatic
poller. Changes to source, loader, origin/store/credentials or provider policy
invalidate the prior receiving. Runtime bytes are checked at startup; replace
sources through an exact received restart/build, not by editing a running tree.
Provider-policy drift cannot be sensed by Node: Root must revoke before changing
that policy. Remove `CONTRIBUTOR_DESK_HTTPS_QUALIFICATION` and set disabled/
managed0/public0 in the **full authoritative** environment for immediate rollback;
receive the restart and disabled API/desk refusal, with unrelated SDS routes up.
Expiry limits an unrevoked old attestation, not a guarantee against unseen policy
changes during its lease. Restore exact previous source/settings/env/key/linkage
packet if needed; do not rotate keys or reenroll/copy retained ledgers.

Remove all four temporary v2 probe keys after its one matching log readback, or
let its absolute ten-minute expiry lapse and then remove them. Keep no poller,
public diagnostic endpoint, raw header log or customer data. Delete only the
controller's disposable private receiving/overlay copies after restricted receipt
retention. Source fixtures use real certificates/Unix descriptors/Postgres and
synthetic owner QA qualification; they do not receive Hostinger policy.
