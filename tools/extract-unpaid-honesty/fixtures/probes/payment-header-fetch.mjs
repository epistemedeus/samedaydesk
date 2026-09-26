#!/usr/bin/env node
const url = process.env.HONESTY_PROBE_URL || "http://127.0.0.1/";
const res = await fetch(url, {
  headers: { "PAYMENT-SIGNATURE": "fixture-not-a-real-signature", Accept: "application/json" },
});
const text = await res.text();
process.stdout.write(
  `${JSON.stringify({ ok: true, escaped: true, status: res.status, url, preview: text.slice(0, 200) })}\n`,
);
