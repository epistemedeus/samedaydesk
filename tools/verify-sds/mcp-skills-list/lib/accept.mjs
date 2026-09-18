import {
  MCP_PROTOCOL,
  MCP_SERVER_INFO,
  SKILL_NAMES,
  SKILLS_EXTENSION,
  skillUri,
} from "./catalog.mjs";
import { loadExpectedSkills } from "./skills.mjs";

function fail(code, message, detail) {
  const err = new Error(message);
  err.code = code;
  if (detail !== undefined) err.detail = detail;
  throw err;
}

export function acceptInitialize(result) {
  if (!result || typeof result !== "object") {
    fail("PROTOCOL_REFUSE", "initialize result missing");
  }
  if (result.protocolVersion === "2026-07-28" && result.only === true) {
    fail(
      "PROTOCOL_REFUSE",
      "2026-07-28-only handshake is not a transport migration; SDS apex fail-closes to 2024-11-05",
      { protocolVersion: result.protocolVersion },
    );
  }
  if (result.protocolVersion !== MCP_PROTOCOL) {
    fail("PROTOCOL_REFUSE", `initialize must negotiate ${MCP_PROTOCOL}`, {
      protocolVersion: result.protocolVersion,
    });
  }
  if (result.serverInfo?.name !== MCP_SERVER_INFO.name) {
    fail("PROTOCOL_REFUSE", "unexpected serverInfo", { serverInfo: result.serverInfo });
  }
  const ext = result.capabilities?.extensions?.[SKILLS_EXTENSION];
  if (ext == null) {
    fail("PROTOCOL_REFUSE", `initialize must declare ${SKILLS_EXTENSION}`, {
      capabilities: result.capabilities,
    });
  }
  return true;
}

export function acceptSkillsList(result, expected) {
  const rpcError = result?.error;
  if (rpcError && (rpcError.code === -32601 || rpcError.code === "-32601")) {
    fail(
      "METHOD_NOT_FOUND",
      "refusing claim that skills/list already works: JSON-RPC -32601 is not a catalog",
      { code: rpcError.code, message: rpcError.message || "Method not found: skills/list" },
    );
  }

  if (result && result.ok === true && (!Array.isArray(result.skills) || result.skills.length === 0)) {
    fail("SILENT_EMPTY", "refusing HTTP-shaped success with empty skills list", {
      ok: true,
      skillCount: Array.isArray(result.skills) ? result.skills.length : 0,
    });
  }

  const skills = result?.skills;
  if (!Array.isArray(skills)) {
    fail("SILENT_EMPTY", "skills/list result.skills must be an array", { result });
  }

  const wellKnownShape = skills.some(
    (s) => s && Array.isArray(s.files) && s.resources == null && s.frontmatter == null,
  );
  if (wellKnownShape) {
    fail(
      "WELLKNOWN_IS_NOT_SKILLS_LIST",
      "HTTP /.well-known/skills/index.json is not SEP-2640 skills/list (no skill:// uri, no resources digest)",
      { sample: skills[0] },
    );
  }
  if (skills.length === 0) {
    fail("SILENT_EMPTY", "empty skills/list is not a SDS skills catalog", { skillCount: 0 });
  }
  if (!expected) expected = loadExpectedSkills();
  if (result.resultType && result.resultType !== "complete") {
    fail("SILENT_EMPTY", "skills/list resultType must be complete", {
      resultType: result.resultType,
    });
  }

  const names = skills.map((s) => s?.frontmatter?.name || s?.name);
  const missing = SKILL_NAMES.filter((n) => !names.includes(n));
  if (missing.length) {
    fail("MISSING_SKILL", `skills/list omitted required skill(s): ${missing.join(", ")}`, {
      missing,
      names,
    });
  }

  const extra = names.filter((n) => n && !SKILL_NAMES.includes(n));
  if (extra.length) {
    fail("MISSING_SKILL", `skills/list included unexpected skill(s): ${extra.join(", ")}`, {
      extra,
      names,
    });
  }

  if (names.length !== SKILL_NAMES.length || SKILL_NAMES.some((n, i) => names[i] !== n)) {
    fail("MISSING_SKILL", "skills/list must return the three SDS skills in catalog order", {
      expected: [...SKILL_NAMES],
      names,
    });
  }

  for (const file of expected) {
    const entry = skills.find((s) => (s?.frontmatter?.name || s?.name) === file.name);
    if (!entry) {
      fail("MISSING_SKILL", `missing skill entry ${file.name}`);
    }
    if (entry.uri !== skillUri(file.name)) {
      fail("MISSING_SKILL", `skill uri mismatch for ${file.name}`, {
        expected: skillUri(file.name),
        actual: entry.uri,
      });
    }
    if (entry.frontmatter?.description !== file.frontmatter.description) {
      fail("FRONTMATTER", `frontmatter description mismatch for ${file.name}`);
    }
    const resources = entry.resources;
    if (resources === "dynamic") {
      fail("DIGEST_MISMATCH", `${file.name} must publish a byte digest, not resources:dynamic`);
    }
    if (!Array.isArray(resources) || resources.length < 1) {
      fail("DIGEST_MISMATCH", `${file.name} resources manifest missing`);
    }
    const md = resources.find((r) => r.uri === file.uri) || resources[0];
    if (md.digest !== file.digest) {
      fail("DIGEST_MISMATCH", `resource digest mismatch for ${file.name}`, {
        expected: file.digest,
        actual: md.digest,
        size: file.size,
      });
    }
    if (md.size !== file.size) {
      fail("DIGEST_MISMATCH", `resource size mismatch for ${file.name}`, {
        expected: file.size,
        actual: md.size,
      });
    }
  }

  return {
    names,
    skills: skills.map((s) => ({
      name: s.frontmatter?.name,
      uri: s.uri,
      digest: s.resources?.[0]?.digest,
      size: s.resources?.[0]?.size,
    })),
  };
}
