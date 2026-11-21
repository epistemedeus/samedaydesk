import { createHmac } from "node:crypto";
import { readFileSync } from "node:fs";

const DEFAULT_TTL_SEC = 5 * 60;
export const GHOST_REUSE_TAG = "samedaydesk-result-reuse";

export function parseAdminKey(value) {
  if (typeof value !== "string" || value.trim() === "") {
    return { ok: false, message: "admin API key is missing" };
  }
  const trimmed = value.trim();
  const idx = trimmed.indexOf(":");
  if (idx <= 0 || idx === trimmed.length - 1) {
    return { ok: false, message: "admin API key must be id:secret" };
  }
  return { ok: true, id: trimmed.slice(0, idx), secret: trimmed.slice(idx + 1) };
}

export function readAdminKeyFromFile(path) {
  if (typeof path !== "string" || path.trim() === "") {
    return { ok: false, message: "admin API key file path is missing" };
  }
  try {
    return parseAdminKey(readFileSync(path, "utf8"));
  } catch {
    return { ok: false, message: "cannot read admin API key file" };
  }
}

export function normalizeGhostUrl(url) {
  if (typeof url !== "string" || url.trim() === "") return null;
  return url.trim().replace(/\/+$/, "");
}

export function ghostAdminToken(adminKey, { now = Math.floor(Date.now() / 1000), ttlSec = DEFAULT_TTL_SEC } = {}) {
  const parsed = typeof adminKey === "string" ? parseAdminKey(adminKey) : adminKey;
  if (!parsed?.ok) return { ok: false, message: parsed?.message || "admin API key is missing" };
  const secretBuf = hexSecretBytes(parsed.secret);
  if (!secretBuf) return { ok: false, message: "admin API secret is not hex", keyId: parsed.id };
  const header = b64url(JSON.stringify({ alg: "HS256", kid: parsed.id, typ: "JWT" }));
  const payload = b64url(JSON.stringify({ iat: now, exp: now + ttlSec, aud: "/admin/" }));
  const sig = createHmac("sha256", secretBuf).update(`${header}.${payload}`).digest("base64url");
  return { ok: true, token: `${header}.${payload}.${sig}`, keyId: parsed.id };
}

export async function probeGhost(url, { timeoutMs = 4000 } = {}) {
  const base = normalizeGhostUrl(url);
  if (!base) return { ok: false, reachable: false, message: "GHOST_URL is missing" };
  try {
    const res = await fetch(`${base}/ghost/`, { method: "GET", redirect: "manual", signal: AbortSignal.timeout(timeoutMs) });
    return { ok: true, reachable: true, status: res.status };
  } catch (error) {
    return { ok: false, reachable: false, message: error?.cause?.code || error?.message || "ghost runtime is unreachable" };
  }
}

export async function adminRequest({ url, key, method = "GET", path, body, timeoutMs = 15000 } = {}) {
  const base = normalizeGhostUrl(url);
  if (!base) return { ok: false, message: "GHOST_URL is missing" };
  const parsedKey = typeof key === "string" ? parseAdminKey(key) : key;
  const token = ghostAdminToken(parsedKey);
  if (!token.ok) return token;
  const requestPath = path.startsWith("/") ? path : `/${path}`;
  const target = `${base}${requestPath}`;
  const diagnostic = { keyId: token.keyId || parsedKey?.id || null, endpoint: target, path: requestPath, method };
  const headers = {
    Authorization: `Ghost ${token.token}`,
    Accept: "application/json",
    Origin: base,
  };
  if (body !== undefined) headers["Content-Type"] = "application/json";
  try {
    const res = await fetch(target, {
      method,
      headers,
      body: body === undefined ? undefined : JSON.stringify(body),
      signal: AbortSignal.timeout(timeoutMs),
    });
    const text = await res.text();
    let json = null;
    if (text) {
      try {
        json = JSON.parse(text);
      } catch {
        json = null;
      }
    }
    if (!res.ok) {
      return {
        ok: false,
        status: res.status,
        ...diagnostic,
        message: extractGhostError(json) || `ghost admin ${method} ${path} returned ${res.status}`,
      };
    }
    return { ok: true, status: res.status, json };
  } catch (error) {
    return { ok: false, ...diagnostic, message: error?.cause?.code || error?.message || "ghost admin request failed" };
  }
}

export async function listPosts({ url, key, filter, limit = "all" } = {}) {
  const params = new URLSearchParams();
  if (limit) params.set("limit", String(limit));
  if (filter) params.set("filter", filter);
  const qs = params.toString();
  const result = await adminRequest({ url, key, method: "GET", path: `/ghost/api/admin/posts/${qs ? `?${qs}` : ""}` });
  if (!result.ok) return result;
  return { ok: true, status: result.status, posts: Array.isArray(result.json?.posts) ? result.json.posts.map(summarizePost) : [] };
}

