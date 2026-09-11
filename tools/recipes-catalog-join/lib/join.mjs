import { PUBLISHED } from "./paths.mjs";
import { adjacentCatalogIds } from "./families.mjs";
import {
  defaultHashTerms,
  loadCatalogFromFile,
  loadFamiliesFromFiles,
  loadRecipeSpecsFromDir,
  loadRunnerRecipes,
  loadRouter,
} from "./adapters.mjs";
import {
  assertExecutionUnauthorized,
  assertPaidFalse,
  refuseInconsistentSource,
} from "./refuse.mjs";

export const SCHEMA = "samedaydesk.recipes-catalog-join.v1";

const DEFAULT_ROUTE_JOBS = Object.freeze([
  { type: "page_change_evidence", source: "published-fixture", constraints: ["no_payment", "offline_preferred"] },
  { type: "bounded_html_observation", source: "router-api", constraints: [] },
  { type: "complete_issue_discussion", source: "router-api", constraints: ["no_payment"] },
  { type: "supplied_issue_brief", source: "router-api", constraints: ["offline_only"] },
]);

function unique(values) {
  return [...new Set(values)];
}

function recipeMerchantAdjacency(recipe, routing) {
  const contracts = (recipe.acceptedContracts || []).join(" ").toLowerCase();
  const notes = String(recipe.notes || "");
  const adjacent = [];
  if (contracts.includes("page-change") || /page.change/.test(notes)) {
    const page = routing.find((r) => r.jobType === "page_change_evidence");
    if (page?.selectedOfferId) {
      adjacent.push({
        kind: "merchant-offer",
        offerId: page.selectedOfferId,
        jobType: "page_change_evidence",
        inCatalog: false,
      });
    }
  }
  if (contracts.includes("extract-batch")) {
    adjacent.push({
      kind: "merchant-contract",
      contract: "samedaydesk.extract-batch.v0",
      paidRouteInvoked: false,
      note: "Recipes reuse the extract-batch contract. They do not call the paid extract route.",
    });
  }
  if (recipe.id === "buyer-setup-trace" || /unpaid 402/.test(contracts) || recipe.claims?.liveFreeInspectionOnly) {
    adjacent.push({
      kind: "unpaid-inspection",
      paymentSigned: false,
      note: "Stops at unpaid 402. Not a catalog job and not settlement.",
    });
  }
  return adjacent;
}

function classifyEvidence(parts) {
  const classes = unique(parts.filter(Boolean));
  if (classes.length === 1) return classes[0];
  if (classes.length === 0) return "unknown";
  return "mixed";
}

function requireDigest(value, label) {
  if (typeof value !== "string" || !/^[0-9a-f]{64}$/.test(value)) {
    throw new Error(`${label}_source_bytes_unbound`);
  }
  return value;
}

