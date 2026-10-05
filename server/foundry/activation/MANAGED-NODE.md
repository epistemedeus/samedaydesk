# Managed Node receiving

`productionActivate` stays **HOLD**. This file is the host procedure. It does not change Hostinger, buy a VPS, merge, or start the public mount.

Hostinger Business can run this Node app (`server/index.js`, Passenger `alt-nodejs22`). The same plan documents Python and Django as VPS-only. That does not by itself prove whether a private child process may run beside Node. `node server/foundry/managed-node-probe.mjs` prints booleans and versions only. It is not an HTTP route and it does not print environment values or paths. Root runs it on the managed host. A passing probe on this Cursor VM is not production acceptance.

## Route

The sealed reference profile stays `vf08.wasmtime49-linux-x64-fixed.v1` (`wasmtime-py` 49.0.0). Vendor `child.py`, `supervisor.mjs`, and `contracts.mjs` are unchanged. `npm run build` stays the client build.

`node server/foundry/materialize-runtime.mjs` installs that private child when it is missing. An existing `.runtime` that imports Wasmtime 49.0.0 is left untouched. Otherwise, when `python3` exists, it runs the pinned `setup-runtime.py`. Otherwise it downloads the pinned CPython standalone `731af898886c5f821890dc901eca3c651cca8e51fa7308c159d12a1194aeac91` and the same wheel. It does not start a Python web server and it does not copy a virtualenv between machines. `.runtime` and `.python-standalone` stay gitignored. Hostinger rebuilds `hbuilds` on deploy and the plan's SSH cannot run an extra command, so Root may append the materialize command and the probe to the Node build command.

If the managed host cannot execute that child, set `FOUNDRY_EXECUTION_RUNTIME=wasmtime49-embed`. The listener registers the embed loader before correspondence loads. The worker child also gets `NODE_OPTIONS=--import <deploy>/server/foundry/process-bootstrap.mjs`. That loads a separate profile, `vf08.wasmtime49-linux-x64-embed.v1` (`wasmtime-capi` 49.0.0), linked to the official Wasmtime 49 C API (`8f181711f4cf4ddd084d7d54d13d10d44e3c622b0f03bfb8b2cc7afbd85cc131`). It is not WASI and not the host JavaScript engine. Do not install it over a database that already has the reference profile. If the loader does not apply, the embed path throws `embed profile was not installed` and does not fall through to Python.

The embed child applies `setrlimit` before it reads guest bytes. When `/usr/bin/prlimit` exists, the supervisor also applies `prlimit` before exec. Those are different mechanisms. The probe's `embedLimits` field is true only when the child accepts the profile's address, CPU, stack, file, and file-descriptor limits and then rejects an empty request as `request_size`. `os_limits_unavailable` means the control is not enforced. Leave activation off in that case.

## Private configuration

Secrets stay in the provider environment or in mode `0600` files under a mode `0700` directory. That directory is `FOUNDRY_PRIVATE_DIR`, resolved at install time. It must sit outside this repository, outside `public_html`, and outside the deploy output that Hostinger overwrites. The installer may create the files from `FOUNDRY_HOST_PROFILE_JSON`, `FOUNDRY_PRIVATE_PROFILE_JSON`, `FOUNDRY_PARTICIPATION_KEY`, and `FOUNDRY_PGSSL_CA_PEM`, then the serving environment keeps only the file paths. The listener refuses those JSON variables with `profile_json_in_listener` and does not migrate.

`CORRESPONDENCE_DATABASE_URL` keeps `sslmode=verify-full`. Set `CORRESPONDENCE_PGSSL_CA_FILE` to the official CA. The pool wrapper appends `sslrootcert` because node-pg lets the connection string replace an explicit `ssl` object. It does not set `rejectUnauthorized` false. A missing or `public_html` CA path disables the mount. The product Supabase project is still refused before connect.

## Hostinger environment

The panel GET returns masked values (`********`) and the PUT replaces the whole set. Copy the live key names. Build the desired values from Root's private store, including every live key plus the foundry keys this app needs. Do not copy masked values back. Do not PUT a stale backup that has fewer keys than the live set. `planHostingerEnvPut` in `server/foundry/hostinger-env.mjs` rejects those shapes. Saving restarts the app. Leave `FOUNDRY_HOST_OPT_IN` unset until the explicit installer has been run on the independent database. Product auth, Stripe, and mail variables stay as they are.

```sh
node server/foundry/install.mjs --migrate
node server/foundry/install.mjs --migrate --install
node server/foundry/managed-node-probe.mjs
```

Repeat `--install` for the same profile. A second run must report the same `configId`, terms, and charged count. Unset the installer-only JSON variables before the serving restart.
