/**
 * Executable simulation of the committed Make blueprint and n8n workflow JSON.
 * Each interpreter walks the artifact graph as the platform would (n8n
 * executionOrder v1, Make bundles through routers and an iterator), evaluates the
 * artifact's own expressions and filters, and sends every HTTP call to an
 * in-process client endpoint. It supports only the node and module types the
 * artifacts use and throws on anything else. It is a fixture-level simulation,
 * not a provider run: no Make or n8n service is contacted.
 */

const isPlainObject = (value) => value !== null && typeof value === "object" && !Array.isArray(value);
const clone = (value) => (value === undefined ? undefined : JSON.parse(JSON.stringify(value)));

class NodeError extends Error {
  constructor(node, message) {
    super(`${node}: ${message}`);
    this.node = node;
  }
}

// ---------------- n8n ----------------

function n8nExpression(source, scope) {
  // eslint-disable-next-line no-new-func
  const fn = new Function("$json", "$", "$execution", "$workflow", `"use strict"; return (${source});`);
  return fn(scope.$json, scope.$, scope.$execution, scope.$workflow);
}

function n8nResolve(value, scope) {
  if (typeof value !== "string" || !value.startsWith("=")) return value;
  const template = value.slice(1);
  const whole = template.match(/^\{\{([\s\S]*)\}\}$/);
  if (whole && !whole[1].includes("}}")) return n8nExpression(whole[1], scope);
  return template.replace(/\{\{([\s\S]*?)\}\}/g, (_, expr) => String(n8nExpression(expr, scope)));
}

const N8N_TRIGGER = "n8n-nodes-base.webhook";

export function simulateN8n(workflow, { body, endpoint, executionId = "sim-n8n-1" }) {
  const byName = new Map(workflow.nodes.map((node) => [node.name, node]));
  const outputs = new Map();
  const trace = [];
  const httpCalls = [];
  let response = null;
  const $ = (name) => {
    const items = outputs.get(name);
    if (!items) throw new Error(`expression references ${name}, which has not run`);
    return { first: () => items[0], all: () => items, last: () => items[items.length - 1] };
  };
  const scopeFor = (item) => ({ $json: item.json, $, $execution: { id: executionId }, $workflow: { id: "sim-workflow" } });

  function run(node, items) {
    trace.push({ node: node.name, items: items.length });
    switch (node.type) {
      case N8N_TRIGGER:
        return [items];
      case "n8n-nodes-base.set": {
        const out = items.map((item) => {
          const json = node.parameters.includeOtherFields ? clone(item.json) : {};
          for (const a of node.parameters.assignments.assignments) json[a.name] = n8nResolve(a.value, scopeFor(item));
          return { json };
        });
        return [out];
      }
      case "n8n-nodes-base.httpRequest": {
        const out = [];
        for (const item of items) {
          const scope = scopeFor(item);
          const url = n8nResolve(node.parameters.url, scope);
          const headers = {};
          if (node.parameters.sendHeaders) for (const h of node.parameters.headerParameters.parameters) headers[h.name] = n8nResolve(h.value, scope);
          const raw = n8nResolve(node.parameters.jsonBody, scope);
          const requestBody = typeof raw === "string" ? JSON.parse(raw) : raw;
          const res = endpoint.handle({ method: node.parameters.method, url, headers, body: requestBody });
          httpCalls.push({ node: node.name, url, idempotencyKey: headers["Idempotency-Key"] ?? null, status: res.transportError ? "transport_error" : res.status });
          if (res.transportError) throw new NodeError(node.name, res.message);
          if (res.status >= 400) throw new NodeError(node.name, `HTTP ${res.status}`);
          out.push({ json: clone(res.body) });
        }
        return [out];
      }
      case "n8n-nodes-base.if": {
        const yes = [];
        const no = [];
        const condition = node.parameters.conditions.conditions[0];
        if (node.parameters.conditions.conditions.length !== 1 || condition.operator.operation !== "true") throw new NodeError(node.name, "unsupported If shape");
        for (const item of items) (n8nResolve(condition.leftValue, scopeFor(item)) === true ? yes : no).push(item);
        return [yes, no];
      }
      case "n8n-nodes-base.respondToWebhook": {
        if (!response && items.length) {
          const text = n8nResolve(node.parameters.responseBody, scopeFor(items[0]));
          response = { node: node.name, code: node.parameters.options.responseCode, body: JSON.parse(text) };
        }
        return [items];
      }
      case "n8n-nodes-base.splitOut": {
        const field = node.parameters.fieldToSplitOut;
        return [items.flatMap((item) => (Array.isArray(item.json[field]) ? item.json[field].map((json) => ({ json: clone(json) })) : []))];
      }
      case "n8n-nodes-base.wait":
        return [items];
      default:
        throw new NodeError(node.name, `node type ${node.type} is not supported by the simulator`);
    }
  }

  function position(name) {
    const p = byName.get(name).position;
    return [p[1], p[0]];
  }

  function execute(name, items) {
    const node = byName.get(name);
    const result = run(node, items);
    outputs.set(name, result[0]);
    const next = [];
    const outs = workflow.connections[name]?.main ?? [];
    outs.forEach((targets, index) => {
      for (const target of targets ?? []) if ((result[index] ?? []).length) next.push({ name: target.node, items: result[index] });
    });
    // executionOrder v1: finish one branch before the next, top branch first.
    next.sort((a, b) => {
      const [ay, ax] = position(a.name);
      const [by, bx] = position(b.name);
      return ay - by || ax - bx;
    });
    for (const step of next) execute(step.name, step.items);
  }

  const trigger = workflow.nodes.filter((node) => node.type === N8N_TRIGGER);
  if (trigger.length !== 1) throw new Error("workflow must have exactly one webhook trigger");
  try {
    execute(trigger[0].name, [{ json: { headers: {}, params: {}, query: {}, body: clone(body) } }]);
    return { platform: "n8n", status: "success", error: null, response, trace, httpCalls };
  } catch (error) {
    if (!(error instanceof NodeError)) throw error;
    return { platform: "n8n", status: "error", error: { node: error.node, message: error.message }, response, trace, httpCalls };
  }
}

