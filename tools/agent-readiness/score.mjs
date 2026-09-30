// Score one captured host. Wrong-shaped documents fail closed: the check is
// `fail` with a stable code and is never promoted to `pass` from a nearby field.

import { CODES } from "./codes.mjs";
import {
  APEX_SERVER_NAME,
  GATEWAY_HOST,
  GATEWAY_SERVER_NAME,
  RPC_INIT_ID,
  RPC_TOOLS_ID,
  SUPPORTED_PROTOCOL_VERSIONS,
  absent,
  atomicAmount,
  bodyText,
  cardInterfaceUrl,
  cardShapeOk,
  contentType,
  discoveryName,
  header,
  hostOf,
  isHtml,
  isRedirect,
  parseJsonValue,
  parseRpc,
  presented,
  toolShapeOk,
} from "./shape.mjs";

export const CHECKS = Object.freeze([
  { id: "discovery.llms", weight: 5, family: "discovery" },
  { id: "discovery.robots", weight: 5, family: "discovery" },
  { id: "discovery.mcp_card", weight: 8, family: "discovery" },
  { id: "discovery.registry_auth", weight: 4, family: "discovery" },
  { id: "mcp.handshake.envelope", weight: 8, family: "mcp_handshake" },
  { id: "mcp.handshake.version", weight: 8, family: "mcp_handshake" },
  { id: "mcp.handshake.id_echo", weight: 6, family: "mcp_handshake" },
  { id: "mcp.tools_list.envelope", weight: 8, family: "tools_list" },
  { id: "mcp.tools_list.shape", weight: 8, family: "tools_list" },
  { id: "identity.server_name", weight: 6, family: "identity" },
  { id: "identity.origin_alignment", weight: 5, family: "identity" },
  { id: "identity.apex_gateway_split", weight: 6, family: "identity" },
  { id: "cors.preflight", weight: 5, family: "cors" },
  { id: "cors.allow_headers", weight: 4, family: "cors" },
  { id: "x402.manifest_shape", weight: 5, family: "x402" },
  { id: "x402.amount_atomic", weight: 4, family: "x402" },
  { id: "agent_card.shape", weight: 5, family: "agent_card" },
]);

const CHECK_WEIGHT = new Map(CHECKS.map((check) => [check.id, check.weight]));
const FAMILIES = Object.freeze([...new Set(CHECKS.map((check) => check.family))]);

export function gradeFor(score) {
  if (score >= 90) return "A";
  if (score >= 75) return "B";
  if (score >= 60) return "C";
  if (score >= 40) return "D";
  return "F";
}

function pass(detail) {
  return { status: "pass", code: null, detail };
}

function miss(detail) {
  return { status: "missing", code: null, detail };
}

function na(detail) {
  return { status: "not_applicable", code: null, detail };
}

function unseen(detail) {
  return { status: "not_observed", code: null, detail };
}

function blocked(detail) {
  return { status: "blocked", code: null, detail };
}

function fail(code, detail) {
  return { status: "fail", code, detail, failClosed: true };
}

function entry(capture, key) {
  return capture?.responses?.[key] || null;
}

function portfolioAbsent(role) {
  return role === "portfolio" || role === "public";
}

function mcpRequired(role) {
  return role === "apex" || role === "gateway";
}

function judgeText(entryValue, { requireUserAgent = false } = {}) {
  if (!entryValue || entryValue.unobserved) return unseen("not probed");
  if (absent(entryValue) || entryValue.status == null) return miss("absent");
  if (!presented(entryValue) || isHtml(entryValue)) {
    return fail(CODES.DISCOVERY_NOT_JSON, `status ${entryValue.status} is not a text discovery file`);
  }
  const text = bodyText(entryValue).trim();
  if (!text) return fail(CODES.DISCOVERY_WRONG_SHAPE, "empty discovery file");
  if (requireUserAgent && !/user-agent\s*:/i.test(text)) {
    return fail(CODES.DISCOVERY_WRONG_SHAPE, "robots.txt has no user-agent group");
  }
  return pass(requireUserAgent ? "robots.txt user-agent group present" : "text discovery file present");
}

