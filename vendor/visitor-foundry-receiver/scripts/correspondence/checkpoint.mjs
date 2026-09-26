import { CHECKPOINT_SCHEMA, MAX_CHECKPOINT_CHARS } from "./constants.mjs";
import { ClientValidationError } from "./errors.mjs";
import { assertNoSecretInPublicValue, collectSecrets } from "./redact.mjs";
import { assertCorrespondenceOrigin } from "./client.mjs";

function mutationEvidence(input) {
  if (!input) return null;
  return {
    operation: input.operation,
    idempotencyKey: input.idempotencyKey,
    kind: input.kind ?? null,
    // Checkpoints never store the event body, so they cannot reconcile an unknown submit.
    retryable: false,
  };
}

export function serializeCheckpoint(input, { secrets = [] } = {}) {
  if (!input?.projectId) {
    throw new ClientValidationError({ message: "checkpoint requires projectId" });
  }
  const checkpoint = {
    schema: CHECKPOINT_SCHEMA,
    baseUrl: input.baseUrl ? assertCorrespondenceOrigin(input.baseUrl) : input.baseUrl,
    projectId: input.projectId,
    afterCursor: input.afterCursor ?? null,
    lastEventId: input.lastEventId ?? null,
    lastSequence: input.lastSequence ?? null,
    lastKind: input.lastKind ?? null,
    lastMutation: mutationEvidence(input.lastMutation),
    savedAt: input.savedAt || new Date().toISOString(),
  };
  const forbidden = collectSecrets(...secrets);
  assertNoSecretInPublicValue(checkpoint, forbidden, "checkpoint");
  const text = `${JSON.stringify(checkpoint, null, 2)}\n`;
  if (text.length > MAX_CHECKPOINT_CHARS) {
    throw new ClientValidationError({
      message: `checkpoint exceeds ${MAX_CHECKPOINT_CHARS} characters`,
    });
  }
  assertNoSecretInPublicValue(text, forbidden, "checkpoint");
  return text;
}

export function parseCheckpoint(text, { secrets = [] } = {}) {
  if (typeof text !== "string") {
    throw new ClientValidationError({ message: "checkpoint is not valid JSON" });
  }
  if (text.length > MAX_CHECKPOINT_CHARS) {
    throw new ClientValidationError({
      message: `checkpoint exceeds ${MAX_CHECKPOINT_CHARS} characters`,
    });
  }
  const forbidden = collectSecrets(...secrets);
  assertNoSecretInPublicValue(text, forbidden, "checkpoint");
  let parsed;
  try {
    parsed = JSON.parse(text);
  } catch {
    throw new ClientValidationError({ message: "checkpoint is not valid JSON" });
  }
  if (parsed == null || typeof parsed !== "object" || Array.isArray(parsed)) {
    throw new ClientValidationError({ message: "checkpoint is malformed" });
  }
  if (parsed.schema !== CHECKPOINT_SCHEMA) {
    throw new ClientValidationError({ message: "unsupported checkpoint schema" });
  }
  if (!parsed.projectId || typeof parsed.projectId !== "string") {
    throw new ClientValidationError({ message: "checkpoint is missing projectId" });
  }
  if (parsed.baseUrl != null) {
    parsed.baseUrl = assertCorrespondenceOrigin(parsed.baseUrl);
  }
  if (parsed.lastMutation && parsed.lastMutation.retryable !== false) {
    parsed.lastMutation = {
      ...parsed.lastMutation,
      retryable: false,
    };
  }
  assertNoSecretInPublicValue(parsed, forbidden, "checkpoint");
  return parsed;
}

export function checkpointFromEventResult({ baseUrl, projectId, event, project, idempotencyKey, nextCursor }) {
  return serializeCheckpoint({
    baseUrl,
    projectId,
    afterCursor: nextCursor ?? null,
    lastEventId: event?.id ?? null,
    lastSequence: event?.sequence ?? null,
    lastKind: event?.kind ?? null,
    lastMutation: {
      operation: "postEvent",
      idempotencyKey,
      kind: event?.kind ?? null,
    },
    savedAt: project?.updatedAt,
  });
}
