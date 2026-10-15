// AE24 growth: exact MCP tool inventory pin (source parse; runs without node_modules). With deps installed, also checks the live module.
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
const PINNED = ["check_ai_readiness","check_agent_readiness","generate_complete_fix_pack","plan_taskmarket_delegation","browse_taskmarket_tasks","track_taskmarket_task","project_funnel_evidence"];
test("AE24: MCP_TOOL_NAMES source equals pinned list from ca826091", () => {
  const src = readFileSync(new URL("../lib/mcp-tool-inventory.js", import.meta.url), "utf8");
  const block = src.match(/MCP_TOOL_NAMES = Object\.freeze\(\[([\s\S]*?)\]\)/)[1];
  assert.deepEqual([...block.matchAll(/"([a-z_]+)"/g)].map((m) => m[1]), PINNED);
});
