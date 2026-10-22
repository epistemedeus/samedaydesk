import assert from "node:assert/strict";
import test from "node:test";
import { selectExactById } from "../lib/identity.mjs";
import { OfferRefuse } from "../lib/refuse.mjs";

test("unrelated first catalog item does not steal requested identity", () => {
  const rows = [{ id: "unrelated-first-item" }, { id: "lockfile-pin-delta" }, { id: "route-table-diff" }];
  assert.equal(selectExactById(rows, "lockfile-pin-delta").id, "lockfile-pin-delta");
});

test("duplicate matching identities refuse instead of choosing the first hit", () => {
  const rows = [{ id: "lockfile-pin-delta" }, { id: "other" }, { id: "lockfile-pin-delta" }];
  assert.throws(() => selectExactById(rows, "lockfile-pin-delta"), (err) => {
    assert.equal(err instanceof OfferRefuse, true);
    assert.equal(err.code, "duplicate-identity");
    return true;
  });
});

test("numeric index is not identity", () => {
  assert.throws(() => selectExactById([{ id: "lockfile-pin-delta" }], 0), (err) => {
    assert.equal(err.code, "index-is-not-identity");
    return true;
  });
});
