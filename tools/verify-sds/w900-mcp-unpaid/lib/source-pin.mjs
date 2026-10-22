/**
 * Bind unpaid MCP fixtures to the committed SDS apex MCP source.
 * Reads server/routes/mcp.js as text (never imports Express/Stripe).
 */
import { createHash } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

export const TOOLS_BLOCK_START = "const TOOLS = [";
export const TOOLS_BLOCK_END = "const okMsg";

/** Same pin as server/scripts/test-mcp-protocol-negotiation.js. */
export const PINNED_TOOLS_BLOCK_SHA256 =
  "068cbfdb8ddab4dac7eef335d51fbe347728d6ccca65bef0365a3eb831db6caf";

export const MCP_SOURCE_REL = "server/routes/mcp.js";
export const INVENTORY_REL = "server/lib/mcp-tool-inventory.js";
export const NEGOTIATION_TEST_REL = "server/scripts/test-mcp-protocol-negotiation.js";

const here = dirname(fileURLToPath(import.meta.url));

export function findRepoRoot(start = here) {
  let dir = start;
  for (let i = 0; i < 10; i++) {
    if (existsSync(join(dir, MCP_SOURCE_REL)) && existsSync(join(dir, INVENTORY_REL))) {
      return dir;
    }
    const parent = dirname(dir);
    if (parent === dir) break;
    dir = parent;
  }
  const err = new Error("cannot locate samedaydesk repo root (missing server/routes/mcp.js)");
  err.code = "HOST_BUILD";
  throw err;
}

export function sha256(text) {
  return createHash("sha256").update(text, "utf8").digest("hex");
}

export function extractToolsBlock(src) {
  const start = src.indexOf(TOOLS_BLOCK_START);
  const end = src.indexOf(TOOLS_BLOCK_END, start);
  if (start < 0 || end <= start) {
    const err = new Error("MCP source missing TOOLS block");
    err.code = "HOST_BUILD";
    throw err;
  }
  return src.slice(start, end);
}

export function extractNegotiationSha(src) {
  const m = src.match(/FROZEN_TOOLS_BLOCK_SHA256\s*=\s*"([0-9a-f]{64})"/);
  return m ? m[1] : null;
}

export function parseInventoryNames(src) {
  const m = src.match(/MCP_TOOL_NAMES\s*=\s*Object\.freeze\(\[([\s\S]*?)\]\)/);
  if (!m) {
    const err = new Error("inventory missing MCP_TOOL_NAMES freeze");
    err.code = "HOST_BUILD";
    throw err;
  }
  return [...m[1].matchAll(/"([^"]+)"/g)].map((hit) => hit[1]);
}

export function readPinnedSource(root = findRepoRoot()) {
  const mcpPath = join(root, MCP_SOURCE_REL);
  const invPath = join(root, INVENTORY_REL);
  const testPath = join(root, NEGOTIATION_TEST_REL);
  const mcpSource = readFileSync(mcpPath, "utf8");
  const inventorySource = readFileSync(invPath, "utf8");
  const toolsBlock = extractToolsBlock(mcpSource);
  const names = parseInventoryNames(inventorySource);
  let negotiationSha = null;
  if (existsSync(testPath)) {
    negotiationSha = extractNegotiationSha(readFileSync(testPath, "utf8"));
  }
  return {
    root,
    mcpPath,
    invPath,
    toolsBlock,
    sha256: sha256(toolsBlock),
    names,
    negotiationSha,
    protocolMatch: /const PROTOCOL_VERSION = "2024-11-05"/.test(mcpSource),
    serverNameMatch: /name:\s*"samedaydesk-agent-tools"/.test(mcpSource),
    paidToolInSource: mcpSource.includes("generate_complete_fix_pack"),
  };
}

export function assertSourcePin({
  expectedSha = PINNED_TOOLS_BLOCK_SHA256,
  root = findRepoRoot(),
} = {}) {
  const pin = readPinnedSource(root);
  if (!pin.protocolMatch) {
    const err = new Error("MCP source must pin protocol 2024-11-05");
    err.code = "HOST_BUILD";
    throw err;
  }
  if (!pin.serverNameMatch) {
    const err = new Error("MCP source missing samedaydesk-agent-tools serverInfo");
    err.code = "HOST_BUILD";
    throw err;
  }
  if (pin.sha256 !== expectedSha) {
    const err = new Error(`tools-block sha mismatch: got ${pin.sha256} want ${expectedSha}`);
    err.code = "TOOLS_SHA_MISMATCH";
    err.got = pin.sha256;
    err.want = expectedSha;
    throw err;
  }
  if (pin.negotiationSha && pin.negotiationSha !== pin.sha256) {
    const err = new Error(
      `negotiation test sha ${pin.negotiationSha} != source sha ${pin.sha256}`,
    );
    err.code = "TOOLS_SHA_MISMATCH";
    err.got = pin.sha256;
    err.want = pin.negotiationSha;
    throw err;
  }
  return pin;
}
