// Apex resources that registries may list. Alias mounts reuse these handlers;
// do not add a second implementation per surface.

export const CANONICAL_RESOURCES = Object.freeze([
  Object.freeze({
    id: "mcp",
    path: "/mcp",
    handler: "mcp",
    methods: Object.freeze(["GET", "POST"]),
    summary: "Remote Streamable HTTP MCP server (AI-readiness tools and TaskMarket planning).",
  }),
  Object.freeze({
    id: "scan",
    path: "/scan",
    handler: "scan",
    methods: Object.freeze(["GET"]),
    summary: "Server-rendered AI-readiness proof page for a public site URL.",
  }),
  Object.freeze({
    id: "tools",
    path: "/api/tools",
    handler: "tools",
    methods: Object.freeze(["GET"]),
    summary: "Public AI-readiness and llms.txt tool API.",
  }),
]);

const BY_ID = new Map(CANONICAL_RESOURCES.map((resource) => [resource.id, resource]));
const BY_PATH = new Map(CANONICAL_RESOURCES.map((resource) => [resource.path, resource]));

export function getCanonicalResource(id) {
  return BY_ID.get(id) || null;
}

export function getCanonicalResourceByPath(pathname) {
  if (typeof pathname !== "string" || pathname.length === 0) return null;
  const pathOnly = pathname.split("?")[0].split("#")[0];
  if (BY_PATH.has(pathOnly)) return BY_PATH.get(pathOnly);
  const ranked = [...CANONICAL_RESOURCES]
    .filter((resource) => pathOnly === resource.path || pathOnly.startsWith(`${resource.path}/`))
    .sort((left, right) => right.path.length - left.path.length);
  return ranked[0] || null;
}
