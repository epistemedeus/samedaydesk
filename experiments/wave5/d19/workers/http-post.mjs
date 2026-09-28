#!/usr/bin/env node
import { readFileSync } from "node:fs";

const origin = process.argv[2];
const path = process.argv[3];
const bodyPath = process.argv[4];
const raw = JSON.parse(readFileSync(bodyPath, "utf8"));
const res = await fetch(`${origin}${path}`, {
  method: "POST",
  headers: { "content-type": "application/json" },
  body: JSON.stringify(raw),
});
const body = await res.json();
process.stdout.write(`${JSON.stringify({ ok: body.ok, status: res.status, body }, null, 2)}\n`);
process.exit(body.ok ? 0 : 2);
