import { STAGES, ROUTES, validateQuery, factKey, actorKey } from "./contract.mjs";
import { validateState } from "./ingest.mjs";

const SUCCESS = {
  discovery: ["visited"], signup: ["created"], claim: ["claimed"], submission: ["submitted"],
  review: ["accepted_useful", "accepted_unknown"], qualified_fulfillment: ["qualified"],
  consented_publication: ["published"], referral: ["shared"], repeat_useful_work: ["useful"], customer_revenue: ["recognized"],
};
const PREVIOUS = { claim: "signup", submission: "claim", review: "submission", qualified_fulfillment: "review", consented_publication: "review", referral: "consented_publication" };
const TRANSITIONS = [
  ["discovery", "signup"], ["signup", "claim"], ["claim", "submission"], ["submission", "review"],
  ["review", "qualified_fulfillment"], ["qualified_fulfillment", "consented_publication"], ["review", "consented_publication"], ["consented_publication", "referral"],
];
function sameActor(a, b) {
  return actorKey(a) === actorKey(b) && a.populationId === b.populationId && a.provenance === b.provenance && a.actorRelation === b.actorRelation;
}
function sameWork(a, b) {
  return ["taskId", "workId", "reservationId", "termsId", "artifactId", "obligationId", "receiptId", "referralId"]
    .every((key) => !a.refs[key] || !b.refs[key] || a.refs[key] === b.refs[key]);
}
function within(event, window) { return event.occurredAt >= window.from && event.occurredAt < window.to; }
function matchedWindow(a, b) { return ["from", "to", "asOf"].every((key) => a[key] === b[key]); }
function ratio(numerator, denominator) { return denominator ? { numerator, denominator, value: numerator / denominator } : null; }
function ancestry(stage) {
  const out = [stage];
  while (PREVIOUS[out.at(-1)]) out.push(PREVIOUS[out.at(-1)]);
  if (stage === "repeat_useful_work") out.push("review", "submission", "claim", "signup");
  return out;
}
function evaluator(heads) {
  const cache = new Map();
  function qualify(event, trail = new Set()) {
    const key = factKey(event);
    if (cache.has(key)) return cache.get(key);
    const result = (reason = null) => ({ ok: reason === null, reason });
    if (event.evidence !== "observed") return result("self_report_only");
    if (trail.has(key)) return result("parent_cycle");
    if (!(SUCCESS[event.stage].includes(event.outcome) || event.stage === "referral" && event.outcome === "arrived")) return result("not_current_success");
    const next = new Set(trail).add(key);
    const parents = event.parents.map((reference) => heads.get(factKey(reference)));
    let answer;
    if (parents.some((parent) => !parent)) answer = result("parent_missing");
    else if (parents.some((parent) => parent.occurredAt > event.occurredAt)) answer = result("parent_time_reversed");
    else if (event.stage === "customer_revenue") {
      answer = event.parents.length ? result("unexpected_parent")
        : ["sponsored", "owner_qa"].includes(event.actorRelation) ? result("revenue_relation_conflict") : result();
    } else if (event.stage === "repeat_useful_work") {
      if (parents.length !== 2 || parents.some((parent) => parent.stage !== "review" || parent.outcome !== "accepted_useful" || !sameActor(event, parent))) answer = result("repeat_binding_missing");
      else {
        const [prior, later] = [...parents].sort((a, b) => a.occurredAt.localeCompare(b.occurredAt));
        if (prior.refs.taskId === later.refs.taskId || prior.refs.workId === later.refs.workId || prior.occurredAt >= later.occurredAt ||
            event.refs.workId !== later.refs.workId || !sameWork(event, later)) answer = result("repeat_not_distinct_useful_work");
        else answer = parents.every((parent) => qualify(parent, next).ok) ? result() : result("parent_not_qualified");
      }
    } else if (event.stage === "referral" && event.outcome === "arrived") {
      const share = parents.find((parent) => parent.stage === "referral" && parent.outcome === "shared");
      const signup = parents.find((parent) => parent.stage === "signup");
      if (parents.length !== 2 || !share || !signup || !sameActor(event, signup) ||
          actorKey(share) === actorKey(signup) || share.provenance !== signup.provenance ||
          share.refs.referralId !== event.refs.referralId || share.occurredAt > signup.occurredAt) answer = result("referral_binding_missing");
      else answer = parents.every((parent) => qualify(parent, next).ok) ? result() : result("parent_not_qualified");
    } else {
      const previous = PREVIOUS[event.stage];
      const optionalDiscovery = event.stage === "signup";
      if (previous && (parents.length !== 1 || parents[0].stage !== previous && !(event.stage === "consented_publication" && parents[0].stage === "qualified_fulfillment")) ||
          optionalDiscovery && (parents.length > 1 || parents.length === 1 && parents[0].stage !== "discovery") ||
          !previous && !optionalDiscovery && parents.length) answer = result("parent_stage_mismatch");
      else if (parents.some((parent) => !sameActor(event, parent) || !sameWork(event, parent))) answer = result("parent_scope_mismatch");
      else answer = parents.every((parent) => qualify(parent, next).ok) ? result() : result("parent_not_qualified");
    }
    cache.set(key, answer);
    return answer;
  }
  return qualify;
}
// Reads an immutable observation cut. All externally visible values are fixed
// enums, bounded counters or validated times; even opaque private IDs are omitted.
export function project(inputState, query, policy) {
  const state = validateState(inputState, policy);
  validateQuery(query, policy);
  const heads = new Map();
  for (const event of state.events) if (event.observedAt <= query.window.asOf) heads.set(factKey(event), event);
  const qualify = evaluator(heads);
  const all = [...heads.values()];
  const privateViews = query.populations.map((population, populationIndex) => {
    const windowMatches = matchedWindow(population.window, query.window);
    const memberSet = population.members === null ? null : new Set(population.members);
    const candidates = all.filter((event) => event.populationId === population.id && event.namespace === population.namespace && within(event, query.window));
    const diagnostics = new Map();
    function issue(stage, code) { const key = JSON.stringify([stage, code]); diagnostics.set(key, (diagnostics.get(key) || 0) + 1); }
    const selected = [];
    for (const event of candidates) {
      if (event.actorRelation !== population.actorRelation || event.provenance !== population.provenance) {
        issue(event.stage, "classification_conflict"); continue;
      }
      if (population.membership === "complete" && !memberSet.has(event.actorId)) {
        issue(event.stage, "actor_outside_population"); continue;
      }
      selected.push(event);
    }
    const sets = Object.fromEntries(STAGES.map((stage) => [stage, new Set()]));
    const qualifying = [];
    const stageViews = Object.fromEntries(STAGES.map((stage) => {
      const rows = selected.filter((event) => event.stage === stage);
      const coverage = population.coverage[stage] || { state: "absent", producerIds: [] };
      for (const event of rows) {
        if (!coverage.producerIds.includes(event.producerId)) issue(stage, "producer_not_covered");
        if (event.evidence !== "observed" || !SUCCESS[stage].includes(event.outcome)) continue;
        const result = qualify(event);
        if (result.ok) { sets[stage].add(actorKey(event)); qualifying.push(event); }
        else issue(stage, result.reason);
      }
      return [stage, {
        observedEvents: rows.filter((event) => event.evidence === "observed").length,
        declaredEvents: rows.filter((event) => event.evidence === "self_report").length,
        channels: Object.fromEntries([...new Set(rows.map((event) => event.channel))].sort().map((channel) => [channel, {
          observedEvents: rows.filter((event) => event.channel === channel && event.evidence === "observed").length,
          declaredEvents: rows.filter((event) => event.channel === channel && event.evidence === "self_report").length,
        }])),
        observedOutcomes: Object.fromEntries([...new Set(rows.filter((event) => event.evidence === "observed").map((event) => event.outcome))].sort().map((outcome) => [outcome, rows.filter((event) => event.evidence === "observed" && event.outcome === outcome).length])),
        declaredOutcomes: Object.fromEntries([...new Set(rows.filter((event) => event.evidence === "self_report").map((event) => event.outcome))].sort().map((outcome) => [outcome, rows.filter((event) => event.evidence === "self_report" && event.outcome === outcome).length])),
        qualifiedScopedActors: sets[stage].size,
        coverage: windowMatches ? coverage.state : "unknown",
        sourceCount: coverage.producerIds.length,
        knownCount: null,
      }];
    }));
    const issuesFor = (stage) => [...diagnostics.keys()].some((key) => JSON.parse(key)[0] === stage);
    function known(stage) {
      return windowMatches && population.membership === "complete" && ancestry(stage).every((ancestor) =>
        stageViews[ancestor].coverage === "complete" && !issuesFor(ancestor));
    }
    for (const stage of STAGES) if (known(stage)) stageViews[stage].knownCount = sets[stage].size;
    const rates = Object.fromEntries(TRANSITIONS.map(([from, to]) => {
      let reason = !windowMatches ? "window_mismatch" : population.membership !== "complete" ? "membership_unknown"
        : !known(from) || !known(to) ? "coverage_or_join_unknown" : null;
      // Signup alone is observed, but acquisition conversion needs its explicit encounter join.
      const numerators = new Set(qualifying.filter((event) => event.stage === to && event.parents.some((ref) => {
        const previous = heads.get(factKey(ref));
        return previous?.stage === from && within(previous, query.window) && sets[from].has(actorKey(previous));
      })).map(actorKey));
      if (!reason && to === "signup" && numerators.size !== sets.signup.size) reason = "acquisition_join_missing";
      if (!reason && (numerators.size !== sets[to].size || [...numerators].some((actor) => !sets[from].has(actor)))) reason = "denominator_join_missing";
      const denominator = reason ? null : sets[from].size;
      if (denominator === 0) reason = "empty_denominator";
      return [`${to}_from_${from}`, { numerator: reason ? null : numerators.size, denominator, rate: reason ? null : ratio(numerators.size, denominator), reason }];
    }));
    const useful = qualifying.filter((event) => event.stage === "review" && event.outcome === "accepted_useful");
    const firstUseful = new Map();
    for (const event of useful) {
      const key = actorKey(event);
      if (!firstUseful.has(key) || event.occurredAt < firstUseful.get(key).occurredAt) firstUseful.set(key, event);
    }
    const mature = new Set([...firstUseful].filter(([, event]) => Date.parse(event.occurredAt) + query.retentionSeconds * 1000 <= Date.parse(query.window.to)).map(([key]) => key));
    const repeats = qualifying.filter((event) => event.stage === "repeat_useful_work");
    const retained = new Set(repeats.filter((event) => {
      const actor = actorKey(event);
      const laterReview = event.parents.map((ref) => heads.get(factKey(ref))).sort((a, b) => a.occurredAt.localeCompare(b.occurredAt)).at(-1);
      return mature.has(actor) && Date.parse(laterReview.occurredAt) < Date.parse(firstUseful.get(actor).occurredAt) + query.retentionSeconds * 1000;
    }).map(actorKey));
    let retentionReason = !windowMatches ? "window_mismatch" : population.membership !== "complete" ? "membership_unknown"
      : !known("review") || !known("repeat_useful_work") ? "coverage_or_join_unknown" : mature.size === 0 ? "no_mature_denominator" : null;
    // A cited prior task outside the cut cannot be silently turned into a new cohort.
    if (!retentionReason && repeats.some((event) => event.parents.some((ref) => !within(heads.get(factKey(ref)), query.window)))) retentionReason = "prior_work_outside_window";
    const arrivals = selected.filter((event) => event.stage === "referral" && event.outcome === "arrived" && event.evidence === "observed");
    const referred = new Set();
    for (const event of arrivals) {
      const result = qualify(event);
      if (result.ok && sets.signup.has(actorKey(event))) referred.add(actorKey(event));
      else issue("referral", result.ok ? "signup_outside_window" : result.reason);
    }
    // Arrival diagnostics can invalidate a previously calculated referral rate.
    if (issuesFor("referral")) {
      stageViews.referral.knownCount = null;
      rates.referral_from_consented_publication = { numerator: null, denominator: null, rate: null, reason: "coverage_or_join_unknown" };
    }
    const signupRows = qualifying.filter((event) => event.stage === "signup");
    const attribution = Object.fromEntries(["observed", "declared"].map((plane) => [plane,
      Object.fromEntries(ROUTES.map((route) => [route, new Set(signupRows.filter((event) => (event.attribution[plane] || "unknown") === route).map(actorKey)).size])),
    ]));
    // Declaration-only signup records remain visible in the declared plane.
    for (const route of ROUTES) attribution.declared[route] = new Set(selected.filter((event) => event.stage === "signup" && (event.attribution.declared || "unknown") === route).map(actorKey)).size;
    const unknownSource = new Set(signupRows.filter((event) => !event.attribution.observed || event.attribution.observed === "unknown").map(actorKey));
    const output = {
      populationIndex, actorRelation: population.actorRelation, provenance: population.provenance,
      membership: windowMatches ? population.membership : "unknown",
      eligibleScopedActors: windowMatches && population.membership === "complete" ? memberSet.size : null,
      stages: stageViews, rates,
      retention: {
        basis: "first_useful_review_observed_in_window", horizonSeconds: query.retentionSeconds,
        observedUsefulScopedActors: firstUseful.size, notYetEligibleScopedActors: firstUseful.size - mature.size,
        numerator: retentionReason ? null : retained.size, denominator: retentionReason ? null : mature.size,
        rate: retentionReason ? null : ratio(retained.size, mature.size), reason: retentionReason,
      },
      acquisition: {
        signupSources: attribution, routeCountsMayOverlap: true,
        unknownObservedSourceShare: known("signup") ? ratio(unknownSource.size, sets.signup.size) : null,
        observedReferredSignups: referred.size,
        knownReferredSignups: known("signup") && known("referral") ? referred.size : null,
      },
      diagnostics: [...diagnostics].map(([key, count]) => { const [stage, code] = JSON.parse(key); return { stage, code, count }; }).sort((a, b) => a.stage.localeCompare(b.stage) || a.code.localeCompare(b.code)),
    };
    return { population, sets, output };
  });
  const groups = new Map();
  for (const view of privateViews) {
    const key = JSON.stringify([view.population.actorRelation, view.population.provenance]);
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(view);
  }
  const overlap = [...groups.values()].map((views) => {
    const namespaces = new Set(views.map((view) => view.population.namespace));
    const complete = views.every((view) => view.output.eligibleScopedActors !== null);
    const status = namespaces.size > 1 ? "unknown_cross_namespace" : !complete ? "unknown_membership" : "known_namespace";
    return {
      actorRelation: views[0].population.actorRelation, provenance: views[0].population.provenance,
      populationCount: views.length, namespaceCount: namespaces.size, status,
      uniqueEligibleScopedActors: status === "known_namespace" ? new Set(views.flatMap((view) => view.population.members)).size : null,
      uniqueStageScopedActors: Object.fromEntries(STAGES.map((stage) => [stage,
        status === "known_namespace" && views.every((view) => view.output.stages[stage].knownCount !== null)
          ? new Set(views.flatMap((view) => [...view.sets[stage]])).size : null,
      ])),
    };
  });
  return {
    schema: "neomorphic.contributor-measurement.result.v1", window: { ...query.window },
    populations: privateViews.map((view) => view.output), overlap,
    authority: { publicPaidBadge: false, customerIdentity: false, revenueAmounts: false, canonicalLedgerWrites: false },
  };
}
