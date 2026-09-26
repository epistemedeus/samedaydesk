import { FORBIDDEN_FIELDS, PACKAGE_ID, SCHEMA, CONSUMER_INSTRUCTIONS } from "./constants.mjs";
import { routeQuestionToCapabilities } from "./modules/01/index.mjs";
import { extractProposedActions } from "./modules/02/index.mjs";
import { buildContradictionPreservingSummary } from "./modules/03/index.mjs";
import { queryTaskSubscription } from "./modules/04/index.mjs";
import { buildAnswerCards } from "./modules/05/index.mjs";
import { exportConversationContext } from "./modules/06/index.mjs";
import { applyConversationWriteControls } from "./modules/07/index.mjs";

function isPlainObject(v) {
  return v !== null && typeof v === "object" && !Array.isArray(v);
}

function assertNoForbidden(obj, path = "$") {
  if (!isPlainObject(obj)) return;
  for (const key of FORBIDDEN_FIELDS) {
    if (Object.prototype.hasOwnProperty.call(obj, key)) {
      const err = new Error(`forbidden field ${path}.${key}`);
      err.code = "forbidden_claim";
      throw err;
    }
  }
}

/**
 * Integrate modules 01–07: first public conversation → scoped task.
 */
export function runConversationToTask(input, options = {}) {
  if (!isPlainObject(input)) {
    const err = new Error("input must be an object");
    err.code = "invalid_input";
    throw err;
  }
  assertNoForbidden(input);
  if (input.demo !== true) {
    const err = new Error("kit requires demo:true (synthetic only)");
    err.code = "synthetic_only";
    throw err;
  }

  const now = options.now || "2026-09-10T12:40:00.000Z";
  const threadId = input.threadId || "thread-unspecified";
  const suppliedTaskIds = [
    input.taskId,
    input.question?.taskId,
    input.task?.id,
  ]
    .filter((id) => typeof id === "string" && id.trim())
    .map((id) => id.trim());
  const uniqueTaskIds = [...new Set(suppliedTaskIds)];
  if (uniqueTaskIds.length > 1) {
    const err = new Error(`conflicting task identifiers: ${uniqueTaskIds.join(", ")}`);
    err.code = "source_task_mismatch";
    throw err;
  }
  const taskId = uniqueTaskIds[0] || input.taskId || input.question?.taskId;
  if (!taskId) {
    const err = new Error("taskId required (top-level or question.taskId)");
    err.code = "missing_requirement";
    throw err;
  }
  const messages = Array.isArray(input.messages) ? input.messages : [];
  const stages = [];

  // 06 export
  const contextExport = exportConversationContext(
    { threadId, taskId, messages, demo: true },
    { now, demo: true },
  );
  stages.push({ packageId: "R2-TOWNSQUARE-06", status: contextExport.status, summary: `included=${contextExport.included?.length || 0}` });

  // 01 route
  const route = routeQuestionToCapabilities(
    { question: input.question, capabilities: input.capabilities || [], task: input.task, demo: true },
    { now },
  );
  stages.push({ packageId: "R2-TOWNSQUARE-01", status: route.status, summary: `matches=${route.matches?.length || 0}` });

  // 05 answer cards from assistant-ish message + match titles
  const assistant = [...messages].reverse().find((m) => m.role === "assistant") || messages[messages.length - 1];
  const claimText = assistant?.text || input.question?.text || "Synthetic claim unavailable";
  const topMatch = route.matches?.[0];
  const answers = [
    {
      id: "card-from-conversation",
      claim: claimText.slice(0, 500),
      observedAt: now,
      applicability: "Synthetic first-public-conversation demo only",
      source: topMatch
        ? { id: topMatch.capabilityId, label: topMatch.title || topMatch.capabilityId, uri: null, accessible: true }
        : { missing: true },
      questionId: input.question?.id,
      taskId,
      demo: true,
    },
  ];
  const cards = buildAnswerCards({ answers, demo: true }, { now, demo: true });
  stages.push({ packageId: "R2-TOWNSQUARE-05", status: cards.status, summary: `cards=${cards.cards?.length || 0}` });

  // 02 actions
  const actions = extractProposedActions(
    { answer: { id: "ans-from-conversation", text: claimText, taskId, questionId: input.question?.id, demo: true }, evidence: [], demo: true },
    { now, demo: true },
  );
  stages.push({ packageId: "R2-TOWNSQUARE-02", status: actions.status, summary: `actions=${actions.actions?.length || 0}` });

  // 03 contradiction summary (synthetic conflict optional)
  const summary = buildContradictionPreservingSummary(
    {
      topic: "fictional first conversation claims",
      taskId,
      demo: true,
      claims: [
        { id: "claim-a", text: "Prefer page-change watcher", stance: "page_change", conflictGroup: "cap-pick", sourceId: "card-from-conversation", observedAt: now },
        { id: "claim-b", text: "Prefer unrelated echo fixture", stance: "echo", conflictGroup: "cap-pick", sourceId: "synthetic", observedAt: now },
      ],
      corrections: [
        { id: "corr-1", text: "Correction: page-change watcher remains the demo choice", supersedesId: "claim-b", observedAt: now },
      ],
    },
    { now, demo: true },
  );
  stages.push({ packageId: "R2-TOWNSQUARE-03", status: summary.status, summary: `conflicts=${summary.conflicts?.length || 0}` });

  // 07 write controls — preserve correction
  const controls = applyConversationWriteControls(
    {
      threadId,
      demo: true,
      priorWrites: messages.map((m, i) => ({ id: m.id || `prior-${i}`, kind: "message", text: m.text || "", createdAt: m.createdAt || now })),
      proposedWrites: [
        { id: "corr-write-1", kind: "correction", text: "FICTIONAL CORRECTION: Reuse the outstanding key for the exact same body until reconciled.", correctsId: messages[0]?.id || "m1", createdAt: now },
        { id: "replay-1", kind: "replay", text: messages[0]?.text || "replay", replayOfId: messages[0]?.id || "m1", createdAt: now },
      ],
    },
    { now, demo: true },
  );
  stages.push({ packageId: "R2-TOWNSQUARE-07", status: controls.status, summary: `admitted=${controls.admittedCount}` });

  // 04 subscription sample (thin)
  const sub = queryTaskSubscription(
    {
      subscription: { capabilities: route.matches?.map((m) => m.overlap?.[0]).filter(Boolean) || ["page-change"], unreadOnly: true },
      lastReadByTask: { [taskId]: 0 },
      updates: [
        { id: "upd-1", taskId, revision: 1, kind: "question_posted", capabilityIds: ["page-change"], taskDeadline: "2026-09-11T00:00:00.000Z", summary: "Synthetic update", createdAt: now, demo: true },
      ],
      demo: true,
    },
    { now },
  );
  stages.push({ packageId: "R2-TOWNSQUARE-04", status: sub.status, summary: `matched=${sub.matchedCount}` });

  const task = {
    id: taskId,
    title: input.task?.title || `Scoped task from ${threadId}`,
    summary: input.task?.summary || "Synthetic scoped task produced from first public conversation kit.",
    scope: "townsquare",
    capabilityIds: (route.matches || []).map((m) => m.capabilityId),
    adoptionRequired: true,
    sources: (cards.cards || []).map((c) => ({ id: c.id, sourceStatus: c.sourceStatus, claim: c.claim })),
    proposedActions: (actions.actions || []).map((a) => ({ id: a.id, statement: a.statement, adoption: a.adoption, execute: a.execute })),
    contextExport: {
      includedCount: contextExport.included?.length || 0,
      truncated: contextExport.truncated === true,
      instructionsAreData: contextExport.instructionsAreData === true,
    },
    writeControls: {
      admittedCount: controls.admittedCount,
      rejectedCount: controls.rejectedCount,
      preservedCorrections: controls.preservedCorrections || [],
    },
    contradictionPreserved: summary.consensusFlattened === false,
  };

  return {
    schema: SCHEMA,
    packageId: PACKAGE_ID,
    status: "ready",
    demo: true,
    fabricatedUsers: false,
    inventedRevenue: false,
    execute: false,
    generatedAt: now,
    threadId,
    task,
    stages,
    consumerInstructions: CONSUMER_INSTRUCTIONS,
    modulesIntegrated: ["01", "02", "03", "04", "05", "06", "07"],
  };
}
