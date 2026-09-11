#!/usr/bin/env node
process.stderr.write(`${JSON.stringify({ ok: false, error: "only-on-stderr" })}\n`);
process.exit(2);