function judgeMcpCard(entryValue, role) {
  if (!entryValue || entryValue.unobserved) return { check: unseen("mcp card not probed"), name: "" };
  if (absent(entryValue) || entryValue.status == null) {
    return {
      check: portfolioAbsent(role) ? na("no mcp.json on this host") : miss("mcp.json absent"),
      name: "",
    };
  }
  if (!presented(entryValue) || isHtml(entryValue)) {
    return { check: fail(CODES.DISCOVERY_NOT_JSON, "mcp.json is not JSON"), name: "" };
  }
  const parsed = parseJsonValue(entryValue);
  if (!parsed.ok) return { check: fail(CODES.DISCOVERY_NOT_JSON, "mcp.json did not parse"), name: "" };
  if (!parsed.value || typeof parsed.value !== "object" || Array.isArray(parsed.value)) {
    return { check: fail(CODES.DISCOVERY_NOT_OBJECT, "mcp.json JSON is not an object"), name: "" };
  }
  const name = discoveryName(parsed.value);
  const description = typeof parsed.value.description === "string" ? parsed.value.description.trim() : "";
  if (!name || !description) {
    return { check: fail(CODES.DISCOVERY_WRONG_SHAPE, "mcp.json needs name and description"), name };
  }
  return { check: pass(`mcp.json name ${name}`), name };
}

function judgeRegistry(entryValue, role) {
  if (!entryValue || entryValue.unobserved) return unseen("registry auth not probed");
  if (absent(entryValue) || entryValue.status == null) {
    return role === "apex" ? miss("mcp-registry-auth absent") : na("registry auth is an apex document");
  }
  if (!presented(entryValue) || isHtml(entryValue)) {
    return fail(CODES.DISCOVERY_NOT_JSON, "mcp-registry-auth is not the text proof");
  }
  const text = bodyText(entryValue).trim();
  if (!text.startsWith("v=MCPv1")) return fail(CODES.DISCOVERY_WRONG_SHAPE, "mcp-registry-auth must start v=MCPv1");
  return pass("mcp-registry-auth v=MCPv1");
}

function observeRpc(entryValue, codes) {
  if (!entryValue || entryValue.unobserved) return { kind: "unobserved" };
  if (absent(entryValue) || entryValue.status == null) return { kind: "absent" };
  if (!presented(entryValue)) return { kind: "http", status: entryValue.status };
  const parsed = parseRpc(entryValue, codes.notJson);
  if (!parsed.ok) return { kind: "not-json", code: parsed.code };
  const value = parsed.value;
  if (!value || typeof value !== "object" || Array.isArray(value)) return { kind: "not-object", code: codes.notObject };
  if (value.jsonrpc !== "2.0") return { kind: "not-jsonrpc", code: codes.notJsonrpc };
  return { kind: "rpc", value, requestId: entryValue.requestId };
}

