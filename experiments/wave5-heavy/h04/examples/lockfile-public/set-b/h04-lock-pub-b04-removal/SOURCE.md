# h04-lock-pub-b04-removal primary source

Repo: `webpack/webpack-cli`  
Path: `package-lock.json` (lockfileVersion 3, `packages` map)

`webpack/webpack` itself ships `yarn.lock` and gitignores `package-lock.json`, so this pair uses the webpack-org npm lock at webpack-cli.

| Role | SHA | Subject |
| --- | --- | --- |
| before | `cbd3a24dbdadd84e3614f9aff1068af2f1275cfe` | chore(deps-dev): bump postcss from 8.5.22 to 8.5.25 (#4825) |
| after | `3664b9d8239834f63124783307dd3e93953d6dd9` | chore: update webpack-dev-server to v6 and test against v5 and v6 (#4834) |

Commits:  
https://github.com/webpack/webpack-cli/commit/cbd3a24dbdadd84e3614f9aff1068af2f1275cfe  
https://github.com/webpack/webpack-cli/commit/3664b9d8239834f63124783307dd3e93953d6dd9

Raw blobs:  
https://raw.githubusercontent.com/webpack/webpack-cli/cbd3a24dbdadd84e3614f9aff1068af2f1275cfe/package-lock.json  
https://raw.githubusercontent.com/webpack/webpack-cli/3664b9d8239834f63124783307dd3e93953d6dd9/package-lock.json

Full locks at those SHAs are 1703 / 1665 `packages` keys (55 removed, 17 added, plus identity edits). Fixtures are a **bounded extract** of the same blobs: root + 11 unchanged pins that keep name+version+integrity+resolved + 8 keys that exist only in the before blob. Added keys from the full after lock are not stored, so this job is removal-only.

## `packages` keys present at `cbd3a24dbdadd84e3614f9aff1068af2f1275cfe` and absent at `3664b9d8239834f63124783307dd3e93953d6dd9`

```
{
  "node_modules/array-flatten": {
    "version": "1.1.1",
    "resolved": "https://registry.npmjs.org/array-flatten/-/array-flatten-1.1.1.tgz",
    "integrity": "sha512-PCVAQswWemu6UdxsDFFX/+gVeYqKAod3D3UVm91jHwynguOwAvYPhx8nNlM++NqRcK6CxxpUafjmhIdKiHibqg=="
  }
}

{
  "node_modules/binary-extensions": {
    "version": "2.3.0",
    "resolved": "https://registry.npmjs.org/binary-extensions/-/binary-extensions-2.3.0.tgz",
    "integrity": "sha512-Ceh+7ox5qe7LJuLHoY0feh3pHuUDHAcRUeyL2VYghZwfpkNIy/+8Ocg0a3UuSoYzavmylwuLWQOf3hl0jjMMIw=="
  }
}

{
  "node_modules/core-util-is": {
    "version": "1.0.3",
    "resolved": "https://registry.npmjs.org/core-util-is/-/core-util-is-1.0.3.tgz",
    "integrity": "sha512-ZQBvi1DcpJ4GDqanjucZ2Hj3wEO5pZDS89BWbkcrvdxksJorwUDDZamX9ldFkp9aw2lmBDLgkObEA4DWNJ9FYQ=="
  }
}
```

Also removed in the extract (same blobs): `binary-extensions@2.3.0`, `core-util-is@1.0.3`, `destroy@1.2.0`, `detect-node@2.1.0`, `follow-redirects@1.16.0`, `http-proxy@1.18.1`.

Unchanged identity pins kept from both blobs include `webpack@5.108.4`, `commander@14.0.3`, `colorette@2.0.20`.

Stored sha256: before `059a32626ca344e2c8b886857ce933eb174a94f2afdfd16ffa8cf193185ef8b8`, after `2347d285638d58957172e1e784f7ef293e705d4f20397d28a208f2c2f5db37eb`.

Not copied: W4 `tools/lockfile-pin-delta/fixtures/*`, W5-M07 corpora.
