# Managed Node receiving

`productionActivate` stays **HOLD**. Root reports the actual app is **cloud-f**. This package has not probed, written to, or deployed that host. Python/Django product documentation does not establish whether its Node process can execute a private Python child. A passing VM probe establishes only this VM.

The received execution route is the sealed `vf08.wasmtime49-linux-x64-fixed.v1`, `wasmtime-py` 49.0.0. Vendored PROFILE, `child.py`, `supervisor.mjs`, and `contracts.mjs` stay byte-identical. The optional C embedding and its module-rewriting loader were removed during receiving; `FOUNDRY_EXECUTION_RUNTIME` must be unset. A future embedding needs its own explicit, source-bound integration and acceptance.

## Named build entries

Hostinger's [`build_script` control](https://github.com/hostinger/api-python-sdk/blob/main/docs/HostingV1NodeJsUpdateBuildSettingsRequest.md) accepts a **package.json script name**. Root can select `build:managed-foundry`, whose local command is:

```sh
npm run build:managed-foundry
```

It builds the existing client, materializes the pinned private interpreter, and probes it. A failed diagnostic exits nonzero. For the explicit installation step, `build:managed-foundry-install` runs the same build and then `foundry:install`. Root selects that name only after authorizing an independent database and supplying private installer inputs. Neither script sets host environment values or enables the listener.

The materializer uses the existing system Python and pinned `setup-runtime.py`, or the pinned CPython standalone archive and Wasmtime wheel. Downloads enforce their size ceiling while streaming and have a deadline. Setup children drain both pipes, bound output, have deadlines, and terminate their process groups. Existing incomplete runtimes are refused. New incomplete runtimes are removed on failure. `.runtime` and `.python-standalone` remain gitignored and must be built on the destination machine.

`npm run foundry:managed-probe` checks Linux x64, `/proc`, `prlimit`, and actually compiles, instantiates and executes a fixed Wasmtime diagnostic with fuel and OS limits. It prints booleans, fixed failure codes, and the Node version; child stderr, paths and environment values are discarded. It remains `notProduction: true`, `activation: false`, `wholeHostSandbox: false`. It does not migrate or install a profile. Actual visitor execution uses the sealed supervisor and strict no-import child, with durable process identity and termination witnesses.

## Private installation inputs

Root supplies `FOUNDRY_PRIVATE_DIR`, a mode `0700` directory outside the repo, `public_html`, and disposable deployment output. Its parent must already exist. The explicit installer can create mode `0600` files from `FOUNDRY_HOST_PROFILE_JSON`, `FOUNDRY_PRIVATE_PROFILE_JSON`, `FOUNDRY_PARTICIPATION_KEY`, and `FOUNDRY_PGSSL_CA_PEM`. Every path component and file is opened without following symlinks. Existing directories/files are checked, never chmodded. Explicit and implicit filename replay must match incoming content; different JSON/key/CA is refused without overwrite. Later validation or write failure removes only files created by that invocation.

The serving environment keeps the resulting file paths and removes the installer-only JSON/key/PEM values. The listener refuses inline values with `profile_json_in_listener` and never migrates. Leave `FOUNDRY_HOST_OPT_IN` unset until installation is complete.

For a remote foundry database, retain `sslmode=verify-full` and set `CORRESPONDENCE_PGSSL_CA_FILE` to Root's official provider CA in a private `0600` file. The adapter validates CA certificates and appends `sslrootcert` only to the foundry URL. It does not patch `pg.Pool`. Conflicting root certificates and weaker TLS options are refused. Use a DNS hostname: the locked pg version omits TLS servername for IP hosts, so this adapter refuses IPs when a CA is configured. Product/Pulse pools retain their own configuration. The product Supabase project is refused before connect.

## Actual-host steps still owned by Root

Use [hPanel's individual environment-key additions/edits](https://www.hostinger.com/support/how-to-edit-or-add-environment-variables-after-deployment/). The API GET masks the live 16-key set; full-replacement PUT from the old 15-key backup loses a payment-link key. Do not use it. This tree contains no replacement planner.

Root still needs to measure the named build/probe on cloud-f, install against the authorized retained database, remove installer inputs, read back serving configuration safely, restart the actual app, and prove visitor A contribution/verification/publication plus visitor B's canonical invocation after another restart. Health or fixture success cannot supply that evidence. Keep product auth, payment links, Stripe, mail, and human pages unchanged.