function handshakeChecks(obs, role) {
  if (obs.kind === "unobserved") {
    return {
      envelope: unseen("initialize not probed"),
      idEcho: unseen("initialize not probed"),
      version: unseen("initialize not probed"),
      serverName: "",
      serverVersion: "",
      result: null,
    };
  }
  if (obs.kind === "absent" || obs.kind === "http") {
    const optional = portfolioAbsent(role) && !mcpRequired(role);
    const gap = optional
      ? na("no MCP handshake on this host")
      : miss(obs.kind === "http" ? `initialize HTTP ${obs.status}` : "initialize absent");
    return { envelope: gap, idEcho: gap, version: gap, serverName: "", serverVersion: "", result: null };
  }
  if (obs.kind !== "rpc") {
    return {
      envelope: fail(obs.code, "initialize is the wrong shape"),
      idEcho: blocked("handshake failed closed before id echo"),
      version: blocked("handshake failed closed before version"),
      serverName: "",
      serverVersion: "",
      result: null,
    };
  }
  const value = obs.value;
  const idOk = value.id === (obs.requestId ?? RPC_INIT_ID);
  const idEcho = idOk
    ? pass(`initialize echoed id ${value.id}`)
    : fail(CODES.HANDSHAKE_ID_MISMATCH, `initialize id ${JSON.stringify(value.id)} did not echo ${obs.requestId ?? RPC_INIT_ID}`);
  if (value.error && !value.result) {
    return {
      envelope: fail(CODES.HANDSHAKE_REJECTED, value.error.message || "initialize returned an error"),
      idEcho,
      version: blocked("error result is not a negotiated handshake"),
      serverName: "",
      serverVersion: "",
      result: null,
    };
  }
  if (!value.result || typeof value.result !== "object" || Array.isArray(value.result)) {
    return {
      envelope: fail(CODES.HANDSHAKE_MISSING_RESULT, "initialize has no result object"),
      idEcho,
      version: blocked("no result to version"),
      serverName: "",
      serverVersion: "",
      result: null,
    };
  }
  const serverName = typeof value.result.serverInfo?.name === "string" ? value.result.serverInfo.name : "";
  const serverVersion = typeof value.result.serverInfo?.version === "string" ? value.result.serverInfo.version : "";
  const envelope = serverName && serverVersion
    ? pass(`initialize ${serverName} ${serverVersion}`)
    : fail(CODES.HANDSHAKE_SERVER_INFO, "initialize result is missing serverInfo name and version");
  let version;
  const offered = value.result.protocolVersion;
  if (typeof offered !== "string" || !offered) version = fail(CODES.HANDSHAKE_VERSION_ABSENT, "protocolVersion absent");
  else if (!SUPPORTED_PROTOCOL_VERSIONS.includes(offered)) {
    version = fail(CODES.HANDSHAKE_VERSION_UNSUPPORTED, `protocolVersion ${offered} is not supported`);
  } else version = pass(`protocolVersion ${offered}`);
  return { envelope, idEcho, version, serverName, serverVersion, result: value.result };
}

function toolsChecks(obs) {
  if (obs.kind === "unobserved") {
    return { envelope: unseen("tools/list not probed"), shape: unseen("tools/list not probed") };
  }
  if (obs.kind === "absent" || obs.kind === "http") {
    return {
      envelope: miss(obs.kind === "http" ? `tools/list HTTP ${obs.status}` : "tools/list absent"),
      shape: blocked("no tools/list document"),
    };
  }
  if (obs.kind !== "rpc") {
    return {
      envelope: fail(obs.code, "tools/list is the wrong shape"),
      shape: blocked("tools/list failed closed before tool shape"),
    };
  }
  const value = obs.value;
  const idOk = value.id === (obs.requestId ?? RPC_TOOLS_ID);
  if (!idOk) {
    return {
      envelope: fail(CODES.TOOLS_LIST_ID_MISMATCH, `tools/list id ${JSON.stringify(value.id)} did not echo ${obs.requestId ?? RPC_TOOLS_ID}`),
      shape: blocked("id mismatch closes the tool list"),
    };
  }
  if (!value.result || typeof value.result !== "object" || Array.isArray(value.result) || !Array.isArray(value.result.tools)) {
    return {
      envelope: fail(CODES.TOOLS_LIST_MISSING_TOOLS, "tools/list result.tools is not an array"),
      shape: blocked("no tool array"),
    };
  }
  const tools = value.result.tools;
  if (tools.length === 0) {
    return {
      envelope: pass("tools/list array present"),
      shape: fail(CODES.TOOLS_LIST_TOOL_SHAPE, "tools/list is empty"),
    };
  }
  const names = new Set();
  for (const tool of tools) {
    if (!toolShapeOk(tool) || names.has(tool.name)) {
      return {
        envelope: pass("tools/list envelope accepted"),
        shape: fail(CODES.TOOLS_LIST_TOOL_SHAPE, "a tool is missing name, description, or inputSchema, or the name repeats"),
      };
    }
    names.add(tool.name);
  }
  return {
    envelope: pass(`tools/list ${tools.length} tools`),
    shape: pass(`${tools.length} tools have name, description, and inputSchema`),
  };
}

