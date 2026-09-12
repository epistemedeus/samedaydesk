# h04-ap-unsup-https-route

Synthetic external catalog locators. Not a downloaded routes.json. Not a loopback fixture.

```
--before https://example.com/routes.json
--after  https://example.com/routes.json
```

M01 `tools/route-table-diff/lib/io.mjs` `assertLoopbackHttp`:

- protocol must be `http:`
- hostname must be `127.0.0.1`, `localhost`, or `::1`

`https://example.com/routes.json` fails the protocol check: `external_catalog_refused`. Fetch is not attempted.

Runner note: pass the URL strings through. Do not `path.resolve` them (they are not files).
