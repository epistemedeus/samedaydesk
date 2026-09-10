import {
  ENTRIES_SCHEMA,
  ERROR_CODES,
  SOURCE_TAGS,
  TAGGED_SCHEMA,
} from "./constants.mjs";
import { linkError, validateEntries } from "./validate.mjs";

function defaultClock() {
  return Date.now();
}

export const TAGGED_STATUS = Object.freeze({
  READY: "ready",
  PARTIAL: "partial",
});

/**
 * Attach explicit source tags to product entry links.
 * source=grexal|agensi|catalog|manual plus opaque campaign/ref tags.
 * Does not invent traffic or buyers. Synthetic fixtures OK for tests.
 */
export function tagEntries(entriesDoc, options = {}) {
  const clock = options.clock || defaultClock;
  let doc;
  try {
    doc = validateEntries(entriesDoc);
  } catch (err) {
    if (err.code === ERROR_CODES.MISSING_REQUIREMENT) {
      return {
        schema: TAGGED_SCHEMA,
        status: TAGGED_STATUS.PARTIAL,
        generatedAt: new Date(clock()).toISOString(),
        entriesSchema: entriesDoc?.schema ?? null,
        cite: typeof entriesDoc?.cite === "string" ? entriesDoc.cite : null,
        links: [],
        missingInputs: err.details?.missing || [err.message],
        mutationBoundary: mutationBoundary(),
        consumerInstructions: consumerInstructions(),
        privacyNotes: privacyNotes(),
        error: { code: err.code, message: err.message, details: err.details || null },
      };
    }
    throw err;
  }

  const missing = [];
  const links = [];

  for (let i = 0; i < doc.entries.length; i++) {
    const entry = doc.entries[i];
    const path = `entries[${i}]`;

    if (!entry.source || !Object.values(SOURCE_TAGS).includes(entry.source)) {
      missing.push(`${path}.source`);
      // Still emit a partial link without sourceTag so consumers see the gap
      links.push({
        id: entry.id,
        label: entry.label,
        href: entry.href,
        sourceTag: null,
        taggedHref: entry.href,
        opaqueTags: entry.opaqueTags || {},
        missingSourceTag: true,
        notes: entry.notes || null,
      });
      continue;
    }

    const opaque = entry.opaqueTags || {};
    const queryParts = [`source=${encodeURIComponent(entry.source)}`];
    for (const [k, v] of Object.entries(opaque)) {
      queryParts.push(`${encodeURIComponent(k)}=${encodeURIComponent(v)}`);
    }
    const taggedHref = appendQuery(entry.href, queryParts.join("&"));

    links.push({
      id: entry.id,
      label: entry.label,
      href: entry.href,
      sourceTag: entry.source,
      taggedHref,
      opaqueTags: { ...opaque },
      missingSourceTag: false,
      catalogRef: entry.catalogRef || null,
      notes: entry.notes || null,
      // Explicit non-intent markers
      impliesBuyerIntent: false,
      equatesActivationWithIntent: false,
    });
  }

  const status = missing.length ? TAGGED_STATUS.PARTIAL : TAGGED_STATUS.READY;

  return {
    schema: TAGGED_SCHEMA,
    status,
    generatedAt: new Date(clock()).toISOString(),
    entriesSchema: ENTRIES_SCHEMA,
    cite: doc.cite,
    links,
    missingInputs: missing,
    truthNotes: [
      "Source tags are explicit query params (source=grexal|agensi|catalog|manual).",
      "Opaque campaign/ref ids are synthetic fixtures unless cited as observed.",
      "Tagged links do not imply buyer or purchase intent.",
      "Do not invent live clicks, real traffic, or buyers.",
    ],
    privacyNotes: privacyNotes(),
    mutationBoundary: mutationBoundary(),
    consumerInstructions: consumerInstructions(),
    evidenceIndex: "evidence/INDEX.md",
  };
}

function appendQuery(href, query) {
  if (!query) return href;
  try {
    if (href.startsWith("/")) {
      const sep = href.includes("?") ? "&" : "?";
      return `${href}${sep}${query}`;
    }
    const u = new URL(href);
    const extra = new URLSearchParams(query);
    for (const [k, v] of extra.entries()) {
      u.searchParams.set(k, v);
    }
    return u.toString();
  } catch {
    const sep = href.includes("?") ? "&" : "?";
    return `${href}${sep}${query}`;
  }
}

function privacyNotes() {
  return [
    "Events may record linkPresented / linkActivated / sourceTag only.",
    "buyerIntent, purchaseIntent, and activation-equals-intent claims are forbidden.",
    "Click or open is presentation/activation signal — never buyer intent.",
  ];
}

function mutationBoundary() {
  return {
    executesProviderMutations: false,
    forbids: [
      "grexal login",
      "grexal push --publish",
      "grexal publish",
      "grexal agent price",
      "agensi Bot login",
      "agensi review re-submit",
      "invent live clicks or buyers",
      "equate activation with buyerIntent",
      "collapse unavailable into no_users",
      "merge to default",
    ],
    ownerOfPublicationAndPrice: "Root",
    pointsAtExistingPins: true,
  };
}

function consumerInstructions() {
  return [
    "node experiments/scale-r2-20260910/distribution/04/src/cli.mjs demo",
    "node experiments/scale-r2-20260910/distribution/04/src/cli.mjs tag experiments/scale-r2-20260910/distribution/04/fixtures/entries.positive.json",
    "node experiments/scale-r2-20260910/distribution/04/src/cli.mjs event /tmp/r2-dist-04-tagged.json experiments/scale-r2-20260910/distribution/04/fixtures/signal.recorded.json",
    "node experiments/scale-r2-20260910/distribution/04/src/cli.mjs validate /tmp/r2-dist-04-events.json",
    "npm run test:r2-distribution-04",
    "Acquisition links only — does not login, publish, price, or claim buyer intent from clicks.",
  ].join("\n");
}