// ---------------- Make ----------------

function makeGet(ctx, ref) {
  const [id, ...path] = ref.trim().split(".");
  if (!Object.prototype.hasOwnProperty.call(ctx, id)) throw new Error(`template references module ${id}, which has not run`);
  let value = ctx[id];
  for (const part of path) {
    if (!isPlainObject(value) && !Array.isArray(value)) return undefined;
    value = value[part];
  }
  return value;
}

function makeResolve(template, ctx) {
  if (typeof template !== "string") return template;
  const whole = template.match(/^\{\{([^{}]+)\}\}$/);
  if (whole) return makeGet(ctx, whole[1]);
  return template.replace(/\{\{([^{}]+)\}\}/g, (_, ref) => {
    const value = makeGet(ctx, ref);
    if (value === undefined || value === null) return "";
    return typeof value === "string" ? value : JSON.stringify(value);
  });
}

function makeFilterPasses(filter, ctx) {
  if (!filter) return true;
  return filter.conditions.some((group) => group.every((c) => {
    const a = makeResolve(c.a, ctx);
    switch (c.o) {
      case "exist": return a !== undefined && a !== null && a !== "";
      case "notexist": return a === undefined || a === null || a === "";
      case "text:equal": return String(a) === String(c.b);
      case "boolean:equal": return (a === true || a === "true") === (c.b === true || c.b === "true");
      default: throw new Error(`filter operator ${c.o} is not supported by the simulator`);
    }
  }));
}

export function simulateMake(blueprint, { body, endpoint }) {
  const trace = [];
  const httpCalls = [];
  let response = null;

  function runModule(mod, ctx) {
    const name = mod.metadata.designer.name;
    trace.push({ module: mod.id, name });
    switch (mod.module) {
      case "gateway:CustomWebHook":
        return [{ ...ctx, [mod.id]: clone(body) }];
      case "util:SetVariable2":
        return [{ ...ctx, [mod.id]: { [mod.mapper.name]: makeResolve(mod.mapper.value, ctx) } }];
      case "json:TransformToJSON":
        return [{ ...ctx, [mod.id]: { json: JSON.stringify(makeResolve(mod.mapper.object, ctx)) } }];
      case "http:ActionSendData": {
        const url = makeResolve(mod.mapper.url, ctx);
        const headers = {};
        for (const h of mod.mapper.headers) headers[h.name] = makeResolve(h.value, ctx);
        const requestBody = JSON.parse(makeResolve(mod.mapper.data, ctx));
        const res = endpoint.handle({ method: mod.mapper.method.toUpperCase(), url, headers, body: requestBody });
        httpCalls.push({ module: mod.id, name, url, idempotencyKey: headers["Idempotency-Key"] ?? null, status: res.transportError ? "transport_error" : res.status });
        if (res.transportError) throw new NodeError(name, res.message);
        if (mod.parameters.handleErrors && res.status >= 400) throw new NodeError(name, `HTTP ${res.status}`);
        return [{ ...ctx, [mod.id]: { statusCode: res.status, data: clone(res.body) } }];
      }
      case "gateway:WebhookRespond":
        if (!response) response = { module: mod.id, name, code: Number(mod.mapper.status), body: JSON.parse(makeResolve(mod.mapper.body, ctx)) };
        return [ctx];
      case "builtin:BasicFeeder": {
        const array = makeResolve(mod.mapper.array, ctx);
        return (Array.isArray(array) ? array : []).map((element) => ({ ...ctx, [mod.id]: clone(element) }));
      }
      case "util:FunctionSleep":
        return [ctx];
      default:
        throw new NodeError(name, `module ${mod.module} is not supported by the simulator`);
    }
  }

  function runFlow(flow, ctx) {
    if (!flow.length) return;
    const [mod, ...rest] = flow;
    if (!makeFilterPasses(mod.filter, ctx)) return;
    if (mod.module === "builtin:BasicRouter") {
      trace.push({ module: mod.id, name: mod.metadata.designer.name });
      for (const route of mod.routes) runFlow(route.flow, ctx);
      return;
    }
    for (const bundle of runModule(mod, ctx)) runFlow(rest, bundle);
  }

  if (blueprint.flow[0]?.module !== "gateway:CustomWebHook") throw new Error("blueprint must start with a custom webhook");
  try {
    runFlow(blueprint.flow, {});
    return { platform: "make", status: "success", error: null, response, trace, httpCalls };
  } catch (error) {
    if (!(error instanceof NodeError)) throw error;
    return { platform: "make", status: "error", error: { node: error.node, message: error.message }, response, trace, httpCalls };
  }
}
