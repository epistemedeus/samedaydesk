# OSS reuse

Primary registry reads on 2026-10-11, used by this package. No other matching library is vendored.

| Package | Version | License | Registry modified | Role |
| --- | --- | --- | --- | --- |
| [ajv](https://github.com/ajv-validator/ajv) | 8.20.0 | MIT | 2026-04-24 | Compiles the acquired JSON Schemas and checks probe bodies and task witnesses. `npm view ajv version license description repository.url` returned version 8.20.0, MIT, "Another JSON Schema Validator", `git+https://github.com/ajv-validator/ajv.git`. |
| [ipaddr.js](https://github.com/whitequark/ipaddr.js) | 2.5.0 | MIT | 2026-08-04 | Classifies literal addresses. A target is refused unless `range()` is `unicast`, after IPv4-mapped addresses are unwrapped. `npm view ipaddr.js version license description repository.url time.modified` returned 2.5.0, MIT, "A library for manipulating IPv4 and IPv6 addresses in JavaScript.", `git+https://github.com/whitequark/ipaddr.js.git`, modified 2026-08-04. |

The SameDayDesk server already depends on ipaddr.js 1.9.1 for its own probe policy. This cold package pins 2.5.0 so `npm install` of the tarball does not import server code. Selection itself does not use a search or fuzzy-match library: output support is required-path, type, const, enum, and array-item checks against the catalog schema, then Ajv for instances.

OpenAPI 3.1 can carry JSON Schema 2020-12. The acquired operation schemas use the draft-07-compatible subset Ajv 8 compiles with `allowUnionTypes` (`type`, `properties`, `required`, `enum`, `const`, `items`, `additionalProperties`). A schema Ajv cannot compile is `schema_unsupported` and is not treated as a match.
