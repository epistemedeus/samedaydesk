#!/usr/bin/env node
import { randomUUID } from "node:crypto";
import { argumentsFor, privateText, inputText, savePrivate, baseUrl, request, showHelp } from "./client-io.mjs";
import { boundedJson, digest, sha256 } from "../src/util.mjs";
import { validate } from "../src/schemas.mjs";

showHelp('node bin/caller.mjs --base-url HTTPS_URL --token-file ABS_PRIVATE_FILE --state-file ABS_PRIVATE_FILE --route ROUTE --input-file FILE\n'
  + '       node bin/caller.mjs --base-url HTTPS_URL --token-file ABS_PRIVATE_FILE --state-file ABS_PRIVATE_FILE --resume\n'
  + 'Free routes only. Add --allow-loopback for an explicitly local HTTP test. Saves intent before execution; resume keeps its idempotency key.');

try {
  const args = argumentsFor(process.argv.slice(2), ["base-url", "token-file", "state-file", "input-file", "route", "resume", "allow-loopback"], ["resume", "allow-loopback"]);
  const base = baseUrl(args["base-url"], args["allow-loopback"]);
  const token = privateText(args["token-file"], 512).trim();
  if (!/^[A-Za-z0-9_-]{32,256}$/.test(token)) throw new Error("invalid_credential");
  const tenantBinding = sha256(token);
  let state;
  try { state = boundedJson(privateText(args["state-file"])); }
  catch (error) { if (error.code !== "ENOENT") throw error; if (args.resume) throw new Error("state_missing"); }
  let input;
  if (args["input-file"]) input = boundedJson(inputText(args["input-file"]));
  if (!state) {
    if (!input || !args.route) throw new Error("input_and_route_required");
    const quote = validate("quote", await request(base, "/v1/quote", { token, body: { routeId: args.route, input } }), { response: true });
    if (quote.price.amount !== 0 || !quote.tenantBound || !quote.executable) throw new Error("free_route_required");
    state = { schema: "neomorphic.machine-gateway.caller-state.v1", base, tenantBinding, route: args.route,
      request: { quoteId: quote.quoteId, input, maxUnits: 0 }, key: randomUUID(), receipt: null };
    try { savePrivate(args["state-file"], JSON.stringify(state), { exclusive: true }); }
    catch (error) { if (error.code !== "EEXIST") throw error; state = boundedJson(privateText(args["state-file"])); }
  }
  if (state.schema !== "neomorphic.machine-gateway.caller-state.v1" || state.base !== base || state.tenantBinding !== tenantBinding ||
    (args.route && state.route !== args.route) || (input && digest(state.request.input) !== digest(input)) || state.request.maxUnits !== 0) throw new Error("caller_state_binding_conflict");
  const receipt = validate("receipt", await request(base, "/v1/execute", { token, body: state.request, key: state.key }), { response: true });
  const readback = validate("receipt", await request(base, `/v1/receipts/${receipt.id}`, { token }), { response: true });
  if (readback.requestDigest !== receipt.requestDigest || readback.id !== receipt.id) throw new Error("readback_mismatch");
  if (receipt.status !== "running" && digest(receipt) !== digest(readback)) throw new Error("readback_mismatch");
  if (state.receipt && state.receipt.status !== "running" && digest(state.receipt) !== digest(readback)) throw new Error("readback_mismatch");
  state.receipt = readback;
  savePrivate(args["state-file"], JSON.stringify(state));
  process.stdout.write(`${JSON.stringify(readback)}\n`);
  if (readback.status !== "completed") process.exitCode = readback.status === "running" ? 3 : 1;
} catch (error) {
  const code = /^[a-z_0-9]+$/.test(error.message) ? error.message : "caller_failed";
  process.stderr.write(`${JSON.stringify({ error: { code } })}\n`);
  process.exitCode = 1;
}
