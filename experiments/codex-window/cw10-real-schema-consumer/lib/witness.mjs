import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import Ajv from "ajv";
import addFormats from "ajv-formats";
import { root, hashFile, readJson, writeJson } from "./runtime.mjs";

export const manifest = readJson(path.join(root, "fixtures/manifest.json"));
export const pairRoot = path.join(root, "fixtures/upstream/organization-renamed");

export function verifySources(base = root) {
  for (const entry of manifest.source.files) {
    const file = path.join(base, entry.file);
    assert.equal(fs.statSync(file).size, entry.bytes, `${entry.file} bytes`);
    assert.equal(hashFile(file), entry.sha256, `${entry.file} SHA-256`);
  }
  assert.equal(manifest.source.afterCommit, manifest.source.changeCommit);
  assert.equal(manifest.source.beforeCommit, manifest.source.verifiedParent);
}

function walk(value, fn) {
  if (!value || typeof value !== "object") return;
  if (!Array.isArray(value)) fn(value);
  for (const child of Object.values(value)) walk(child, fn);
}

export function validatorFor(side) {
  const entries = manifest.source.files.filter((entry) => entry.file.startsWith(`fixtures/upstream/organization-renamed/${side}/`));
  const docs = entries.map((entry) => readJson(path.join(root, entry.file)));
  const ajv = new Ajv({ allErrors: true, strict: false, validateFormats: true });
  addFormats(ajv);
  const formats = new Set(); const refs = new Set();
  for (const doc of docs) {
    assert.equal(doc.$schema, manifest.dialect);
    walk(doc, (node) => {
      if (node.format) {
        assert(ajv.formats[node.format], `Unknown Draft7 format ${node.format}`);
        formats.add(node.format);
      }
      if (node.$ref) refs.add(node.$ref);
    });
    ajv.addSchema(doc);
  }
  // Compile every reachable resource, including the optional installation
  // branch, without loadSchema/network access. Ajv resolves refs using $id.
  for (const doc of docs) assert(ajv.getSchema(doc.$id), `Unresolved ${doc.$id}`);
  const validate = ajv.getSchema("organization$renamed");
  return { validate, closure: { resources: docs.map((doc) => doc.$id).sort(), refs: [...refs].sort(), formats: [...formats].sort(), dialect: manifest.dialect, network: false } };
}

export function evaluateWitnesses() {
  verifySources();
  const before = validatorFor("before"), after = validatorFor("after");
  const saved = readJson(path.join(root, "fixtures/payloads/saved-membership.json"));
  const migrated = readJson(path.join(root, "fixtures/payloads/migrated-changes.json"));
  const example = readJson(path.join(root, "fixtures/source-examples/change-renamed.payload.json"));
  const member = readJson(path.join(root, "fixtures/source-examples/parent-member-added.payload.json"));
  const composed = { ...example, membership: member.membership }; delete composed.changes;
  assert.deepEqual(saved, composed, "saved payload derivation from pinned examples");
  assert.deepEqual(migrated, example, "migrated payload is pinned official example");
  const addOnly = { ...saved, changes: migrated.changes };
  const removeOnly = { ...saved }; delete removeOnly.membership;
  const patchResult = { ...saved, changes: migrated.changes }; delete patchResult.membership;
  assert.deepEqual(manifest.migration.jsonPatch, [
    { op: "add", path: "/changes", value: migrated.changes },
    { op: "remove", path: "/membership" },
  ], "documented migration uses exactly the validated operations");
  assert.deepEqual(patchResult, migrated, "both migration operations reproduce official example exactly");
  const cases = {
    "saved-membership.json": saved, "migrated-changes.json": migrated,
    "add-changes-only": addOnly, "remove-membership-only": removeOnly,
    "invalid-uri-control": { ...migrated, organization: { ...migrated.organization, url: "not a uri" } },
    "invalid-changes-from-control": { ...migrated, changes: { login: { from: 12 } } },
    "invalid-optional-installation-control": { ...migrated, installation: { id: "wrong" } },
  };
  const witness = {};
  for (const [name, payload] of Object.entries(cases)) {
    const beforeValid = before.validate(payload), beforeErrors = structuredClone(before.validate.errors);
    const afterValid = after.validate(payload), afterErrors = structuredClone(after.validate.errors);
    witness[name] = { beforeValid, afterValid, beforeErrors, afterErrors };
  }
  assert.equal(witness["saved-membership.json"].beforeValid, true);
  assert.equal(witness["saved-membership.json"].afterValid, false);
  assert.equal(witness["migrated-changes.json"].beforeValid, false);
  assert.equal(witness["migrated-changes.json"].afterValid, true);
  const errors = witness["saved-membership.json"].afterErrors;
  assert(errors.some((e) => e.instancePath === "" && e.keyword === "required" && e.params.missingProperty === "changes"));
  assert(errors.some((e) => e.instancePath === "" && e.keyword === "additionalProperties" && e.params.additionalProperty === "membership"));
  assert.equal(errors.length, 2, "only the two claimed root changes reject the old payload");
  for (const name of ["add-changes-only", "remove-membership-only"]) {
    assert.equal(witness[name].afterValid, false);
    assert.equal(witness[name].afterErrors.length, 1, "one remaining migration operation");
  }
  for (const name of Object.keys(cases).filter((name) => name.endsWith("-control"))) assert.equal(witness[name].afterValid, false);
  assert(witness["invalid-uri-control"].afterErrors.some((e) => e.keyword === "format"));
  return { witness, closure: { before: before.closure, after: after.closure }, validator: { name: "Ajv", version: "8.17.1", formats: "3.0.1", dataMutation: false } };
}

// A declared projection, not a vendored full schema: retains exactly the root
// acceptance constraints and property names, relaxing every property's value.
// The full-schema Ajv witnesses above establish that this weakening preserves
// the counterexample. No relative refs or unsupported combinators are needed.
export function regressionProjection(doc) {
  return { $schema: doc.$schema, type: doc.type, required: doc.required,
    properties: Object.fromEntries(Object.keys(doc.properties).map((key) => [key, {}])),
    additionalProperties: doc.additionalProperties };
}

export function writeRegression(directory) {
  fs.mkdirSync(directory, { recursive: true });
  for (const side of ["before", "after"]) writeJson(path.join(directory, `${side}.json`), regressionProjection(readJson(path.join(pairRoot, side, "schema.json"))));
  writeJson(path.join(directory, "used.json"), { pointers: [""] });
}
