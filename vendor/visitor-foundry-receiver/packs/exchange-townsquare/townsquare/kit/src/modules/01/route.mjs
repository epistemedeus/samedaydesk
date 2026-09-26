/**
 * routeQuestionToCapabilities — question-first router with matches / nonMatches / unknowns.
 */
import {
  CONFIDENCE,
  CONSUMER_INSTRUCTIONS,
  ERROR_CODES,
  PACKAGE_ID,
  QUESTION_TEXT_ECHO_MAX,
  REUSE_FROM,
  ROUTE_STATUS,
  SCHEMA,
  SIGNAL_SOURCE,
} from "./constants.mjs";
import {
  normalizeQuestion,
  normalizeTask,
  normalizeToken,
  routeError,
  tokenizeText,
  unwrapInput,
  validateCapabilityEntry,
  wholeWordIn,
} from "./validate.mjs";

function echoText(text) {
  const t = String(text);
  if (t.length <= QUESTION_TEXT_ECHO_MAX) return t;
  return `${t.slice(0, QUESTION_TEXT_ECHO_MAX - 1)}…`;
}

function deriveRoutingSignal(question, capabilities) {
  const notes = [];

  if (question.neededOutcomes.length > 0) {
    const outcomes = [...new Set(question.neededOutcomes.map(normalizeToken))];
    notes.push("using explicit question.neededOutcomes");
    return { source: SIGNAL_SOURCE.NEEDED_OUTCOMES, outcomes, notes };
  }

  if (question.tags.length > 0) {
    const outcomes = [...new Set(question.tags.map(normalizeToken))];
    notes.push("fallback to question.tags as routing outcomes");
    return { source: SIGNAL_SOURCE.TAGS, outcomes, notes };
  }

  const tokens = tokenizeText(question.text);
  const candidates = [];
  for (const token of tokens) {
    let hit = false;
    for (const cap of capabilities) {
      if (!cap.ok) continue;
      const haystacks = [...cap.capability.outcomes, cap.capability.title];
      if (haystacks.some((h) => wholeWordIn(h, token))) {
        hit = true;
        break;
      }
    }
    if (hit && !candidates.includes(token)) candidates.push(token);
  }

  if (candidates.length === 0) {
    notes.push("no neededOutcomes, no tags, and text tokens yield no catalog overlap");
    return { source: SIGNAL_SOURCE.NONE, outcomes: [], notes };
  }

  notes.push("derived routing outcomes from question.text tokens overlapping capability outcomes/titles");
  return { source: SIGNAL_SOURCE.TEXT_TOKENS, outcomes: candidates, notes };
}

function computeOverlap(routingOutcomes, capability, signalSource) {
  const capOutcomes = capability.outcomes.map(normalizeToken);
  const capTags = (capability.tags || []).map(normalizeToken);
  const overlap = [];

  for (const outcome of routingOutcomes) {
    if (capOutcomes.includes(outcome)) {
      overlap.push(outcome);
      continue;
    }
    // When using tags as routing signal, also allow exact tag overlap on capability.tags
    if (signalSource === SIGNAL_SOURCE.TAGS && capTags.includes(outcome)) {
      overlap.push(outcome);
    }
  }
  return [...new Set(overlap)];
}

/**
 * @param {object} input — { question, capabilities, task? } or top-level question fields + capabilities
 * @param {{ now?: Date|string, demo?: boolean }} [options]
 */