export async function joinRecipesCatalog(options = {}) {
  const catalogLoad = options.loadCatalog
    ? await options.loadCatalog()
    : await loadCatalogFromFile(options.catalogPath);
  const specLoad = options.loadRecipeSpecs
    ? await options.loadRecipeSpecs()
    : loadRecipeSpecsFromDir(options.recipeSpecsDir);
  const runnerLoad = options.loadRunnerRecipes
    ? await options.loadRunnerRecipes()
    : await loadRunnerRecipes(options.recipeRunner);
  const familyLoad = options.loadFamilies
    ? await options.loadFamilies()
    : loadFamiliesFromFiles(options);
  const router = options.router || (await loadRouter(options.routerPath));
  const hashTerms = options.hashTerms || defaultHashTerms();

  const catalog = catalogLoad.catalog;
  const catalogDigest = requireDigest(catalogLoad.sha256, "catalog");
  const catalogJobs = catalog.jobs.map((job) => ({
    id: job.id,
    title: job.title,
    summary: job.summary,
    classification: "catalog",
    purchaseAuthority: catalog.runtime?.purchaseAuthority === true,
    schedulerDaemon: catalog.runtime?.schedulerDaemon === true,
  }));
  const catalogJobIds = catalogJobs.map((j) => j.id);
  const catalogIdSet = new Set(catalogJobIds);
  if (catalogJobIds.length !== catalogIdSet.size) {
    refuseInconsistentSource({
      message: "catalog source has duplicate job ids",
      surface: "catalog",
      detail: { jobIds: catalogJobIds },
    });
  }

  const specDigests = Object.fromEntries(
    specLoad.specs.map((s) => [s.spec.recipeId, requireDigest(s.sha256, `recipe:${s.spec.recipeId}`)]),
  );
  const specIdList = specLoad.specs.map((s) => s.spec.recipeId);
  if (new Set(specIdList).size !== specIdList.length) {
    refuseInconsistentSource({
      message: "recipe source has duplicate spec ids",
      surface: "recipes",
      detail: { specIds: specIdList },
    });
  }

  const runnerById = new Map((runnerLoad.recipes || []).map((meta) => [meta.recipeId, meta]));
  const specIds = new Set(specIdList);
  const recipeIds = unique([
    ...specLoad.specs.map((s) => s.spec.recipeId),
    ...[...runnerById.keys()],
  ]);

  const recipes = recipeIds.map((id) => {
    const specEntry = specLoad.specs.find((s) => s.spec.recipeId === id);
    const meta = runnerById.get(id) || {};
    const inCatalog = catalogIdSet.has(id);
    const row = {
      id,
      classification: inCatalog ? "catalog" : "recipe-not-catalog",
      hasSpec: specIds.has(id),
      listedInRunner: runnerById.has(id),
      acceptedContracts: meta.acceptedContracts || [],
      claims: specEntry?.spec.claims || null,
      notes: specEntry?.spec.notes || null,
      inCatalog,
    };
    row.adjacentCatalog = adjacentCatalogIds(id, "", catalog.jobs);
    return row;
  });

  const families = familyLoad.families.map((family) => {
    const inCatalog = catalogIdSet.has(family.id);
    const adjacentCatalog = adjacentCatalogIds(
      family.id,
      `${family.recipeSamples} ${family.honesty}`,
      catalog.jobs,
    );
    return {
      id: family.id,
      classification: inCatalog ? "catalog" : "adjacent-not-catalog",
      inCatalog,
      recipeSamples: family.recipeSamples,
      honesty: family.honesty,
      adjacentCatalog,
      inDiscovery: familyLoad.discoveryIds.includes(family.id),
    };
  });

  const routeInputs = options.routeJobs || DEFAULT_ROUTE_JOBS;
  const routing = [];
  for (const job of routeInputs) {
    const result =
      job.type === "page_change_evidence" && !options.skipPublishedPageChangeFixture
        ? router.routeJobFromFile(PUBLISHED.pageChangeJob)
        : router.routeJob({
            type: job.type,
            jobId: job.jobId || `join-${job.type}`,
            constraints: job.constraints || [],
          });
    assertExecutionUnauthorized(result.executionAuthorized);
    assertPaidFalse(result.paid);
    if (result.paymentRequired === true && result.paid === true) {
      throw new Error("router_paid_true_while_paymentRequired");
    }
    const offerId = result.selected?.offerId || null;
    const inCatalog = offerId ? catalogIdSet.has(offerId) : false;
    let classification = "merchant-not-catalog";
    if (inCatalog) classification = "catalog";
    else if (!result.ok || !offerId) classification = "unrouted-not-catalog";
    routing.push({
      jobType: job.type,
      source: job.source || "router-api",
      ok: result.ok,
      selectedOfferId: offerId,
      product: result.selected?.product || null,
      hosting: result.selected?.hosting || null,
      payment: result.selected?.payment || null,
      paymentRequired: result.paymentRequired === true,
      paid: result.paid === true,
      executionAuthorized: result.executionAuthorized,
      criteriaAssessment: result.criteriaAssessment || null,
      classification,
      inCatalog,
    });
  }

  for (const recipe of recipes) {
    recipe.adjacentMerchant = recipeMerchantAdjacency(recipe, routing);
  }

  const matches = [];
  for (const id of catalogIdSet) {
    if (recipeIds.includes(id)) {
      matches.push({ id, surfaces: ["catalog", "recipe"], rule: "exact-id-equality" });
    }
    if (families.some((f) => f.id === id)) {
      matches.push({ id, surfaces: ["catalog", "family"], rule: "exact-id-equality" });
    }
  }

  const adjacentNotCatalog = [
    ...recipes
      .filter((r) => !r.inCatalog)
      .map((r) => ({
        id: r.id,
        surface: "recipe",
        classification: r.classification,
        adjacentCatalog: r.adjacentCatalog,
        adjacentMerchant: r.adjacentMerchant,
      })),
    ...families
      .filter((f) => !f.inCatalog)
      .map((f) => ({
        id: f.id,
        surface: "family",
        classification: "adjacent-not-catalog",
        adjacentCatalog: f.adjacentCatalog,
      })),
    ...routing
      .filter((r) => r.selectedOfferId && !r.inCatalog)
      .map((r) => ({
        id: r.selectedOfferId,
        surface: "offer-routing",
        jobType: r.jobType,
        classification: "merchant-not-catalog",
        product: r.product,
      })),
  ];

  const pageChange = routing.find((r) => r.jobType === "page_change_evidence");
  const paidObservation = routing.find((r) => r.jobType === "bounded_html_observation");

  const forbiddenPaymentCrossings = [
    {
      id: "catalog_purchaseAuthority_false",
      status: catalog.runtime?.purchaseAuthority === true ? "crossed" : "held",
      purchaseAuthority: catalog.runtime?.purchaseAuthority === true,
    },
    {
      id: "routing_paymentRequired_is_not_paid",
      status: routing.some((r) => r.paid) ? "crossed" : "held",
      examples: routing
        .filter((r) => r.paymentRequired)
        .map((r) => ({
          jobType: r.jobType,
          offerId: r.selectedOfferId,
          paymentRequired: true,
          paid: r.paid,
          executionAuthorized: r.executionAuthorized,
        })),
    },
    {
      id: "recipe_id_is_not_catalog_job_id",
      status: recipes.some((r) => r.inCatalog) ? "crossed" : "held",
      recipeIds: recipes.map((r) => r.id),
    },
    {
      id: "page_change_evidence_is_merchant_not_catalog",
      status:
        pageChange?.selectedOfferId === "sdd.page_change_offline" && pageChange.inCatalog === false
          ? "held"
          : "unexpected",
      offerId: pageChange?.selectedOfferId || null,
      product: pageChange?.product || null,
    },
    {
      id: "join_does_not_edit_recipes_or_catalog",
      status: "held",
    },
  ];

  if (paidObservation) {
    forbiddenPaymentCrossings.push({
      id: "bounded_html_observation_paymentRequired_unpaid",
      status: paidObservation.paymentRequired && paidObservation.paid === false ? "held" : "unexpected",
      offerId: paidObservation.selectedOfferId,
      paymentRequired: paidObservation.paymentRequired,
      paid: paidObservation.paid,
      executionAuthorized: paidObservation.executionAuthorized,
    });
  }

  const familyDocIds = familyLoad.families.map((f) => f.id).sort();
  const discoveryIds = [...familyLoad.discoveryIds].sort();
  const familyIdAgreement = familyDocIds.join(",") === discoveryIds.join(",");
  if (!familyIdAgreement) {
    refuseInconsistentSource({
      message: "family document ids disagree with discovery families",
      surface: "families",
      detail: { familyDocIds, discoveryIds },
    });
  }

  return {
    schema: SCHEMA,
    ok: true,
    outcome: "joined",
    executionAuthorized: false,
    paid: false,
    paymentRequiredFromRoutingIsPaid: false,
    evidenceClass: classifyEvidence([
      catalogLoad.evidenceClass,
      specLoad.evidenceClass,
      runnerLoad.evidenceClass,
      familyLoad.evidenceClass,
    ]),
    source: {
      catalogPath: catalogLoad.path || PUBLISHED.catalog,
      recipeSpecs: specLoad.specs.map((s) => s.fileName),
      familiesDoc: familyLoad.familiesDoc || PUBLISHED.familiesDoc,
      familyDiscovery: familyLoad.familyDiscovery || PUBLISHED.familyDiscovery,
      catalogSha256: catalogDigest,
      recipeSpecSha256: specDigests,
      familiesSha256: familyLoad.familiesSha256 || null,
      discoverySha256: familyLoad.discoverySha256 || null,
      namedInputs: {
        catalog: {
          path: catalogLoad.path || null,
          sha256: catalogDigest,
          evidenceClass: catalogLoad.evidenceClass || null,
        },
        recipes: {
          specFiles: specLoad.specs.map((s) => s.fileName),
          sha256: specDigests,
          evidenceClass: specLoad.evidenceClass || null,
        },
      },
      loaders: {
        catalog: catalogLoad.evidenceClass || null,
        recipeSpecs: specLoad.evidenceClass || null,
        runner: runnerLoad.evidenceClass || null,
        families: familyLoad.evidenceClass || null,
        router: "local-runtime-fs",
      },
    },
    catalog: {
      schema: catalog.schema,
      purchaseAuthority: catalog.runtime?.purchaseAuthority === true,
      schedulerDaemon: catalog.runtime?.schedulerDaemon === true,
      jobIds: catalogJobs.map((j) => j.id),
      jobs: catalogJobs,
    },
    recipes,
    families,
    familyIdAgreement,
    routing,
    matches,
    adjacentNotCatalog,
    forbiddenPaymentCrossings,
    hashTerms,
    callerJourney: {
      feedAgenda: catalogJobs.find((j) => j.id === "feed-agenda") || null,
      sourceChangeAlert: recipes.find((r) => r.id === "source-change-alert") || null,
      pageChangeEvidence: pageChange || null,
    },
  };
}

export function reportToJson(report) {
  return `${JSON.stringify(report, null, 2)}\n`;
}
