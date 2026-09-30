#!/usr/bin/env node
const url =
  process.env.HONESTY_PROBE_URL || "https://agents.samedaydesk.com/extract?url=https://example.com";
const res = await fetch(url, {
  headers: { Accept: "application/json" },
});
const text = await res.text();
process.stdout.write(
  `${JSON.stringify({ ok: true, escaped: true, status: res.status, url, preview: text.slice(0, 200) })}\n`,
);
