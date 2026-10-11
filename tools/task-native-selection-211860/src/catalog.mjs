import { CURRENCY, DECIMAL_AMOUNT, DISCOVERY_SCHEMA, PORTFOLIO_HOSTS } from "./constants.mjs";
import { canonical, decimalZero, sha256 } from "./canonical.mjs";
import { hostnameBlocked } from "./public-host.mjs";

const METHODS = new Set(["get", "post", "put", "patch", "delete", "head"]);

export function portfolioOwned(origin) {
  try {
    const host = new URL(origin).hostname.toLowerCase();
    return PORTFOLIO_HOSTS.some((name) => host === name || host.endsWith(`.${name}`));
  } catch {
    return false;
  }
}

function blankPrice() {
  return {
    state: "unknown",
    amount: null,
    currency: null,
    charged: null,
    challengeDeclared: null,
    atomic: null,
    conflict: null,
    sources: [],
  };
}

function knownDisplay(amount, currency, source) {
  const price = blankPrice();
  price.sources.push(source);
  if (typeof amount !== "string" || !DECIMAL_AMOUNT.test(amount) || typeof currency !== "string" || !CURRENCY.test(currency)) {
    price.state = "invalid";
    price.charged = true;
    return price;
  }
  if (decimalZero(amount)) {
    price.state = "known_free";
    price.amount = "0";
    price.currency = currency;
    price.charged = false;
    return price;
  }
  price.state = "known";
  price.amount = amount;
  price.currency = currency;
  price.charged = true;
  return price;
}

function responseSchema(operation) {
  const responses = operation?.responses;
  if (!responses || typeof responses !== "object") return { schema: null, challengeDeclared: null };
  const ok = responses["200"] || responses[200] || null;
  const challengeDeclared = Object.prototype.hasOwnProperty.call(responses, "402");
  const content = ok && typeof ok === "object" ? ok.content : null;
  const json = content && typeof content === "object" ? content["application/json"] : null;
  const schema = json && typeof json.schema === "object" && json.schema ? json.schema : null;
  return { schema, challengeDeclared };
}

function requiredInputs(operation) {
  const names = [];
  const locations = {};
  for (const parameter of operation?.parameters || []) {
    if (!parameter || parameter.required !== true || typeof parameter.name !== "string") continue;
    names.push(parameter.name);
    locations[parameter.name] = parameter.in || "query";
  }
  const body = operation?.requestBody?.content?.["application/json"]?.schema;
  if (body && Array.isArray(body.required)) {
    for (const name of body.required) {
      if (typeof name !== "string") continue;
      names.push(name);
      locations[name] = "body";
    }
  }
  return { requiredInputs: names, inputLocations: locations };
}

function expiresAtOf(operation) {
  const value = operation?.["x-expires-at"];
  if (typeof value !== "string" || Number.isNaN(Date.parse(value))) return { expiresAt: null, expiryState: "unknown" };
  return { expiresAt: value, expiryState: "known" };
}

