import { ConsumerRefuse } from "./errors.mjs";
import { EXECUTION_ID_RE } from "./pins.mjs";

export { EXECUTION_ID_RE };

export function assertExecutionId(id) {
  if (typeof id !== "string" || !EXECUTION_ID_RE.test(id)) {
    throw new ConsumerRefuse(
      "invalid-execution-id",
      "Execution ID must match /^[A-Za-z0-9][A-Za-z0-9._-]{0,127}$/",
      { id },
    );
  }
  return id;
}

export function resultsPathFor(id) {
  return `/results/${encodeURIComponent(assertExecutionId(id))}`;
}

export function parseHttpOrigin(origin) {
  if (typeof origin !== "string" || origin.trim() === "") {
    throw new ConsumerRefuse("invalid-origin", "origin must be an http(s) URL");
  }
  if (origin.includes("\\")) {
    throw new ConsumerRefuse("invalid-origin", "origin must not include backslashes", { origin });
  }
  let u;
  try {
    u = new URL(origin);
  } catch {
    throw new ConsumerRefuse("invalid-origin", "origin is not a URL", { origin });
  }
  if (u.protocol !== "http:" && u.protocol !== "https:") {
    throw new ConsumerRefuse("invalid-origin", "origin must be http or https", { origin });
  }
  if (u.username || u.password || origin.includes("@")) {
    throw new ConsumerRefuse("invalid-origin", "origin must not include userinfo", { origin });
  }
  if (u.search || u.hash) {
    throw new ConsumerRefuse("invalid-origin", "origin must not include query or fragment", { origin });
  }
  if (u.pathname !== "/" && u.pathname !== "") {
    throw new ConsumerRefuse("invalid-origin", "origin must not include a path", { origin });
  }
  if (!u.hostname) {
    throw new ConsumerRefuse("invalid-origin", "origin hostname missing", { origin });
  }
  const port = u.port ? `:${u.port}` : "";
  const href = `${u.protocol}//${u.hostname}${port}`;
  return { origin: href, url: new URL(`${href}/`) };
}

export function originsEqual(a, b) {
  return parseHttpOrigin(a).origin === parseHttpOrigin(b).origin;
}

function rejectUnsafeRetrievalToken(value, retrievalPath) {
  const lower = value.toLowerCase();
  if (
    value.includes("..") ||
    value.includes("/") ||
    value.includes("\\") ||
    lower.includes("%2e") ||
    lower.includes("%2f") ||
    lower.includes("%5c")
  ) {
    throw new ConsumerRefuse("encoded-traversal", "retrieval path must not include traversal", {
      retrievalPath,
    });
  }
}

export function resolveRetrieval(origin, retrievalPath) {
  const parsed = parseHttpOrigin(origin);
  if (typeof retrievalPath !== "string" || retrievalPath === "") {
    throw new ConsumerRefuse("invalid-retrieval", "retrieval path or id is required");
  }
  if (
    retrievalPath.startsWith("//") ||
    retrievalPath.includes("://") ||
    retrievalPath.includes("\\") ||
    retrievalPath.includes("@")
  ) {
    throw new ConsumerRefuse("foreign-origin", "retrieval cannot address a different origin", {
      retrievalPath,
    });
  }
  if (retrievalPath.includes("?") || retrievalPath.includes("#")) {
    throw new ConsumerRefuse("ambiguous-retrieval", "retrieval path must not include query or fragment", {
      retrievalPath,
    });
  }

  let rawId;
  if (retrievalPath.startsWith("/")) {
    const match = retrievalPath.match(/^\/results\/([^/]+)$/);
    if (!match) {
      throw new ConsumerRefuse("invalid-retrieval", "retrieval path must be /results/:id", {
        retrievalPath,
      });
    }
    rawId = match[1];
  } else {
    rawId = retrievalPath;
  }
  rejectUnsafeRetrievalToken(rawId, retrievalPath);

  let id;
  try {
    id = decodeURIComponent(rawId);
  } catch {
    throw new ConsumerRefuse("invalid-execution-id", "malformed execution id encoding", { rawId });
  }
  if (id !== rawId && encodeURIComponent(id) !== rawId) {
    throw new ConsumerRefuse("invalid-execution-id", "execution id encoding is not canonical", { rawId, id });
  }
  assertExecutionId(id);

  const path = resultsPathFor(id);
  const url = new URL(path, parsed.url);
  if (url.origin !== parsed.url.origin) {
    throw new ConsumerRefuse("foreign-origin", "resolved retrieval origin differs from ticket origin", {
      expected: parsed.origin,
      actual: url.origin,
    });
  }
  if (url.username || url.password || url.search || url.hash) {
    throw new ConsumerRefuse("foreign-origin", "resolved retrieval URL is not a plain origin path");
  }
  if (url.pathname !== path) {
    throw new ConsumerRefuse("invalid-retrieval", "retrieval path canonicalization mismatch");
  }
  return { origin: parsed.origin, id, path, url: url.href };
}

export function originResourceUrl(origin, resourcePath) {
  const parsed = parseHttpOrigin(origin);
  if (resourcePath !== "/execute" && resourcePath !== "/health") {
    throw new ConsumerRefuse("invalid-retrieval", "unsupported origin resource path", { resourcePath });
  }
  const url = new URL(resourcePath, parsed.url);
  if (url.origin !== parsed.url.origin || url.search || url.hash || url.username || url.password) {
    throw new ConsumerRefuse("foreign-origin", "resource URL escaped ticket origin");
  }
  if (url.pathname !== resourcePath) {
    throw new ConsumerRefuse("invalid-retrieval", "resource path canonicalization mismatch");
  }
  return { origin: parsed.origin, url: url.href };
}
