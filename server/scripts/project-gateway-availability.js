import { readFileSync, writeFileSync } from "node:fs";
import { pathToFileURL } from "node:url";
import { AVAILABILITY_PATH, gatewayAvailability, gatewayGuideBlock, readGatewayState, validateGatewayState } from "../lib/paid-gateway-availability.js";

export function projectGatewayFiles({ guide, state }) {
  if (!/<!-- paid-gateway:start -->[\s\S]*?<!-- paid-gateway:end -->/.test(guide)) throw new Error("Gateway guide block missing");
  return {
    guide: guide.replace(/<!-- paid-gateway:start -->[\s\S]*?<!-- paid-gateway:end -->/, gatewayGuideBlock(state)),
    descriptor: `${JSON.stringify(gatewayAvailability(state), null, 2)}\n`,
  };
}

export function receiveGatewayState(previous, candidate) {
  validateGatewayState(candidate);
  if (previous.observedAt && !(Date.parse(candidate.observedAt) > Date.parse(previous.observedAt))) {
    throw new Error("Restoration requires new receiving after the previous state");
  }
  return candidate;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const args = process.argv.slice(2);
  if (args.length && !(args.length === 2 && args[0] === "--receive")) throw new Error("Usage: project-gateway-availability.js [--receive RECEIVED_STATE.json]");
  const previous = readGatewayState();
  const state = args.length ? receiveGatewayState(previous, JSON.parse(readFileSync(args[1], "utf8"))) : previous;
  const guidePath = new URL("../../client/public/llms.txt", import.meta.url);
  const result = projectGatewayFiles({ guide: readFileSync(guidePath, "utf8"), state });
  if (args.length) writeFileSync(AVAILABILITY_PATH, `${JSON.stringify(state, null, 2)}\n`);
  writeFileSync(guidePath, result.guide);
  writeFileSync(new URL("../../client/public/discovery/paid-gateway.json", import.meta.url), result.descriptor);
}
