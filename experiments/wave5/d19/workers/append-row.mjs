#!/usr/bin/env node
import { existsSync, writeFileSync } from "node:fs";
import { pathToFileURL } from "node:url";

const ledgerPath = process.argv[2];
const readyPath = process.argv[3];
const goPath = process.argv[4];
const ledgerLib = process.argv[5];
const row = JSON.parse(process.argv[6]);
const { appendRow } = await import(pathToFileURL(ledgerLib).href);
writeFileSync(readyPath, "1\n");
while (!existsSync(goPath)) {
  Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 1);
}
appendRow(ledgerPath, row);
