import { ENVELOPE, negotiate } from './core.mjs';
import { bounded, requireValue } from './safe.mjs';

// Opt-in sidecar. Do not merge a new field into an old service's JSON/error shape.
function optionalNegotiation(negotiation, context) {
  try { return negotiate(negotiation, context); } catch { return null; }
}
export function jsonBoundary(original, negotiation, hostContext) {
  const participation = optionalNegotiation(negotiation, hostContext);
  return participation === null ? original : { original, participation };
}
// Preserves status, headers and the exact original body handle, including streams.
// Host chooses how to carry the sidecar; existing HTTP routes remain unchanged.
export function httpBoundary(response, negotiation, hostContext) {
  const participation = optionalNegotiation(negotiation, hostContext);
  return { response, participation };
}
// Application-level machine result. No MCP SDK is imported and no official
// protocol extension is claimed. Host may carry this in its own tool schema.
export function toolBoundary(result, negotiation, hostContext) {
  const participation = optionalNegotiation(negotiation, hostContext);
  return participation === null ? result : { schema: 'neomorphic.foundry.participation-tool-result.v1', result, participation };
}
export function parseNegotiation(raw) {
  const x = bounded(raw, { maxBytes: 4096 });
  requireValue(x && Object.keys(x).every(k => ['accepts', 'modes', 'budgetSeconds'].includes(k)));
  return x;
}
export const negotiationExample = Object.freeze({ accepts: [ENVELOPE], budgetSeconds: 60, modes: ['report-gap', 'counterexample'] });

// Embedders retain original stdout/stderr/exitCode and write the optional sidecar
// only to a separately negotiated descriptor/file. Never append JSON to old stdout.
export function cliBoundary(original, negotiation, hostContext) {
  return { original, participation: optionalNegotiation(negotiation, hostContext) };
}
