# h04-lock-02 primary source

Caller-owned lockfileVersion 3 pair for an integrity-only pin change (same name+version, different integrity). Not copied from `tools/lockfile-pin-delta/fixtures/*`. Unchanged neighbor pins (`debug@4.4.3`, `safer-buffer@2.1.2`) are taken from SDS `package-lock.json` at `62a88c86461e7b8d0e9a7cf1db57153d7e8fd6cf`.

## After pin (sha512) — SDS + npm registry

`git show 62a88c86461e7b8d0e9a7cf1db57153d7e8fd6cf:package-lock.json` (also identical at `218b2fa74d63951eeeda4cf0a67c420835a58b01`):

```
    "node_modules/ms": {
      "version": "2.1.3",
      "resolved": "https://registry.npmjs.org/ms/-/ms-2.1.3.tgz",
      "integrity": "sha512-6FlzubTLZG3J2a/NVCAleEhjzq5oxgHyaCU9yYXvcLsvoVaHJq/s5xXI6/XXP6tz7R9xAOtHnSO/tXtF3WRTlA==",
      "license": "MIT"
    },
```

`GET https://registry.npmjs.org/ms/2.1.3` `dist` (fetched 2026-09-11):

- `tarball`: `https://registry.npmjs.org/ms/-/ms-2.1.3.tgz`
- `integrity`: `sha512-6FlzubTLZG3J2a/NVCAleEhjzq5oxgHyaCU9yYXvcLsvoVaHJq/s5xXI6/XXP6tz7R9xAOtHnSO/tXtF3WRTlA==`
- `shasum`: `574c8138ce1d2b5861f0b44579dbadd60c6615b2` → SRI `sha1-V0yBOM4dK1hh8LRFedut1gxmFbI=`

## Before pin (sha1) — public lockfile

`PowerShell/vscode-powershell` `75097e880339e45c09f5f6cca4dbdafe552b679f` `package-lock.json` (lockfileVersion 3):

```
    "node_modules/ms": {
      "version": "2.1.3",
      "integrity": "sha1-V0yBOM4dK1hh8LRFedut1gxmFbI=",
      "devOptional": true,
      "license": "MIT"
    }
```

Raw: https://raw.githubusercontent.com/PowerShell/vscode-powershell/75097e880339e45c09f5f6cca4dbdafe552b679f/package-lock.json

This is the documented npm sha1↔sha512 integrity rewrite for an unchanged version (npm/cli#450; lockfile `integrity` may be sha1 or sha512). Engine `e81efc8ab71b1bde88eca743d297149e61bbb6f2` treats it as a change (`changeKinds: ["integrity"]`).

Package whose integrity actually changed: `ms@2.1.3`. Unchanged (must omit): `debug@4.4.3`, `safer-buffer@2.1.2`.
