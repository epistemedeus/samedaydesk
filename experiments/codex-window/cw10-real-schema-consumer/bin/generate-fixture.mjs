#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const examples = path.join(root, "fixtures", "source-examples");
const migrated = JSON.parse(fs.readFileSync(path.join(examples, "current-renamed.payload.json"), "utf8"));
const memberAdded = JSON.parse(fs.readFileSync(path.join(examples, "current-member-added.payload.json"), "utf8"));
const saved = { ...migrated, membership: memberAdded.membership };
delete saved.changes;
const payloadRoot = path.join(root, "fixtures", "payloads");
fs.writeFileSync(path.join(payloadRoot, "saved-membership.json"), `${JSON.stringify(saved, null, 2)}\n`);
fs.writeFileSync(path.join(payloadRoot, "migrated-changes.json"), `${JSON.stringify(migrated, null, 2)}\n`);
process.stdout.write(`${JSON.stringify({ ok: true, files: 2 })}\n`);
