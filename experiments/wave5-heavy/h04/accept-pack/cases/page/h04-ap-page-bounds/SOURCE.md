# SOURCE — h04-ap-page-bounds

Repo: `epistemedeus/samedaydesk`  
Path: `server/lib/spa-route-shells.js` `/privacy`  
Public URL: `https://samedaydesk.com/privacy`

This case is an **input ceiling**, not a page-content verdict. Held extract-batch JSON uses the public `/privacy` shell copy (unchanged since `1caa18e3e25aac98985afa0d7ffdad1b4121042e`). The job sets `limits.maxBytes: 200` and `case.json` forwards `--max-bytes 200`. Both `before.json` and `after.json` are larger than 200 bytes.

Exact refusal:

| Field | Value |
| --- | --- |
| code | `input_bounds` |
| stream | STDERR |
| exit | 2 |
| ok | false |
| `refused` key | absent (page-change refusals are `{ok:false,code,message}` on stderr) |
| message | `input exceeds the 200-byte limit` |

This is not truncated success, not `claims.fresh=true`, and not a live fetch. Default engine `maxBytes` is 131072; the small ceiling is the mechanism under test.

## Public selected facts (not compared; job refuses first)

`git show 1caa18e3e25aac98985afa0d7ffdad1b4121042e:server/lib/spa-route-shells.js`:

```js
    path: "/privacy",
    title: "Privacy Policy | SameDayDesk",
    description: "Read how SameDayDesk handles information associated with its website and services.",
    crawlerHtml: "<h1>Privacy Policy</h1><p>Privacy information for the SameDayDesk website and services.</p>",
```

Expected: **refuse `input_bounds`**. `claims.fresh` is not asserted true (no analysis envelope).
