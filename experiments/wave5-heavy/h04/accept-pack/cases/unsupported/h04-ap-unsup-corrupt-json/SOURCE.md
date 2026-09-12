# h04-ap-unsup-corrupt-json

Synthetic truncated JSON. `before.json` is the single character `{`.

M01 `tools/json-schema-webhook-drift/lib/parse.mjs` `parseJsonDocument`:

1. HTML/markup → `html-or-markup`
2. YAML/plain (does not start with `{` or `[`) → `not-json`
3. `JSON.parse` failure → `parse-error`

`{` starts with `{`, so it is not YAML. `JSON.parse("{")` throws. Expected refuse: `parse-error`. Oracle also accepts `not-json`.