function judgeCors(entryValue, role, handshakeKind) {
  if ((handshakeKind === "absent" || handshakeKind === "unobserved" || handshakeKind === "http") && portfolioAbsent(role)) {
    return { preflight: na("CORS applies when MCP is offered"), headers: na("CORS applies when MCP is offered") };
  }
  if (!entryValue || entryValue.unobserved) {
    return { preflight: unseen("CORS preflight not probed"), headers: unseen("CORS headers not probed") };
  }
  const status = Number(entryValue.status);
  if (!entryValue.status || (status !== 204 && status !== 200)) {
    return {
      preflight: fail(CODES.CORS_PREFLIGHT_ABSENT, "MCP preflight did not return 204 or 200"),
      headers: blocked("no preflight"),
    };
  }
  const origin = header(entryValue, "access-control-allow-origin");
  const methods = header(entryValue, "access-control-allow-methods")
    .split(",")
    .map((part) => part.trim().toUpperCase())
    .filter(Boolean);
  let preflight = pass("MCP preflight allows the probe origin");
  if (!origin) preflight = fail(CODES.CORS_ORIGIN_ABSENT, "Access-Control-Allow-Origin missing");
  else if (!methods.includes("POST")) preflight = fail(CODES.CORS_METHOD_ABSENT, "preflight does not allow POST");
  const allow = header(entryValue, "access-control-allow-headers")
    .split(",")
    .map((part) => part.trim().toLowerCase())
    .filter(Boolean);
  const headers = allow.includes("*") || allow.includes("content-type")
    ? pass("preflight allows Content-Type")
    : fail(CODES.CORS_HEADER_ABSENT, "preflight does not allow Content-Type");
  return { preflight, headers };
}

function judgeX402(entryValue, role) {
  if (!entryValue || entryValue.unobserved) {
    return { shape: unseen("x402 manifest not probed"), amount: unseen("x402 manifest not probed"), present: false };
  }
  if (absent(entryValue) || entryValue.status == null) {
    const gap = role === "gateway" ? miss("x402 manifest absent") : na("this host does not publish x402");
    return { shape: gap, amount: blocked("no manifest"), present: false };
  }
  if (!presented(entryValue) || isHtml(entryValue)) {
    return { shape: fail(CODES.X402_NOT_JSON, "x402 manifest is not JSON"), amount: blocked("manifest failed closed"), present: true };
  }
  const parsed = parseJsonValue(entryValue);
  if (!parsed.ok) {
    return { shape: fail(CODES.X402_NOT_JSON, "x402 manifest did not parse"), amount: blocked("manifest failed closed"), present: true };
  }
  if (!parsed.value || typeof parsed.value !== "object" || Array.isArray(parsed.value)) {
    return { shape: fail(CODES.X402_NOT_OBJECT, "x402 manifest JSON is not an object"), amount: blocked("manifest failed closed"), present: true };
  }
  const items = parsed.value.items;
  if (typeof parsed.value.x402Version !== "number" || !Array.isArray(items) || items.length === 0) {
    return { shape: fail(CODES.X402_WRONG_SHAPE, "x402 manifest needs x402Version and a non-empty items array"), amount: blocked("manifest failed closed"), present: true };
  }
  const originHost = hostOf(entryValue.finalUrl || "") || "";
  for (const item of items) {
    const resourceUrl = item?.resource?.url;
    if (resourceUrl && originHost && hostOf(resourceUrl) && hostOf(resourceUrl) !== originHost && entryValue.finalUrl) {
      return { shape: fail(CODES.X402_WRONG_SHAPE, "x402 resource host does not match the manifest host"), amount: blocked("manifest failed closed"), present: true };
    }
  }
  let amount = pass(`${items.length} x402 items use atomic amount strings`);
  for (const item of items) {
    const accepts = item?.accepts;
    if (!Array.isArray(accepts) || accepts.length === 0 || accepts.some((row) => !atomicAmount(row?.amount))) {
      amount = fail(CODES.X402_AMOUNT_NOT_ATOMIC, "an x402 amount is not a positive integer string");
      break;
    }
  }
  return { shape: pass(`x402Version ${parsed.value.x402Version} with ${items.length} items`), amount, present: true };
}

