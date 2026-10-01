/**
 * Ordinary contributor path. Scoped task grant plus received evidence bytes.
 * No git, no database URL, no owner token, no payout.
 */
import { createHash, randomBytes } from "node:crypto";
export const RECEIVED_EVIDENCE_REF = "fixture:received-evidence-not-fetched";
export const RECEIVED_EVIDENCE_MEDIA_TYPE = "application/json";
export const FORBIDDEN_CONTRIBUTOR_ENV = [
    "DATABASE_URL",
    "EARNED_WORK_DATABASE_URL",
    "EARNED_WORK_OWNER_TOKEN",
    "EARNED_WORK_PAYOUT_KEY",
    "EARNED_WORK_PG_SCHEMA",
];
export function assertContributorEnv(env) {
    for (const key of FORBIDDEN_CONTRIBUTOR_ENV) {
        if (env[key] != null && String(env[key]).trim() !== "") {
            throw new Error(`ordinary contributor refuses ${key}`);
        }
    }
}
export function evidenceArtifact(evidence) {
    return {
        ref: RECEIVED_EVIDENCE_REF,
        digestSha256: createHash("sha256").update(evidence).digest("hex"),
        mediaType: RECEIVED_EVIDENCE_MEDIA_TYPE,
        bytes: evidence.byteLength,
    };
}
export function evidenceSubmissionBody(reservationId, evidence) {
    return JSON.stringify({
        reservationId,
        artifact: evidenceArtifact(evidence),
        evidenceBase64: evidence.toString("base64"),
    });
}
function baseOf(baseUrl) {
    const url = new URL(baseUrl);
    if (url.username || url.password || url.search || url.hash) {
        throw new Error("contributor base URL must be an origin and optional path");
    }
    return baseUrl.replace(/\/$/, "");
}
function asRecord(value) {
    return value != null && typeof value === "object" ? value : null;
}
function errorFields(body) {
    const error = asRecord(asRecord(body)?.error);
    return {
        code: typeof error?.code === "string" ? error.code : null,
        message: typeof error?.message === "string" ? error.message : "",
    };
}
function mapCode(status, body) {
    const fields = errorFields(body);
    if (status === 403 && /scoped to a different task/i.test(fields.message))
        return "wrong_task_scope";
    return fields.code;
}
function blank(httpStatus, code) {
    return {
        ok: false,
        httpStatus,
        code,
        submitted: false,
        reservationId: null,
        submissionId: null,
        termsVersion: null,
        paid: false,
        settled: false,
        transfer: null,
        readback: null,
    };
}
async function readJson(response) {
    const text = await response.text();
    if (!text)
        return null;
    try {
        return JSON.parse(text);
    }
    catch {
        return null;
    }
}
export async function runOrdinaryContributor(input) {
    const base = baseOf(input.baseUrl);
    const fetchImpl = input.fetchImpl ?? fetch;
    const taskPath = `/v1/tasks/${encodeURIComponent(input.taskId)}`;
    if (input.mode === "read") {
        const response = await fetchImpl(`${base}${taskPath}/contributor-obligation`, {
            headers: { authorization: `Bearer ${input.token}` },
        });
        const body = await readJson(response);
        if (response.status !== 200) {
            return { ...blank(response.status, mapCode(response.status, body)) };
        }
        const record = asRecord(body);
        const readback = record?.readback === "owed" || record?.readback === "none" ? record.readback : null;
        const obligation = asRecord(record?.obligation);
        return {
            ok: true,
            httpStatus: 200,
            code: null,
            submitted: false,
            reservationId: typeof obligation?.reservationId === "string" ? obligation.reservationId : null,
            submissionId: typeof obligation?.submissionId === "string" ? obligation.submissionId : null,
            termsVersion: typeof obligation?.termsVersion === "string" ? obligation.termsVersion : null,
            paid: false,
            settled: false,
            transfer: null,
            readback,
        };
    }
    const taskResponse = await fetchImpl(`${base}${taskPath}`);
    const taskBody = await readJson(taskResponse);
    if (taskResponse.status !== 200) {
        return blank(taskResponse.status, mapCode(taskResponse.status, taskBody));
    }
    const termsVersion = asRecord(asRecord(taskBody)?.task)?.termsVersion;
    if (typeof termsVersion !== "string")
        return blank(taskResponse.status, "invalid_task");
    const claimKey = input.claimIdempotencyKey ?? `claim-${randomBytes(8).toString("hex")}`;
    const claimResponse = await fetchImpl(`${base}${taskPath}/claims`, {
        method: "POST",
        headers: {
            authorization: `Bearer ${input.token}`,
            "content-type": "application/json",
            "idempotency-key": claimKey,
        },
        body: JSON.stringify({ termsVersion }),
    });
    const claimBody = await readJson(claimResponse);
    if (claimResponse.status !== 201 && claimResponse.status !== 200) {
        return {
            ...blank(claimResponse.status, mapCode(claimResponse.status, claimBody)),
            termsVersion,
        };
    }
    const reservationId = asRecord(asRecord(claimBody)?.reservation)?.id;
    if (typeof reservationId !== "string")
        return blank(claimResponse.status, "invalid_claim");
    if (input.mode === "qualify") {
        return {
            ok: true,
            httpStatus: claimResponse.status,
            code: null,
            submitted: false,
            reservationId,
            submissionId: null,
            termsVersion,
            paid: false,
            settled: false,
            transfer: null,
            readback: null,
        };
    }
    if (!input.evidence || input.evidence.byteLength < 1) {
        throw new Error("submit mode requires received evidence bytes");
    }
    const submitKey = input.submitIdempotencyKey ?? `submit-${randomBytes(8).toString("hex")}`;
    const submitResponse = await fetchImpl(`${base}${taskPath}/submissions`, {
        method: "POST",
        headers: {
            authorization: `Bearer ${input.token}`,
            "content-type": "application/json",
            "idempotency-key": submitKey,
        },
        body: evidenceSubmissionBody(reservationId, input.evidence),
    });
    const submitBody = await readJson(submitResponse);
    if (submitResponse.status !== 201 && submitResponse.status !== 200) {
        return {
            ...blank(submitResponse.status, mapCode(submitResponse.status, submitBody)),
            reservationId,
            termsVersion,
        };
    }
    const submissionId = asRecord(asRecord(submitBody)?.submission)?.id;
    return {
        ok: typeof submissionId === "string",
        httpStatus: submitResponse.status,
        code: typeof submissionId === "string" ? null : "invalid_submission",
        submitted: typeof submissionId === "string",
        reservationId,
        submissionId: typeof submissionId === "string" ? submissionId : null,
        termsVersion,
        paid: false,
        settled: false,
        transfer: null,
        readback: null,
    };
}
//# sourceMappingURL=ordinary-contributor.js.map