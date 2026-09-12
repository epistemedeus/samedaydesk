# npm-generated install plans

Generated with Node 22.23.2 and npm 10.9.8. The eight manifests and lockfiles
were produced by npm, not by the delta parser. `receipt.json` records actual
filesystem presence after `npm ci --omit=dev --omit=peer --omit=optional`.
The local tarball's source manifest is `tarball-package.json`; no dependency
scripts or registry access are needed.

Regenerate in a new directory:

```sh
NODE_OPTIONS=--max-old-space-size=768 node generate.mjs /tmp/new-npm-pin-plans
```

The generator runs bounded npm commands through the test-only helper. It packs
one local package, generates both v2 and v3 locks, installs each plan, records
whether the package exists, and removes its temporary install trees. The
version, integrity and resolved tarball pins match across dependency kinds;
only dev, peer or optional selection changes. The original CW15 source missed
the dev and peer changes despite the different resulting installation.

`test/npm-install-oracle.test.mjs` independently regenerates and installs these
cases on every test run, and also checks workspace realpaths/target manifests
and optional OS selection. `test/npm-url-oracle.test.mjs` serves a local tarball
on `LOCKFILE_TEST_PORT` (default 55550) to verify npm-generated literal HTTP URL
pins, including URLs that resemble Git sources. Only that loopback test uses
HTTP; it directs npm's registry to the same loopback server and disables audit,
scripts, funding and retries. The production CLI never invokes npm or HTTP.