function pointer(path, method) {
  const escaped = path.replace(/~/g, "~0").replace(/\//g, "~1");
  return `#/paths/${escaped}/${method}`;
}

export function originOf(openapi) {
  const listed = openapi?.servers?.[0]?.url;
  if (typeof listed !== "string" || listed.length === 0) return null;
  try {
    return new URL(listed).origin;
  } catch {
    return null;
  }
}

function nextAction(entry) {
  const price = entry.price;
  let payment = "unknown";
  let reason = "cost_unknown";
  if (price.state === "known") {
    payment = "required";
    reason = "payment_not_authorized";
  } else if (price.state === "known_free") {
    payment = "none";
    reason = entry.command ? "local_command_not_run" : "not_run";
  } else if (price.state === "conflict" || price.state === "invalid") {
    payment = "conflict";
    reason = "price_authority_conflict";
  }
  const probeAllowed = entry.method === "GET"
    && price.charged !== true
    && price.challengeDeclared !== true
    && price.state !== "conflict"
    && price.state !== "invalid";
  return {
    method: entry.method,
    path: entry.path,
    origin: entry.origin,
    requiredInputs: entry.requiredInputs,
    command: entry.command || null,
    payment,
    contractProbe: probeAllowed ? "allowed" : "refused",
    reason,
    run: "not_run",
  };
}

function finish(entry) {
  entry.outputSchemaSha256 = entry.outputSchema ? sha256(entry.outputSchema) : null;
  entry.nextAction = nextAction(entry);
  return entry;
}

export function entriesFromOpenApi(openapi, sourceUrl) {
  const origin = originOf(openapi);
  const entries = [];
  const paths = openapi?.paths && typeof openapi.paths === "object" ? openapi.paths : {};
  for (const [path, methods] of Object.entries(paths)) {
    if (!methods || typeof methods !== "object") continue;
    for (const [methodName, operation] of Object.entries(methods)) {
      if (!METHODS.has(methodName) || !operation || typeof operation !== "object") continue;
      const method = methodName.toUpperCase();
      const payment = operation["x-payment-info"];
      const price = payment && typeof payment === "object"
        ? knownDisplay(payment.price?.amount, payment.price?.currency, "openapi.x-payment-info.price")
        : blankPrice();
      const output = responseSchema(operation);
      price.challengeDeclared = output.challengeDeclared;
      const inputs = requiredInputs(operation);
      const expiry = expiresAtOf(operation);
      const entry = finish({
        id: `openapi:${method} ${path}`,
        operationId: typeof operation.operationId === "string" ? operation.operationId : null,
        sourceRef: `${sourceUrl}${pointer(path, methodName)}`,
        sourceKind: "openapi",
        authority: "openapi",
        origin,
        method,
        path,
        owned: portfolioOwned(origin),
        direct: false,
        summaryUntrusted: typeof operation.summary === "string" ? operation.summary : "",
        outputSchema: output.schema,
        outputSchemaState: output.schema ? "present" : "absent",
        price,
        requiredInputs: inputs.requiredInputs,
        inputLocations: inputs.inputLocations,
        expiresAt: expiry.expiresAt,
        expiryState: expiry.expiryState,
        command: null,
      });
      entries.push(entry);
    }
  }
  return entries;
}

function routeOfItem(item) {
  const method = String(item?.request?.method || item?.resource?.method || "GET").toUpperCase();
  const template = item?.resource?.routeTemplate;
  if (typeof template === "string" && template.startsWith("/")) return { method, path: template.split("?")[0] };
  const raw = item?.request?.url;
  if (typeof raw !== "string") return null;
  try {
    const url = new URL(raw);
    return { method, path: url.pathname || "/" };
  } catch {
    return null;
  }
}

function atomicAmount(value) {
  if (typeof value === "string" && INTEGER_TEXT(value)) return value;
  if (typeof value === "number" && Number.isSafeInteger(value) && value >= 0) return String(value);
  return null;
}

function INTEGER_TEXT(value) {
  return /^(0|[1-9][0-9]*)$/.test(value);
}

function extraDisplay(accept) {
  const extra = accept?.extra;
  if (!extra || typeof extra !== "object") return null;
  for (const key of ["price", "amountUsd"]) {
    const value = extra[key];
    if (typeof value === "string" && DECIMAL_AMOUNT.test(value)) return { key, amount: value };
  }
  return null;
}

export function applyX402(entries, manifest, sourceUrl) {
  const byRoute = new Map(entries.map((entry) => [`${entry.method} ${entry.path}`, entry]));
  const items = Array.isArray(manifest?.items) ? manifest.items : [];
  for (const item of items) {
    const route = routeOfItem(item);
    if (!route) continue;
    const key = `${route.method} ${route.path}`;
    let entry = byRoute.get(key);
    const accept = Array.isArray(item.accepts) ? item.accepts[0] : null;
    const atomic = accept
      ? {
        amount: atomicAmount(accept.amount),
        asset: typeof accept.asset === "string" ? accept.asset : null,
        network: typeof accept.network === "string" ? accept.network : null,
        decimals: null,
        comparison: "units_uncompared",
        source: "x402.accepts[0]",
        sourceRef: sourceUrl,
      }
      : null;
    if (!entry) {
      const origin = (() => {
        try {
          return new URL(item?.request?.url).origin;
        } catch {
          return null;
        }
      })();
      entry = finish({
        id: `x402:${key}`,
        operationId: null,
        sourceRef: sourceUrl,
        sourceKind: "x402",
        authority: "x402",
        origin,
        method: route.method,
        path: route.path,
        owned: portfolioOwned(origin),
        direct: false,
        summaryUntrusted: typeof item?.resource?.description === "string" ? item.resource.description : "",
        outputSchema: null,
        outputSchemaState: "absent",
        price: blankPrice(),
        requiredInputs: [],
        inputLocations: {},
        expiresAt: null,
        expiryState: "unknown",
        command: null,
      });
      entry.price.atomic = atomic;
      entries.push(entry);
      byRoute.set(key, entry);
      continue;
    }
    if (atomic) {
      if (entry.price.atomic && entry.price.atomic.amount && atomic.amount && entry.price.atomic.amount !== atomic.amount) {
        entry.price.atomic = { ...atomic, comparison: "atomic_conflict" };
      } else {
        entry.price.atomic = atomic;
      }
      entry.price.sources.push("x402.accepts[0]");
    }
    const display = extraDisplay(accept);
    if (display && entry.price.amount && display.amount !== entry.price.amount) {
      entry.price.state = "conflict";
      entry.price.charged = null;
      entry.price.conflict = { openapi: entry.price.amount, x402Extra: display.amount, key: display.key };
    }
    entry.nextAction = nextAction(entry);
  }
  return entries;
}

export function entryFromDiscovery(document, sourceUrl) {
  if (!document || document.schema !== DISCOVERY_SCHEMA || typeof document.packageId !== "string") return null;
  const paid = document.paid;
  const invokes = document.invokesPricedExecution;
  const price = blankPrice();
  price.challengeDeclared = false;
  if (paid === false && invokes === false) {
    price.state = "known_free";
    price.amount = "0";
    price.currency = null;
    price.charged = false;
    price.sources.push("acquisition-discovery.paid");
  } else if (paid === false && invokes === true) {
    price.state = "conflict";
    price.charged = null;
    price.conflict = { paid: false, invokesPricedExecution: true };
    price.sources.push("acquisition-discovery.paid");
  } else if (paid === true) {
    price.state = "unknown";
    price.charged = true;
    price.sources.push("acquisition-discovery.paid");
  }
  const outputSchema = {
    type: "object",
    additionalProperties: true,
    required: ["schema", "packageId", "paid", "invokesPricedExecution"],
    properties: {
      schema: { const: DISCOVERY_SCHEMA },
      packageId: { const: document.packageId },
      paid: { const: paid },
      invokesPricedExecution: { const: invokes },
    },
  };
  let origin = null;
  let path = "/";
  try {
    const url = new URL(sourceUrl);
    origin = url.origin;
    path = url.pathname || "/";
  } catch {
    origin = null;
  }
  const subjectRoute = document.canonical?.method && document.canonical?.path
    ? { method: String(document.canonical.method).toUpperCase(), path: document.canonical.path }
    : null;
  return finish({
    id: `discovery:${document.packageId}`,
    operationId: document.packageId,
    sourceRef: sourceUrl,
    sourceKind: "acquisition-discovery",
    authority: "acquisition-discovery",
    origin,
    method: "GET",
    path,
    subjectRoute,
    owned: origin ? portfolioOwned(origin) : false,
    direct: paid === false && invokes === false,
    summaryUntrusted: typeof document.summary === "string" ? document.summary : "",
    outputSchema,
    outputSchemaState: "present",
    price,
    requiredInputs: [],
    inputLocations: {},
    expiresAt: null,
    expiryState: "unknown",
    command: Array.isArray(document.coldStart) ? document.coldStart.filter((line) => typeof line === "string") : null,
  });
}

function callerCurrency(value) {
  if (value == null) return { currency: null };
  if (typeof value === "string" && CURRENCY.test(value)) return { currency: value };
  return { error: "caller_price_incoherent" };
}

export function normalizeCallerEntry(input) {
  if (!input || typeof input !== "object" || Array.isArray(input)) {
    return { entry: null, error: "caller_entry_rejected" };
  }
  const id = typeof input.id === "string" && /^[A-Za-z0-9][A-Za-z0-9._:-]{0,80}$/.test(input.id)
    ? `caller:${input.id}`
    : null;
  if (!id) return { entry: null, error: "caller_entry_rejected" };
  const sourceRef = typeof input.sourceRef === "string" && input.sourceRef.length > 0 && input.sourceRef.length <= 300 && !/\s/.test(input.sourceRef)
    ? input.sourceRef
    : null;
  if (!sourceRef) return { entry: null, error: "caller_entry_rejected" };
  let origin = null;
  if (typeof input.origin === "string") {
    try {
      const url = new URL(input.origin);
      if (url.username || url.password || (url.protocol !== "http:" && url.protocol !== "https:")) {
        return { entry: null, error: "caller_origin_refused" };
      }
      if (hostnameBlocked(url.hostname)) return { entry: null, error: "caller_origin_refused" };
      origin = url.origin;
    } catch {
      return { entry: null, error: "caller_origin_refused" };
    }
  }
  const schema = input.outputSchema;
  if (!schema || typeof schema !== "object" || Array.isArray(schema)) return { entry: null, error: "caller_entry_rejected" };
  if (canonical(schema).length > 100_000) return { entry: null, error: "caller_entry_rejected" };
  const priceInput = input.price && typeof input.price === "object" ? input.price : {};
  const price = blankPrice();
  price.challengeDeclared = false;
  const currency = callerCurrency(priceInput.currency);
  if (currency.error && priceInput.state !== "unknown" && priceInput.state != null) {
    return { entry: null, error: currency.error };
  }
  if (priceInput.state === "known_free") {
    if (priceInput.amount !== "0" && priceInput.amount !== 0) return { entry: null, error: "caller_price_incoherent" };
    price.state = "known_free";
    price.amount = "0";
    price.currency = currency.currency;
    price.charged = false;
    price.sources.push("caller.price");
  } else if (priceInput.state === "known") {
    if (typeof priceInput.amount !== "string" || !DECIMAL_AMOUNT.test(priceInput.amount) || decimalZero(priceInput.amount)) {
      return { entry: null, error: "caller_price_incoherent" };
    }
    price.amount = priceInput.amount;
    price.currency = currency.currency;
    price.charged = true;
    price.sources.push("caller.price");
    price.state = currency.currency ? "known" : "undenominated";
  } else if (priceInput.state === "unknown" || priceInput.state == null) {
    price.state = "unknown";
    price.charged = null;
  } else {
    return { entry: null, error: "caller_price_incoherent" };
  }
  const requiredInputs = Array.isArray(input.requiredInputs)
    ? input.requiredInputs.filter((name) => typeof name === "string")
    : [];
  return {
    error: null,
    entry: finish({
      id,
      operationId: typeof input.operationId === "string" ? input.operationId : input.id,
      sourceRef,
      sourceKind: "caller",
      authority: "caller",
      origin,
      method: typeof input.method === "string" ? input.method.toUpperCase() : "GET",
      path: typeof input.path === "string" ? input.path : "/",
      owned: input.owned === true,
      direct: input.direct === true,
      summaryUntrusted: typeof input.summaryUntrusted === "string" ? input.summaryUntrusted : "",
      outputSchema: schema,
      outputSchemaState: "present",
      price,
      requiredInputs,
      inputLocations: {},
      expiresAt: typeof input.expiresAt === "string" ? input.expiresAt : null,
      expiryState: typeof input.expiresAt === "string" ? "known" : "unknown",
      command: typeof input.command === "string" ? input.command : null,
    }),
  };
}

export function normalizeCatalog({ openapi, openapiUrl, x402, x402Url, discovery = [] }) {
  const entries = entriesFromOpenApi(openapi, openapiUrl);
  if (x402) applyX402(entries, x402, x402Url);
  for (const item of discovery) {
    const entry = entryFromDiscovery(item.document, item.sourceUrl);
    if (entry) entries.push(entry);
  }
  entries.sort((left, right) => left.id.localeCompare(right.id));
  return entries;
}
