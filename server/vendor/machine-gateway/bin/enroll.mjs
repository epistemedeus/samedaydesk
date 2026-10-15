#!/usr/bin/env node
import { randomBytes } from "node:crypto";
import { argumentsFor, privateText, savePrivate } from "./client-io.mjs";
import { sha256, boundedJson } from "../src/util.mjs";
import { validate } from "../src/schemas.mjs";
try {
  const args = argumentsFor(process.argv.slice(2), ["tenant", "config", "token-file", "max-calls"]);
  let config = { tenants: [] };
  try { config = boundedJson(privateText(args.config, 524288), 524288); }
  catch (error) { if (error.code !== "ENOENT") throw error; }
  if (config.tenants.some(t => t.id === args.tenant)) throw new Error("tenant_exists");
  const token = randomBytes(32).toString("base64url");
  config.tenants.push({ id: args.tenant, tokenSha256: sha256(token), routes: ["lockfile.delta", "http.capture"],
    maxUnits: 0, maxCalls: Number(args["max-calls"] || 1000), maxConcurrent: 2 });
  validate("tenantConfig", config);
  savePrivate(args["token-file"], `${token}\n`, { exclusive: true });
  // A single operator enrollment at a time. Existing config is atomically replaced.
  savePrivate(args.config, `${JSON.stringify(config, null, 2)}\n`);
  console.log(JSON.stringify({ enrolled: args.tenant, paidBudget: 0, credentialWritten: true }));
} catch { console.error("enrollment_failed"); process.exitCode = 1; }