export function routeQuestionToCapabilities(input, options = {}) {
  const unwrapped = unwrapInput(input);

  if (!Array.isArray(unwrapped.capabilities)) {
    throw routeError(ERROR_CODES.INVALID_INPUT, "capabilities must be an array");
  }

  const question = normalizeQuestion(unwrapped.question);
  normalizeTask(unwrapped.task, question.taskId);

  const validated = unwrapped.capabilities.map((raw, i) => validateCapabilityEntry(raw, i));
  const routingSignal = deriveRoutingSignal(question, validated);

  const matches = [];
  const nonMatches = [];
  const unknowns = [];
  const missingInputs = [];

  const now =
    options.now instanceof Date
      ? options.now.toISOString()
      : typeof options.now === "string"
        ? options.now
        : new Date().toISOString();

  if (routingSignal.source === SIGNAL_SOURCE.NONE) {
    for (const entry of validated) {
      if (!entry.ok) {
        unknowns.push({
          capabilityId: entry.capabilityId,
          title: entry.title,
          reasons: ["malformed_capability", "insufficient_routing_signal"],
        });
        continue;
      }
      unknowns.push({
        capabilityId: entry.capability.id,
        title: entry.capability.title,
        reasons: ["insufficient_routing_signal"],
      });
    }
    if (unwrapped.capabilities.length === 0) {
      missingInputs.push("capabilities");
      unknowns.push({
        capabilityId: null,
        reasons: ["insufficient_routing_signal", "empty_capabilities"],
      });
    }

    return buildResult({
      status: ROUTE_STATUS.UNKNOWN,
      now,
      question,
      routingSignal,
      matches,
      nonMatches,
      unknowns,
      missingInputs,
      demo: question.demo === true || options.demo === true || input?.demo === true,
    });
  }

  for (const entry of validated) {
    if (!entry.ok) {
      unknowns.push({
        capabilityId: entry.capabilityId,
        title: entry.title,
        reasons: ["malformed_capability"],
      });
      continue;
    }

    const cap = entry.capability;
    const overlap = computeOverlap(routingSignal.outcomes, cap, routingSignal.source);

    if (overlap.length > 0) {
      const everyCovered = routingSignal.outcomes.every((o) => overlap.includes(o));
      const confidence = everyCovered ? CONFIDENCE.EXACT : CONFIDENCE.PARTIAL;
      const reasons = [
        ...overlap.map((o) => `outcome_overlap:${o}`),
        `task_linked:taskId=${question.taskId}`,
        `signal:${routingSignal.source}`,
        `confidence:${confidence}`,
      ];
      matches.push({
        capabilityId: cap.id,
        title: cap.title,
        overlap,
        reasons,
        confidence,
      });
    } else {
      nonMatches.push({
        capabilityId: cap.id,
        title: cap.title,
        reasons: ["no_outcome_overlap", `task_linked:taskId=${question.taskId}`],
      });
    }
  }

  // Empty catalog + usable signal → routed with empty matches (documented preference)
  let status;
  if (unknowns.length > 0 && matches.length > 0) {
    status = ROUTE_STATUS.PARTIAL;
  } else if (unknowns.length > 0 && matches.length === 0) {
    status = ROUTE_STATUS.PARTIAL;
  } else {
    status = ROUTE_STATUS.ROUTED;
  }

  // Sort matches by overlap desc then id for determinism
  matches.sort((a, b) => {
    if (b.overlap.length !== a.overlap.length) return b.overlap.length - a.overlap.length;
    return String(a.capabilityId).localeCompare(String(b.capabilityId));
  });
  nonMatches.sort((a, b) => String(a.capabilityId).localeCompare(String(b.capabilityId)));

  return buildResult({
    status,
    now,
    question,
    routingSignal,
    matches,
    nonMatches,
    unknowns,
    missingInputs,
    demo: question.demo === true || options.demo === true || input?.demo === true,
  });
}

function buildResult({
  status,
  now,
  question,
  routingSignal,
  matches,
  nonMatches,
  unknowns,
  missingInputs,
  demo,
}) {
  return {
    schema: SCHEMA,
    packageId: PACKAGE_ID,
    status,
    generatedAt: now,
    questionId: question.id,
    taskId: question.taskId,
    questionText: echoText(question.text),
    routingSignal,
    matches,
    nonMatches,
    unknowns,
    missingInputs,
    consumerInstructions: CONSUMER_INSTRUCTIONS,
    reuseFrom: {
      townSquareQuestionShape: REUSE_FROM.townSquareQuestionShape,
      capabilityOutcomeOverlap: REUSE_FROM.capabilityOutcomeOverlap,
      notEquivalentTo: [...REUSE_FROM.notEquivalentTo],
    },
    demo: Boolean(demo),
  };
}

export default routeQuestionToCapabilities;
