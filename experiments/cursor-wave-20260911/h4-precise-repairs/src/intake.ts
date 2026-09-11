import { DEFAULT_ROLLBACK, SHA256_RE, SUBJECT_JOB_IDS } from "./constants.ts";
import { FIXTURE_BECOMES_SALE, MISSING_SUPPLIED_INPUT } from "./failures.ts";
import { loadFixture } from "./load-fixture.ts";
import { diagnosePaymentPayload } from "./diagnostics.ts";
import { requireSubject } from "./subjects.ts";
import type { RepairIntake, RepairIntakeDraft, SubjectJobId } from "./types.ts";

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function nonEmptyString(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

export function suppliedInputOk(
  value: unknown,
): value is RepairIntake["suppliedInput"] {
  if (!isPlainObject(value)) return false;
  const digest = value.digestSha256;
  const mediaType = value.mediaType;
  const bytes = value.bytes;
  if (typeof digest !== "string" || !SHA256_RE.test(digest)) return false;
  if (typeof mediaType !== "string" || mediaType.trim() === "") return false;
  if (typeof bytes !== "number" || !Number.isInteger(bytes) || bytes < 1) return false;
  return true;
}

function flagList(draft: RepairIntakeDraft, extra: string[] = []): string[] {
  const fromDraft = Array.isArray(draft.flags)
    ? draft.flags.filter((f): f is string => typeof f === "string")
    : [];
  const labels = Array.isArray(draft.labels)
    ? draft.labels.filter((f): f is string => typeof f === "string")
    : [];
  const exampleFlag = typeof draft.exampleFlag === "string" ? [draft.exampleFlag] : [];
  return [...fromDraft, ...labels, ...exampleFlag, ...extra];
}

export function isFixtureSampleOrExample(
  draft: RepairIntakeDraft,
  extraFlags: string[] = [],
): boolean {
  if (draft.provenance === "fixture") return true;
  if (draft.sourceKind === "fixture" || draft.sourceKind === "sample" || draft.sourceKind === "example") {
    return true;
  }
  if (draft.fromFixturePath) return true;
  const hay = [
    draft.provenance,
    draft.sourceKind,
    draft.exampleFlag,
    draft.defectId,
    ...flagList(draft, extraFlags),
  ]
    .filter((v) => typeof v === "string")
    .join(" ")
    .toLowerCase();
  return (
    hay.includes("sample") ||
    hay.includes("--example") ||
    hay.includes("fixture")
  );
}

function hasSaleOrCustomerPromotion(draft: RepairIntakeDraft): boolean {
  if (draft.paid === true || draft.settled === true) return true;
  if (draft.provenance === "customer") return true;
  if (typeof draft.saleState === "string" && draft.saleState !== "not_a_sale") return true;
  const flags = flagList(draft).map((f) => f.toLowerCase());
  return flags.includes("--paid") || flags.includes("--settled") || flags.includes("--customer");
}

export type IntakeRejection = {
  ok: false;
  rejected: true;
  completed: false;
  failure: typeof FIXTURE_BECOMES_SALE | typeof MISSING_SUPPLIED_INPUT;
};

export type IntakeAccepted = {
  ok: true;
  rejected: false;
  completed: false;
  intake: RepairIntake;
  subjectJobId: SubjectJobId;
  paidWrapper: false;
};

export type IntakeResult = IntakeAccepted | IntakeRejection;

export function acceptRepairIntake(
  draft: RepairIntakeDraft,
  extraFlags: string[] = [],
): IntakeResult {
  const fixtureLike = isFixtureSampleOrExample(draft, extraFlags);
  if (fixtureLike && hasSaleOrCustomerPromotion(draft)) {
    return { ok: false, rejected: true, completed: false, failure: FIXTURE_BECOMES_SALE };
  }
  if (draft.paid === true || draft.settled === true) {
    return { ok: false, rejected: true, completed: false, failure: FIXTURE_BECOMES_SALE };
  }
  if (typeof draft.saleState === "string" && draft.saleState !== "not_a_sale") {
    return { ok: false, rejected: true, completed: false, failure: FIXTURE_BECOMES_SALE };
  }
  if (!suppliedInputOk(draft.suppliedInput)) {
    return { ok: false, rejected: true, completed: false, failure: MISSING_SUPPLIED_INPUT };
  }
  if (!nonEmptyString(draft.defectId) || !nonEmptyString(draft.scope)
    || !nonEmptyString(draft.acceptanceTest) || !nonEmptyString(draft.rollback)) {
    return { ok: false, rejected: true, completed: false, failure: MISSING_SUPPLIED_INPUT };
  }

  let provenance: RepairIntake["provenance"];
  if (draft.provenance === "test" && !fixtureLike) {
    provenance = "test";
  } else if (draft.provenance === "customer" && !fixtureLike) {
    provenance = "customer";
  } else {
    provenance = "fixture";
  }

  const subjectJobId = draft.subjectJobId
    ? requireSubject(draft.subjectJobId)
    : "listing-repair-packet";

  const intake: RepairIntake = {
    defectId: draft.defectId.trim(),
    suppliedInput: {
      digestSha256: draft.suppliedInput.digestSha256.toLowerCase(),
      mediaType: draft.suppliedInput.mediaType.trim(),
      bytes: draft.suppliedInput.bytes,
    },
    scope: draft.scope.trim(),
    acceptanceTest: draft.acceptanceTest.trim(),
    rollback: draft.rollback.trim(),
    provenance,
    saleState: "not_a_sale",
  };

  return {
    ok: true,
    rejected: false,
    completed: false,
    intake,
    subjectJobId,
    paidWrapper: false,
  };
}

export type CompleteResult =
  | { ok: true; completed: true; intake: RepairIntake; saleState: "not_a_sale" }
  | IntakeRejection;

export function completeRepair(value: unknown): CompleteResult {
  if (!isPlainObject(value)) {
    return { ok: false, rejected: true, completed: false, failure: MISSING_SUPPLIED_INPUT };
  }
  const supplied = isPlainObject(value.suppliedInput)
    ? value.suppliedInput
    : value.intake && isPlainObject(value.intake)
      ? value.intake.suppliedInput
      : undefined;
  const record = isPlainObject(value.intake) ? value.intake : value;
  if (!suppliedInputOk(supplied) && !suppliedInputOk(record.suppliedInput)) {
    return { ok: false, rejected: true, completed: false, failure: MISSING_SUPPLIED_INPUT };
  }
  const accepted = acceptRepairIntake(record);
  if (!accepted.ok) return accepted;
  return {
    ok: true,
    completed: true,
    intake: accepted.intake,
    saleState: "not_a_sale",
  };
}

function inferDefectId(diagnostics: ReturnType<typeof diagnosePaymentPayload>): string {
  const resource = diagnostics.diagnostics.find((d) => d.field === "resource");
  const bazaar = diagnostics.diagnostics.find((d) => d.field === "extensions.bazaar");
  if (resource?.drift === "missing_hint") return "g06-missing-resource-hint";
  if (bazaar?.drift === "missing_hint") return "g06-missing-bazaar-hint";
  if (resource?.drift === "mismatch" || bazaar?.drift === "mismatch") {
    return "g06-indexing-hint-mismatch";
  }
  return "g06-metadata-presence";
}

function defaultScope(subjectJobId: SubjectJobId): string {
  return `Presence-only repair proposal for useful-jobs subject ${subjectJobId}. Unsigned OpenAPI/Bazaar indexing hints vs intact payload signature. Not a paid wrapper and not a hosted job.`;
}

function defaultAcceptance(
  diagnostics: ReturnType<typeof diagnosePaymentPayload>,
): string {
  const payload = diagnostics.diagnostics.find((d) => d.field === "payload");
  const resource = diagnostics.diagnostics.find((d) => d.field === "resource");
  return [
    "payload.signed === true",
    "resource.signed === false",
    "extensions.bazaar.signed === false",
    `payload.present === ${Boolean(payload?.present)}`,
    `resource.drift === ${resource?.drift ?? "unknown"}`,
    "paymentRetried === false",
    "saleState === not_a_sale",
  ].join("; ");
}

export function intakeFromFixture(
  filePath: string,
  options: {
    subjectJobId?: SubjectJobId;
    flags?: string[];
    paid?: boolean;
    settled?: boolean;
    provenance?: RepairIntake["provenance"];
    defectId?: string;
  } = {},
): IntakeResult {
  const loaded = loadFixture(filePath);
  const diagnosed = diagnosePaymentPayload(loaded.paymentPayload, {
    declared: loaded.declared,
    requirements: loaded.requirements,
    siblingPaymentRequirements: loaded.json.paymentRequirements,
  });
  const subjectJobId = options.subjectJobId
    ? requireSubject(options.subjectJobId)
    : "listing-repair-packet";
  const draft: RepairIntakeDraft = {
    defectId: options.defectId || inferDefectId(diagnosed),
    suppliedInput: {
      digestSha256: loaded.digestSha256,
      mediaType: loaded.mediaType,
      bytes: loaded.bytes,
    },
    scope: defaultScope(subjectJobId),
    acceptanceTest: defaultAcceptance(diagnosed),
    rollback: DEFAULT_ROLLBACK,
    provenance: options.provenance ?? "fixture",
    saleState: "not_a_sale",
    paid: options.paid === true,
    settled: options.settled === true,
    flags: options.flags ?? [],
    sourceKind: "fixture",
    fromFixturePath: filePath,
    subjectJobId,
  };
  return acceptRepairIntake(draft, options.flags ?? []);
}

export function assertKnownSubject(id: string): boolean {
  return (SUBJECT_JOB_IDS as readonly string[]).includes(id);
}