function judgeCard(entryValue, role) {
  if (!entryValue || entryValue.unobserved) {
    return { check: unseen("agent card not probed"), interfaceHost: "", finalHost: "", locationHost: "" };
  }
  if (absent(entryValue) || entryValue.status == null) {
    return {
      check: portfolioAbsent(role) ? na("agent card not published here") : miss("agent card absent"),
      interfaceHost: "",
      finalHost: "",
      locationHost: "",
    };
  }
  if (isRedirect(entryValue)) {
    const location = header(entryValue, "location");
    const locationHost = hostOf(location);
    if (!location || !locationHost) {
      return { check: fail(CODES.AGENT_CARD_WRONG_SHAPE, "agent card redirect has no URL"), interfaceHost: "", finalHost: "", locationHost: "" };
    }
    const followed = entryValue.followed;
    if (!followed) {
      if (role === "apex" && locationHost === GATEWAY_HOST) {
        return { check: pass(`agent card redirects to ${locationHost}`), interfaceHost: locationHost, finalHost: locationHost, locationHost };
      }
      return { check: fail(CODES.AGENT_CARD_WRONG_SHAPE, "agent card redirect was not followed to a card"), interfaceHost: "", finalHost: locationHost, locationHost };
    }
    const followedJudge = judgeCard({ ...followed, status: followed.status ?? 200 }, role);
    return {
      check: followedJudge.check.status === "pass"
        ? pass(`agent card redirect to ${locationHost} serves a card`)
        : followedJudge.check,
      interfaceHost: followedJudge.interfaceHost,
      finalHost: hostOf(followed.finalUrl || location),
      locationHost,
    };
  }
  if (!presented(entryValue) || isHtml(entryValue)) {
    return { check: fail(CODES.AGENT_CARD_NOT_JSON, "agent card is not JSON"), interfaceHost: "", finalHost: "", locationHost: "" };
  }
  const parsed = parseJsonValue(entryValue);
  if (!parsed.ok) {
    return { check: fail(CODES.AGENT_CARD_NOT_JSON, "agent card did not parse"), interfaceHost: "", finalHost: "", locationHost: "" };
  }
  if (!parsed.value || typeof parsed.value !== "object" || Array.isArray(parsed.value)) {
    return { check: fail(CODES.AGENT_CARD_NOT_OBJECT, "agent card JSON is not an object"), interfaceHost: "", finalHost: "", locationHost: "" };
  }
  const interfaceUrl = cardInterfaceUrl(parsed.value);
  const finalHost = hostOf(entryValue.finalUrl || interfaceUrl);
  if (!cardShapeOk(parsed.value)) {
    return {
      check: fail(CODES.AGENT_CARD_WRONG_SHAPE, "agent card needs name, description, version, skills, and an interface URL"),
      interfaceHost: hostOf(interfaceUrl),
      finalHost,
      locationHost: "",
    };
  }
  return {
    check: pass(`agent card ${parsed.value.name}`),
    interfaceHost: hostOf(interfaceUrl),
    finalHost: finalHost || hostOf(interfaceUrl),
    locationHost: "",
  };
}

