#!/usr/bin/env node
import { composePublishedCatalog } from "../lib/compose-catalog.mjs";

const { out, published } = composePublishedCatalog();
process.stdout.write(`${JSON.stringify({ ok: true, out, counts: published.counts, purchaseAuthority: false }, null, 2)}\n`);
