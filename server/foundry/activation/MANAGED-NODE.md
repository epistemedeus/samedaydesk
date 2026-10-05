# Managed Node receiving

`productionActivate` stays **HOLD**. The actual managed app is **samedaydesk.com on Hostinger**; `cloud-f` is the separate Cursor VM used for receiving. Root's build `01a10c80-7238-73f3-859a-2277f2a110bb` installed bundled CPython and ran Wasmtime, then failed because `/usr/bin/prlimit` was absent. This establishes child execution, not full bounded visitor capability. This amendment has not probed, written to, or deployed that host. Passing VM acceptance establishes only the VM.

The execution profile remains `vf08.wasmtime49-linux-x64-fixed.v1`, `wasmtime-py` 49.0.0. Vendored PROFILE, `child.py`, and `contracts.mjs` remain byte-identical. The supervisor now explicitly uses `vf08.python-setrlimit-exec.v1`: a small standard-library bootstrap started with `-I -S -B`, which reads no visitor bytes, sets and checks both soft and hard AS/CPU/stack/file/FD/core limits, then execs the same installed Python into the unchanged worker. No Wasmtime import or target interpreter startup occurs before enforcement. See [Python resource](https://docs.python.org/3.12/library/resource.html), [exec](https://docs.python.org/3.12/library/os.html#os.execv), and [Linux limit inheritance](https://man7.org/linux/man-pages/man2/getrlimit.2.html). The bootstrap and JS adapter hashes are included in `installation().pins.launcher`; the supervisor hash and runtime pin also change. Old verification/evidence fails closed until explicitly renewed; startup does not migrate it. The vendored SOURCE-PIN records this local amendment. The optional C engine remains removed; `FOUNDRY_EXECUTION_RUNTIME` must be unset.

## Named build entries

Hostinger's [`build_script` control](https://github.com/hostinger/api-python-sdk/blob/main/docs/HostingV1NodeJsUpdateBuildSettingsRequest.md) accepts a **package.json script name**. Root can select `build:managed-foundry`, whose local command is:

```sh
npm run build:managed-foundry
```

It builds the existing client, materializes the pinned private interpreter, and probes it. A failed diagnostic exits nonzero. For the explicit installation step, `build:managed-foundry-install` runs the same build and then `foundry:install`. Root selects that name only after authorizing an independent database and supplying private installer inputs. Neither script sets host environment values or enables the listener.

The materializer uses the existing system Python and pinned `setup-runtime.py`, or the pinned CPython standalone archive and Wasmtime wheel. Downloads enforce their size ceiling while streaming and have a deadline. Setup children drain both pipes, bound output, have deadlines, and terminate their process groups. Existing incomplete runtimes are refused. New incomplete runtimes are removed on failure. `.runtime` and `.python-standalone` remain gitignored and must be built on the destination machine.

`npm run foundry:managed-probe` measures installed/bundled Python separately from optional system `python3` and `prlimit`; neither optional utility gates acceptance. It verifies `/proc`, launcher identity stability, exact limits at the first target instruction and PID preservation across exec, then compiles/instantiates/executes a fixed no-import Wasmtime diagnostic with fuel. `unsupportedHostReasons` and failure codes distinguish missing interpreter, launcher resource/enforcement/exec failure, and reference execution failure. Stderr, paths and environment values are discarded. Success remains `notProduction:true`, `activation:false`, `wholeHostSandbox:false`. Actual invocation owns a detached process group, cancels it on failure, and waits for direct-child reaping and pipe drain before completion. No new engine, weaker limit or renamed reference profile is used.

## Private installation inputs

Root supplies `FOUNDRY_PRIVATE_DIR`, a mode `0700` directory outside the repo, `public_html`, and disposable deployment output. Its parent must already exist. The explicit installer can create mode `0600` files from `FOUNDRY_HOST_PROFILE_JSON`, `FOUNDRY_PRIVATE_PROFILE_JSON`, `FOUNDRY_PARTICIPATION_KEY`, and `FOUNDRY_PGSSL_CA_PEM`. Every path component and file is opened without following symlinks. Existing directories/files are checked, never chmodded. Explicit and implicit filename replay must match incoming content; different JSON/key/CA is refused without overwrite. Later validation or write failure removes only files created by that invocation.

The serving environment keeps the resulting file paths and removes the installer-only JSON/key/PEM values. The listener refuses inline values with `profile_json_in_listener` and never migrates. Leave `FOUNDRY_HOST_OPT_IN` unset until installation is complete.

For a remote foundry database, retain `sslmode=verify-full` and set `CORRESPONDENCE_PGSSL_CA_FILE` to Root's official provider CA in a private `0600` file. The adapter validates CA certificates and appends `sslrootcert` only to the foundry URL. It does not patch `pg.Pool`. Conflicting root certificates and weaker TLS options are refused. Use a DNS hostname: the locked pg version omits TLS servername for IP hosts, so this adapter refuses IPs when a CA is configured. Product/Pulse pools retain their own configuration. The product Supabase project is refused before connect.

## Actual-host steps still owned by Root

Use [hPanel's individual environment-key additions/edits](https://www.hostinger.com/support/how-to-edit-or-add-environment-variables-after-deployment/). The API GET masks the live 16-key set; full-replacement PUT from the old 15-key backup loses a payment-link key. Do not use it. This tree contains no replacement planner.

Root still needs to measure this amended named build/probe on samedaydesk.com's Hostinger app, install against the authorized retained database (explicitly renew old runtime evidence if present), remove installer inputs, read back serving configuration safely, restart the actual app, and prove visitor A contribution/verification/publication plus visitor B's canonical invocation after another restart. Health or fixture success cannot supply that evidence. Keep all sixteen existing environment keys, product auth, payment links, Stripe, mail, and human pages unchanged. The VM-only [receiving-100502 replay](receiving-100502/replay.mjs) hides optional binaries in a private mount namespace; it is not a managed-host build or deployment command.