function judgeIdentity(capture, facts) {
  const role = capture.role;
  let serverName = facts.handshake.serverName
    ? (facts.mcpName && facts.mcpName !== facts.handshake.serverName
      ? fail(CODES.IDENTITY_CONFLICT, `discovery name ${facts.mcpName} disagrees with serverInfo ${facts.handshake.serverName}`)
      : pass(facts.handshake.serverName))
    : (facts.handshake.envelope.status === "fail"
      ? blocked("no serverInfo because the handshake failed closed")
      : (portfolioAbsent(role) ? na("no MCP server name on this host") : miss("serverInfo name absent")));

  let origin = na("no agent card to align");
  if (facts.card.check.status === "fail") origin = blocked("agent card failed closed");
  else if (facts.card.check.status === "pass") {
    if (facts.card.interfaceHost && facts.card.finalHost && facts.card.interfaceHost !== facts.card.finalHost) {
      origin = fail(CODES.IDENTITY_CONFLICT, `card interface host ${facts.card.interfaceHost} is not ${facts.card.finalHost}`);
    } else origin = pass(`card interface host ${facts.card.interfaceHost || facts.card.finalHost}`);
  } else if (facts.card.check.status === "missing") origin = miss("agent card absent");
  else if (facts.card.check.status === "not_observed") origin = unseen("agent card not probed");

  let split = na("apex and gateway are a different host");
  if (role === "apex") {
    const nameOk = !facts.handshake.serverName || facts.handshake.serverName === APEX_SERVER_NAME;
    const x402Clear = !facts.x402.present;
    const cardPointsAtGateway = facts.card.locationHost === GATEWAY_HOST || facts.card.interfaceHost === GATEWAY_HOST || facts.card.finalHost === GATEWAY_HOST;
    if (!nameOk || !x402Clear) {
      split = fail(CODES.IDENTITY_CONFLICT, "apex is presenting the paid gateway identity");
    } else if (!cardPointsAtGateway) {
      split = facts.card.check.status === "pass" || facts.card.check.status === "missing"
        ? fail(CODES.IDENTITY_CONFLICT, "apex agent card does not point at the machine gateway")
        : facts.card.check;
    } else split = pass("apex name, unpaid surface, and gateway card stay distinct");
  } else if (role === "gateway") {
    const nameOk = facts.handshake.serverName === GATEWAY_SERVER_NAME;
    const cardHere = facts.card.interfaceHost === GATEWAY_HOST;
    if (facts.handshake.envelope.status === "fail") split = blocked("gateway handshake failed closed");
    else if (!nameOk || !facts.x402.present || !cardHere) {
      split = fail(CODES.IDENTITY_CONFLICT, "gateway serverInfo, x402 host, and agent card do not agree");
    } else if (facts.handshake.serverName === APEX_SERVER_NAME) {
      split = fail(CODES.IDENTITY_CONFLICT, "gateway is presenting the apex tool server name");
    } else split = pass("gateway name, x402 manifest, and agent card agree");
  }
  return { serverName, origin, split };
}

function annotate(id, result) {
  return {
    id,
    family: CHECKS.find((check) => check.id === id).family,
    weight: CHECK_WEIGHT.get(id),
    status: result.status,
    code: result.code || null,
    detail: result.detail || "",
    failClosed: result.status === "fail",
  };
}

