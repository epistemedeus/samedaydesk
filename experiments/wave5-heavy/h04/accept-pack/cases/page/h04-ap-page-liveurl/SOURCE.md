# SOURCE — h04-ap-page-liveurl

Mechanism case: `job.json` `before` and `after` are **http(s) URL strings**, as if the caller requested a live fetch of extract-batch JSON.

```json
"before": "http://127.0.0.1:9/h04-ap-page-liveurl-before.json",
"after": "http://127.0.0.1:9/h04-ap-page-liveurl-after.json"
```

Port 9 on loopback is unused. The engine must refuse **before** opening a socket. M01 pin tests use the same `http://127.0.0.1:…` pattern and assert server hits = 0.

Exact refusal:

| Field | Value |
| --- | --- |
| code | `live_fetch_url` |
| stream | STDERR |
| exit | 2 |
| ok | false |
| `refused` key | absent |
| message | `live fetch URL input is refused; supply already-held local extract-batch JSON files` |
| network | none |

Sibling `before.json` / `after.json` are unused held snapshots of the public `/privacy` shell (same copy as h04-ap-page-bounds). A runner **must not** substitute those local files for the URL strings in `job.json` (`doNotSubstituteLocalFilesForJobUrls`). Prefer `run-job.mjs page-change-offline-job --job job.json --out-dir DIR`.

Not a live re-fetch of `https://samedaydesk.com/privacy`. `claims.fresh` must stay false (no analysis envelope; refusal path).
