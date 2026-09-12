#!/usr/bin/env node
import { readFile } from "node:fs/promises";
import { digestResponseBytes } from "../src/digest.mjs";
import { recordFromObservedResponse, openStore } from "../src/store.mjs";

const args = parseArgs(process.argv.slice(2));
if (args.help) {
  process.stdout.write(`Bind caller-observed HTTP response bytes to the D17 contract.

Usage:
  node bin/validate-http-delivery.mjs --method GET --resource /extract \\
    --bytes-file ./response.bin --merchant-http-status 200 \\
    --settlement-class simulated [--store-dir DIR]

Does not retain raw body, query, credentials, or wallet keys.
`);
  process.exit(0);
}

const bytes = args.bytesFile
  ? await readFile(args.bytesFile)
  : Buffer.from(args.bytesUtf8 || "", "utf8");

const record = recordFromObservedResponse({
  method: args.method,
  resource: args.resource,
  responseBytes: bytes,
  merchantHttpStatus: args.merchantHttpStatus,
  settlementClass: args.settlementClass,
  settlementReference: args.settlementReference,
  payerClass: args.payerClass || "unclassified",
});

if (args.storeDir) {
  const store = openStore(args.storeDir);
  await store.appendValidation(record);
}

process.stdout.write(`${JSON.stringify({
  responseDigest: digestResponseBytes(bytes),
  record,
}, null, 2)}\n`);

function parseArgs(argv) {
  const out = { help: false, settlementClass: "simulated" };
  for (let i = 0; i < argv.length; i += 1) {
    const token = argv[i];
    if (token === "--help") out.help = true;
    else if (token === "--method") out.method = argv[++i];
    else if (token === "--resource") out.resource = argv[++i];
    else if (token === "--bytes-file") out.bytesFile = argv[++i];
    else if (token === "--bytes-utf8") out.bytesUtf8 = argv[++i];
    else if (token === "--merchant-http-status") out.merchantHttpStatus = Number(argv[++i]);
    else if (token === "--settlement-class") out.settlementClass = argv[++i];
    else if (token === "--settlement-reference") out.settlementReference = argv[++i];
    else if (token === "--payer-class") out.payerClass = argv[++i];
    else if (token === "--store-dir") out.storeDir = argv[++i];
  }
  return out;
}