export function scoreCapture(capture) {
  const role = capture.role || "public";
  const llms = judgeText(entry(capture, "GET /llms.txt"));
  const robots = judgeText(entry(capture, "GET /robots.txt"), { requireUserAgent: true });
  const mcpCard = judgeMcpCard(entry(capture, "GET /.well-known/mcp.json"), role);
  const registry = judgeRegistry(entry(capture, "GET /.well-known/mcp-registry-auth"), role);
  const handshakeObs = observeRpc(entry(capture, "POST /mcp initialize"), {
    notJson: CODES.HANDSHAKE_NOT_JSON,
    notObject: CODES.HANDSHAKE_NOT_OBJECT,
    notJsonrpc: CODES.HANDSHAKE_NOT_JSONRPC,
  });
  const handshake = handshakeChecks(handshakeObs, role);
  let toolsObs = observeRpc(entry(capture, "POST /mcp tools/list"), {
    notJson: CODES.TOOLS_LIST_NOT_JSON,
    notObject: CODES.TOOLS_LIST_NOT_OBJECT,
    notJsonrpc: CODES.TOOLS_LIST_NOT_JSONRPC,
  });
  if (
    (toolsObs.kind === "absent" || toolsObs.kind === "unobserved" || toolsObs.kind === "http")
    && portfolioAbsent(role)
    && (handshakeObs.kind === "absent" || handshakeObs.kind === "http")
  ) {
    toolsObs = { kind: "portfolio-absent" };
  }
  const tools = toolsObs.kind === "portfolio-absent"
    ? { envelope: na("no MCP tool list on this host"), shape: na("no MCP tool list on this host") }
    : toolsChecks(toolsObs);
  const cors = judgeCors(entry(capture, "OPTIONS /mcp"), role, handshakeObs.kind);
  const x402Entry = entry(capture, "GET /.well-known/x402");
  if (x402Entry && !x402Entry.finalUrl) x402Entry.finalUrl = `${capture.origin}/.well-known/x402`;
  const x402 = judgeX402(x402Entry, role);
  const card = judgeCard(entry(capture, "GET /.well-known/agent-card.json"), role);
  const identity = judgeIdentity(capture, {
    mcpName: mcpCard.name,
    handshake,
    card,
    x402,
  });

  const checks = [
    annotate("discovery.llms", llms),
    annotate("discovery.robots", robots),
    annotate("discovery.mcp_card", mcpCard.check),
    annotate("discovery.registry_auth", registry),
    annotate("mcp.handshake.envelope", handshake.envelope),
    annotate("mcp.handshake.version", handshake.version),
    annotate("mcp.handshake.id_echo", handshake.idEcho),
    annotate("mcp.tools_list.envelope", tools.envelope),
    annotate("mcp.tools_list.shape", tools.shape),
    annotate("identity.server_name", identity.serverName),
    annotate("identity.origin_alignment", identity.origin),
    annotate("identity.apex_gateway_split", identity.split),
    annotate("cors.preflight", cors.preflight),
    annotate("cors.allow_headers", cors.headers),
    annotate("x402.manifest_shape", x402.shape),
    annotate("x402.amount_atomic", x402.amount),
    annotate("agent_card.shape", card.check),
  ];

  let earned = 0;
  let applicable = 0;
  for (const check of checks) {
    if (check.status === "not_applicable" || check.status === "not_observed" || check.status === "blocked") continue;
    applicable += check.weight;
    if (check.status === "pass") earned += check.weight;
  }
  const score = applicable === 0 ? 0 : Math.round((earned / applicable) * 100);
  const failClosed = [...new Set(checks.filter((check) => check.failClosed).map((check) => check.code))];
  let verdict = "pass";
  if (failClosed.length) verdict = "reject";
  else if (checks.some((check) => check.status === "missing")) verdict = "gap";
  else if (checks.some((check) => check.status === "not_observed")) verdict = "incomplete";

  return {
    hostId: capture.id,
    label: capture.label,
    origin: capture.origin,
    role,
    heldOut: Boolean(capture.heldOut),
    score,
    grade: gradeFor(score),
    earned,
    applicable,
    verdict,
    failClosed,
    checks,
    paid: false,
  };
}

export function coverageOf(reports) {
  const rows = [];
  for (const report of reports) {
    for (const check of report.checks) {
      rows.push({
        id: `${report.hostId}:${check.id}`,
        hostId: report.hostId,
        checkId: check.id,
        family: check.family,
        status: check.status,
        code: check.code,
      });
    }
  }
  return rows;
}

export { CHECK_WEIGHT, FAMILIES };
