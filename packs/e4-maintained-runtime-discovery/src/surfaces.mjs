/** Existing published SameDayDesk surfaces; this pack does not invent URLs or schemas. */
export const SITE_ORIGIN = "https://samedaydesk.com";

export const DISCOVERY_SCHEMA = "samedaydesk.for-agents.useful-jobs.v1";
export const CATALOG_SCHEMA = "useful-jobs.catalog.v1";
export const PACKAGE_ID = "useful-jobs";

export const SURFACES = Object.freeze({
  discovery: Object.freeze({
    id: "discovery",
    path: "/discovery/useful-jobs.json",
    url: `${SITE_ORIGIN}/discovery/useful-jobs.json`,
    committedRel: "client/public/discovery/useful-jobs.json",
    kind: "json",
  }),
  catalog: Object.freeze({
    id: "catalog",
    path: "/for-agents/useful-jobs/catalog.json",
    url: `${SITE_ORIGIN}/for-agents/useful-jobs/catalog.json`,
    committedRel: "client/public/for-agents/useful-jobs/catalog.json",
    kind: "json",
  }),
  llms: Object.freeze({
    id: "llms",
    path: "/llms.txt",
    url: `${SITE_ORIGIN}/llms.txt`,
    committedRel: "client/public/llms.txt",
    kind: "text",
  }),
  page: Object.freeze({
    id: "page",
    path: "/for-agents/useful-jobs",
    url: `${SITE_ORIGIN}/for-agents/useful-jobs`,
    committedRel: null,
    kind: "html",
  }),
});

export const LLMS_REQUIRED_POINTERS = Object.freeze([
  `${SITE_ORIGIN}/discovery/useful-jobs.json`,
  `${SITE_ORIGIN}/for-agents/useful-jobs`,
]);

export const MAX_BODY_BYTES = 262144;
export const FETCH_TIMEOUT_MS = 15000;
