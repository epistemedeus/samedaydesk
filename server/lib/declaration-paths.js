// Paths whose GET is a machine-declaration fetch. Pulse reuses byPath for the
// count. Keep this list aligned with the apex routes that serve declarations.
export const DECLARATION_FETCH_PATHS = Object.freeze([
  "/openapi.json",
  "/skill.md",
  "/.well-known/api-catalog",
  "/.well-known/agent-card.json",
]);
