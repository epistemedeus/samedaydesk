/**
 * Capability matching and disclosure journeys.
 *
 * Advertised / runnable / delivered stay distinct. Completion hrefs are
 * stored as references and never fetched. Correspondence persistence reuses
 * existing event kinds; it is not a second marketplace or payment store.
 */

import {
  CLOCK_DOMAIN_FIXTURE,
  DISCLOSURE_SCHEMA,
  JOURNEY_SCHEMA,
  MATCH_REFUSAL,
} from "./constants.mjs";
import { createSeedCatalog, FIXTURE_NOW } from "./catalog.mjs";
import { applyCorrection, matchCapabilities } from "./match.mjs";
import { createLocalMarket } from "./adapter.mjs";
import { validateCapability } from "./validate.mjs";
import { safeCapabilityHref } from "./safety.mjs";
import { selectionFromCapabilityMatch } from "../../shared/handoff.mjs";

const EVENT_TEXT_MAX = 8000;
const ARTIFACT_LABEL_MAX = 200;

function isPlainObject(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function clip(value, max = EVENT_TEXT_MAX) {
  const text = value == null ? "" : String(value);
  return text.length <= max ? text : text.slice(0, max);
}

function requestedOutcomes(request) {
  if (Array.isArray(request?.outcomes)) {
    return request.outcomes.map((o) => String(o).trim()).filter(Boolean);
  }
  if (typeof request?.outcome === "string" && request.outcome.trim()) {
    return [request.outcome.trim()];
  }
  return [];
}

function normalizeRequest(request = {}) {
  const outcomes = requestedOutcomes(request);
  const rawInputs = request?.inputs;
  if (rawInputs != null && !isPlainObject(rawInputs)) {
    return {
      outcomes,
      inputs: null,
      malformedInputs: true,
    };
  }
  return {
    outcomes,
    inputs: rawInputs && isPlainObject(rawInputs) ? rawInputs : {},
    malformedInputs: false,
  };
}

/**
 * HTTPS completion/route hrefs may be stored as correspondence artifacts.
 * Rooted relative lab paths are valid on the page but are not HTTPS artifacts.
 */
export function httpsCompletionHref(href) {
  const safe = safeCapabilityHref(href, { allowRelative: false });
  if (!safe || !safe.startsWith("https://")) return null;
  return safe;
}

function advertisedView(capability, { stale = false } = {}) {
  if (!isPlainObject(capability)) {
    return {
      id: null,
      title: null,
      layer: null,
      sellerClass: null,
      sellerLabel: null,
      demo: false,
      outcomes: [],
      price: null,
      completionHref: null,
      routeKind: null,
    };
  }
  const price = isPlainObject(capability.price) ? capability.price : null;
  return {
    id: capability.id ?? null,
    title: capability.title ?? null,
    layer: capability.layer ?? null,
    sellerClass: capability.seller?.class ?? null,
    sellerLabel: capability.seller?.label ?? null,
    demo: Boolean(capability.demo),
    outcomes: Array.isArray(capability.outcomes) ? capability.outcomes.slice() : [],
    price: price
      ? {
          amount: price.amount ?? null,
          currency: price.currency ?? null,
          source: price.source ?? null,
          observedAt: price.observedAt ?? null,
          freshnessMaxAgeSec: price.freshnessMaxAgeSec ?? null,
          stale: Boolean(stale),
        }
      : null,
    completionHref: safeCapabilityHref(capability.completionLink?.href),
    routeKind: capability.executionRoute?.kind ?? null,
  };
}

/**
 * Progressive disclosure of one capability: identity and price first,
 * then runnable/delivered layers. Never copies reviews, rank, or custody fields.
 */
export function discloseCapability(capability, extra = {}) {
  const nowMs = extra.nowMs ?? Date.parse(FIXTURE_NOW);
  const validation = extra.validation ?? validateCapability(capability, { nowMs });
  const stale = extra.stale != null ? Boolean(extra.stale) : Boolean(validation.stale);
  const advertised = advertisedView(capability, { stale });
  const adapterId = typeof capability?.runnableAdapterId === "string" ? capability.runnableAdapterId : null;

  return {
    schema: DISCLOSURE_SCHEMA,
    clockDomain: extra.clockDomain || CLOCK_DOMAIN_FIXTURE,
    advertised,
    runnable: {
      adapterId,
      present: Boolean(adapterId),
    },
    delivered: extra.delivered ?? null,
    overlap: Array.isArray(extra.overlap) ? extra.overlap.slice() : [],
    refusals: extra.refusals || validation.refusals || [],
    errors: extra.errors || validation.errors || [],
    ok: extra.ok != null ? Boolean(extra.ok) : Boolean(validation.ok),
    hostedApi: false,
    funded: false,
    custody: false,
    fetchedCompletion: false,
    note:
      extra.note ||
      "Advertised, runnable, and delivered layers stay distinct. Completion hrefs are references only.",
  };
}

export function discloseCatalog(catalog, { nowMs = Date.parse(FIXTURE_NOW) } = {}) {
  const seed = catalog || createSeedCatalog();
  return {
    schema: DISCLOSURE_SCHEMA,
    clockDomain: CLOCK_DOMAIN_FIXTURE,
    hostedApi: false,
    funded: false,
    custody: false,
    fetchedCompletion: false,
    count: seed.length,
    capabilities: seed.map((capability) => discloseCapability(capability, { nowMs })),
    note: "Directory disclosure. Fixture sellers stay labeled. No ranking or invented reviews.",
  };
}

function deliveryDisclosure(delivery) {
  if (!delivery) return null;
  return {
    ok: Boolean(delivery.ok),
    reason: delivery.reason || null,
    layers: delivery.layers || null,
    evidenceClass: delivery.evidence?.evidenceClass || null,
    resultKeys: delivery.evidence?.result ? Object.keys(delivery.evidence.result) : [],
    distinctFromAdvertisement: delivery.layers?.delivered === "evidence" || delivery.ok === false,
    note: delivery.evidence?.note || (delivery.errors || []).join("; ") || null,
  };
}

export function correspondenceBodiesFromJourney({
  request,
  matched,
  selection,
  delivery = null,
} = {}) {
  const bodies = [];
  const outcomes = requestedOutcomes(request);
  const inputs = isPlainObject(request?.inputs) ? request.inputs : {};
  const matchCount = Array.isArray(matched?.matches) ? matched.matches.length : 0;
  const rejectedCount = Array.isArray(matched?.rejected) ? matched.rejected.length : 0;

  bodies.push({
    kind: "request",
    text: clip(
      [
        "Capability match request",
        `outcomes=${outcomes.join(",") || "(directory)"}`,
        `inputs=${JSON.stringify(inputs)}`,
        `matchCount=${matchCount}`,
        `rejectedCount=${rejectedCount}`,
        `empty=${Boolean(matched?.empty)}`,
        matched?.refusal ? `refusal=${matched.refusal}` : null,
        "Local directory matcher. Not a hosted marketplace API.",
      ]
        .filter(Boolean)
        .join("\n"),
    ),
  });

  const completionUrl = httpsCompletionHref(selection?.completionLink?.href);
  if (selection?.ok && completionUrl) {
    const label = clip(selection.completionLink?.label || selection.capabilityId || "capability", ARTIFACT_LABEL_MAX);
    bodies.push({
      kind: "artifact",
      text: clip(
        [
          `Selected capability ${selection.capabilityId}`,
          `sellerClass=${selection.sellerClass}`,
          `stale=${Boolean(selection.stale)}`,
          `runnable=${Boolean(selection.runnable)}`,
          `routeKind=${selection.routeKind || ""}`,
          "Completion URL stored as a reference; not fetched.",
          "Not custody. Declared prices are not settlement.",
        ].join("\n"),
      ),
      artifact: { url: completionUrl, label },
    });
  } else if (selection?.ok) {
    bodies.push({
      kind: "reply",
      text: clip(
        [
          `Local-only capability selection ${selection.capabilityId}`,
          `sellerClass=${selection.sellerClass}`,
          `demo=${selection.sellerClass === "fixture_demo"}`,
          `completionHref=${selection.completionLink?.href || ""}`,
          "Href is not HTTPS, so it is not stored as a correspondence artifact.",
          "No invented marketplace listing URL.",
        ].join("\n"),
      ),
    });
  } else {
    bodies.push({
      kind: "needs_human",
      text: clip(
        [
          "No selectable capability",
          `refusal=${selection?.refusal || matched?.refusal || MATCH_REFUSAL.NO_RESULT}`,
          `rejectedCount=${rejectedCount}`,
          "Honest refusal; no invented seller or price.",
        ].join("\n"),
      ),
    });
  }

  if (delivery) {
    const ok = Boolean(delivery.ok);
    bodies.push({
      kind: ok ? "reply" : "needs_human",
      text: clip(
        [
          "Capability delivery disclosure",
          `ok=${ok}`,
          `reason=${delivery.reason || "delivered"}`,
          `advertised=${delivery.layers?.advertised || delivery.advertised?.id || ""}`,
          `runnable=${delivery.layers?.runnable || ""}`,
          `delivered=${delivery.layers?.delivered || ""}`,
          `evidenceClass=${delivery.evidence?.evidenceClass || ""}`,
          delivery.evidence?.note || (delivery.errors || []).join("; ") || null,
          "Delivered evidence is distinct from the advertisement.",
        ]
          .filter((line) => line != null && line !== "")
          .join("\n"),
      ),
    });
  }

  return bodies;
}

/**
 * Persist journey bodies through a caller-supplied postEvent.
 * Does not create a second store; postEvent should be the correspondence client.
 */
export async function persistCapabilityJourney({ postEvent, bodies, keys = [] } = {}) {
  if (typeof postEvent !== "function") {
    throw new Error("persistCapabilityJourney requires postEvent");
  }
  if (!Array.isArray(bodies) || bodies.length === 0) {
    throw new Error("persistCapabilityJourney requires correspondence bodies");
  }
  const posted = [];
  for (let i = 0; i < bodies.length; i += 1) {
    const result = await postEvent({
      ...bodies[i],
      idempotencyKey: keys[i],
    });
    posted.push(result);
  }
  return posted;
}

export async function runMatchJourney({
  catalog,
  request = {},
  nowMs = Date.parse(FIXTURE_NOW),
  runSelected = false,
} = {}) {
  const seed = catalog || createSeedCatalog();
  const normalized = normalizeRequest(request);
  const matched = normalized.malformedInputs
    ? {
        matches: [],
        rejected: [
          {
            id: null,
            refusals: [MATCH_REFUSAL.INCOMPATIBLE_INPUT],
            errors: ["inputs must be a JSON object"],
          },
        ],
        empty: true,
        refusal: MATCH_REFUSAL.INCOMPATIBLE_INPUT,
      }
    : matchCapabilities(seed, { outcomes: normalized.outcomes, inputs: normalized.inputs }, { nowMs });

  const requestedOutcome = normalized.outcomes[0] || null;
  const selection = selectionFromCapabilityMatch(matched, {
    requestedOutcome,
    inputs: normalized.malformedInputs ? null : normalized.inputs,
  });

  const disclosures = matched.matches.map((item) =>
    discloseCapability(item.capability, {
      nowMs,
      stale: item.stale,
      overlap: item.overlap,
      ok: true,
    }),
  );

  let delivery = null;
  if (runSelected && selection.ok && selection.capabilityId) {
    const market = createLocalMarket({ catalog: seed, nowMs });
    delivery = await market.run(selection.capabilityId, normalized.malformedInputs ? {} : normalized.inputs || {});
    if (disclosures[0]) {
      disclosures[0].delivered = deliveryDisclosure(delivery);
    }
  }

  return {
    schema: JOURNEY_SCHEMA,
    clockDomain: CLOCK_DOMAIN_FIXTURE,
    request: {
      outcomes: normalized.outcomes,
      inputs: normalized.malformedInputs ? request.inputs : normalized.inputs,
      malformedInputs: normalized.malformedInputs,
    },
    match: {
      empty: Boolean(matched.empty),
      refusal: matched.refusal,
      matchCount: matched.matches.length,
      rejectedCount: matched.rejected.length,
      matchIds: matched.matches.map((item) => item.capability.id),
      rejected: matched.rejected.map((item) => ({
        id: item.id ?? null,
        refusals: item.refusals || [],
        errors: item.errors || [],
      })),
    },
    selection,
    disclosures,
    delivery,
    correspondenceBodies: correspondenceBodiesFromJourney({
      request: { outcomes: normalized.outcomes, inputs: normalized.malformedInputs ? {} : normalized.inputs },
      matched,
      selection,
      delivery,
    }),
    hostedApi: false,
    funded: false,
    custody: false,
    fetchedCompletion: false,
    note: "Matching and disclosure only. Completion links are not fetched. No custody.",
  };
}

export async function runDisclosureJourney(options = {}) {
  return runMatchJourney({ ...options, runSelected: true });
}

export function runCorrectionJourney({ catalog, correction, nowMs = Date.parse(FIXTURE_NOW) } = {}) {
  const seed = catalog || createSeedCatalog();
  const next = applyCorrection(seed, correction);
  const prior = next.find((item) => item.id === correction.supersedesId);
  const replacement =
    next.find((item) => item.id === correction.replacement?.id) ||
    next.find((item) => item.correctsId === correction.supersedesId);
  const replacementDisclosure = replacement
    ? discloseCapability(replacement, { nowMs, ok: true })
    : null;
  const priorDisclosure = prior
    ? discloseCapability(prior, {
        nowMs,
        ok: false,
        refusals: [],
        note: `Superseded by ${prior.supersededBy || replacement?.id}. Not silently rewritten.`,
      })
    : null;

  return {
    schema: JOURNEY_SCHEMA,
    kind: "correction",
    priorId: prior?.id ?? null,
    priorActive: prior?.active,
    supersededBy: prior?.supersededBy ?? null,
    replacementId: replacement?.id ?? null,
    replacementDisclosure,
    priorDisclosure,
    catalog: next,
    correspondenceBodies: [
      {
        kind: "correction",
        text: clip(
          [
            "Capability correction",
            `supersedesId=${correction.supersedesId}`,
            `replacementId=${replacement?.id || ""}`,
            `note=${correction.note || "explicit correction"}`,
            "Prior record remains; it is marked superseded. No silent rewrite.",
          ].join("\n"),
        ),
      },
    ],
    hostedApi: false,
    fetchedCompletion: false,
  };
}
