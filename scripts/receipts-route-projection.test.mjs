import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { test } from "node:test";
import { applyRouteExport, applySavedReceipts } from "./receipts-route-projection.mjs";

const address = (character) => "0x" + character.repeat(40);
const hash = (character) => "0x" + character.repeat(64);
const makeRow = (character, route, internal = false) => ({ transaction: hash(character), route, internal });
const receipt = (character, owner) => ({
  kind: "settlement", payer: { address: owner, class: "unresolved" },
  chain: { transactionHash: hash(character), network: "eip155:8453", status: "success" },
  proof: `https://basescan.org/tx/${hash(character)}`, tool: null,
});
const previous = { about: "lookup", tools: { "/extract": { tool: "extract", what: "read a page" } }, joins: {} };

test("exact route projection filters both current payer policy and recorded internal transactions", () => {
  const rows = [
    makeRow("a", "/enrich"), makeRow("b", "/extract", true), makeRow("c", "/extract"),
    makeRow("d", "/not-in-catalog"),
  ];
  const internalHashes = [createHash("sha256").update(address("1")).digest("hex")];
  const exportResult = applyRouteExport(previous, { rows, internalHashes, invalid: 0 });
  const tape = applySavedReceipts({
    schema: "samedaydesk.receipts.v2", classes: { ourOwnWalletsLeftOut: 2 },
    chainReadThroughBlock: 42, generatedAt: "2026-11-20T00:00:00Z",
    entries: [receipt("a", address("2")), receipt("b", address("2")), receipt("c", address("1")), receipt("d", address("3"))],
  }, exportResult);
  assert.equal(tape.count, 2);
  assert.equal(tape.classes.ourOwnWalletsLeftOut, 4);
  assert.equal(tape.chainReadThroughBlock, 42);
  assert.equal(tape.generatedAt, "2026-11-20T00:00:00Z");
  assert.equal(tape.entries[0].tool.name, "enrich");
  assert.equal(tape.entries[1].tool, null);
  assert.doesNotMatch(JSON.stringify(exportResult.routes), new RegExp(hash("b")));
  assert.doesNotMatch(JSON.stringify(exportResult.routes), new RegExp(internalHashes[0]));
});

test("colliding, corrupt and unknown evidence never creates a confident route", () => {
  const current = { ...previous, joins: { [hash("a")]: { route: "/extract" } } };
  assert.throws(() => applyRouteExport(current, { rows: [makeRow("a", "/enrich")], internalHashes: [], invalid: 0 }), /conflicting/);
  assert.throws(() => applyRouteExport(previous, { rows: [makeRow("a", "/extract"), makeRow("a", "/extract")], internalHashes: [], invalid: 0 }), /duplicate/);
  assert.throws(() => applyRouteExport(previous, { rows: [], internalHashes: [], invalid: 1 }), /incomplete/);
});