export async function getPost({ url, key, id } = {}) {
  if (!id) return { ok: false, message: "post id is required" };
  const result = await adminRequest({ url, key, method: "GET", path: `/ghost/api/admin/posts/${id}/` });
  if (!result.ok) return result;
  const post = result.json?.posts?.[0];
  if (!post) return { ok: false, status: result.status, message: "ghost returned no post" };
  return { ok: true, status: result.status, post: summarizePost(post) };
}

export async function createDraft({ url, key, title, html, excerpt, tags, lexical } = {}) {
  const post = {
    title: String(title || "SameDayDesk result-reuse observation").slice(0, 191),
    status: "draft",
    custom_excerpt: excerpt ? String(excerpt).slice(0, 300) : undefined,
    tags: Array.isArray(tags) && tags.length ? tags : [{ name: GHOST_REUSE_TAG }],
  };
  if (html != null) post.html = html;
  if (lexical != null) post.lexical = lexical;
  const result = await adminRequest({
    url,
    key,
    method: "POST",
    path: html != null ? "/ghost/api/admin/posts/?source=html" : "/ghost/api/admin/posts/",
    body: { posts: [post] },
  });
  if (!result.ok) return result;
  const created = result.json?.posts?.[0];
  if (!created) return { ok: false, message: "ghost returned no created post" };
  return { ok: true, status: result.status, post: summarizePost(created) };
}

export async function updateDraft({ url, key, id, updatedAt, title, html, excerpt, tags } = {}) {
  if (!id) return { ok: false, message: "post id is required" };
  if (!updatedAt) return { ok: false, message: "updated_at from the last read is required" };
  const post = {
    updated_at: updatedAt,
    status: "draft",
  };
  if (title != null) post.title = String(title).slice(0, 191);
  if (excerpt != null) post.custom_excerpt = String(excerpt).slice(0, 300);
  if (html != null) post.html = html;
  if (tags != null) post.tags = tags;
  const result = await adminRequest({
    url,
    key,
    method: "PUT",
    path: html != null ? `/ghost/api/admin/posts/${id}/?source=html` : `/ghost/api/admin/posts/${id}/`,
    body: { posts: [post] },
  });
  if (!result.ok) return result;
  const updated = result.json?.posts?.[0];
  if (!updated) return { ok: false, message: "ghost returned no updated post" };
  return { ok: true, status: result.status, post: summarizePost(updated) };
}

export async function deleteDraft({ url, key, id } = {}) {
  if (!id) return { ok: false, message: "post id is required" };
  const result = await adminRequest({ url, key, method: "DELETE", path: `/ghost/api/admin/posts/${id}/` });
  if (!result.ok && result.status !== 404) return result;
  return { ok: true, status: result.status ?? 204, deleted: result.status !== 404 };
}

export async function listContentPosts({ url, contentKey, filter, timeoutMs = 15000 } = {}) {
  const base = normalizeGhostUrl(url);
  if (!base) return { ok: false, message: "GHOST_URL is missing" };
  if (typeof contentKey !== "string" || contentKey.trim() === "") {
    return { ok: false, message: "content API key is missing" };
  }
  const params = new URLSearchParams({ key: contentKey.trim(), limit: "all" });
  if (filter) params.set("filter", filter);
  try {
    const res = await fetch(`${base}/ghost/api/content/posts/?${params}`, {
      method: "GET",
      headers: { Accept: "application/json" },
      signal: AbortSignal.timeout(timeoutMs),
    });
    const json = await res.json().catch(() => null);
    if (!res.ok) {
      return { ok: false, status: res.status, message: extractGhostError(json) || `content API returned ${res.status}` };
    }
    return { ok: true, status: res.status, posts: Array.isArray(json?.posts) ? json.posts.map(summarizePost) : [] };
  } catch (error) {
    return { ok: false, message: error?.cause?.code || "content API request failed" };
  }
}

export function summarizePost(post) {
  if (!post || typeof post !== "object") return null;
  return {
    id: post.id ?? null,
    uuid: post.uuid ?? null,
    title: post.title ?? null,
    slug: post.slug ?? null,
    status: post.status ?? null,
    published_at: post.published_at ?? null,
    updated_at: post.updated_at ?? null,
    created_at: post.created_at ?? null,
    custom_excerpt: post.custom_excerpt ?? null,
    plaintext: post.plaintext ?? null,
    html: post.html ?? null,
    url: post.url ?? null,
    tags: Array.isArray(post.tags) ? post.tags.map((tag) => tag?.name).filter(Boolean) : [],
  };
}

function extractGhostError(json) {
  const first = json?.errors?.[0];
  if (!first) return null;
  const context = typeof first.context === "string" && first.context.trim() ? ` (${first.context})` : "";
  return `${first.message || "ghost error"}${context}`;
}

function hexSecretBytes(secret) {
  if (typeof secret !== "string" || secret.length === 0 || secret.length % 2 !== 0) return null;
  if (!/^[0-9a-fA-F]+$/.test(secret)) return null;
  const buf = Buffer.from(secret, "hex");
  return buf.length > 0 ? buf : null;
}

function b64url(text) {
  return Buffer.from(text).toString("base64url");
}
