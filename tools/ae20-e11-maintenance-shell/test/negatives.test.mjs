import assert from "node:assert/strict";
import test from "node:test";
import { sealedDigest } from "../src/consume.mjs";
import { runMaintenanceShell } from "../src/occurrence.mjs";
import { authority, shellInput, templateResult } from "./support.mjs";

function refuse(overrides) {
  const out = runMaintenanceShell(shellInput(overrides));
  assert.equal(out.ok, false);
  assert.equal(out.used, false);
  assert.equal(out.executed, false);
  assert.equal(out.secondPost, false);
  assert.equal(out.posts, 0);
  assert.equal(out.rawServed, false);
  assert.equal(out.supplierRerun, false);
  assert.equal(out.authorityStore, false);
  assert.equal(out.ledger, false);
  assert.equal(out.paid, false);
  return out;
}

test("an unrelated tenant is refused", () => {
  const out = refuse({
    principal: { role: "consumer", accountId: "consumer-harbor", tenantId: "tenantb" },
  });
  assert.equal(out.code, "cross_tenant");
  assert.equal(out.tenantId, "tenantb");
  const again = runMaintenanceShell(shellInput({
    principal: { role: "consumer", accountId: "consumer-harbor", tenantId: "tenantb" },
  }));
  assert.deepEqual(out, again);
});

test("a wrong later task is refused", () => {
  const out = refuse({ laterTaskId: "task-2" });
  assert.equal(out.code, "task_mismatch");
});

test("the source task cannot be reused as the later task", () => {
  const work = {
    ...shellInput().work,
    laterTaskId: "cedar-chair-reuse",
  };
  const out = refuse({ work, laterTaskId: "cedar-chair-reuse" });
  assert.equal(out.code, "task_mismatch");
});

test("a work task that is not the template task is refused", () => {
  const work = { ...shellInput().work, taskId: "other-task" };
  const out = refuse({ work });
  assert.equal(out.code, "task_mismatch");
});

test("a safe-only grant asking for raw bytes is refused", () => {
  const out = refuse({ asked: "raw" });
  assert.equal(out.code, "wrong_rights");
  assert.equal(out.rights, "safe_derivative_only");
});

test("a safe-only grant asking for private bytes is refused", () => {
  const out = refuse({ asked: "private" });
  assert.equal(out.code, "wrong_rights");
  assert.equal(out.rawServed, false);
});

test("a claimed raw right is not honored", () => {
  const out = refuse({ readCurrent: authority({ rights: "raw" }) });
  assert.equal(out.code, "wrong_rights");
  assert.equal(out.rawServed, false);
  assert.equal(out.rights, "safe_derivative_only");
});

test("a permission row state of granted is not a current grant", () => {
  const out = refuse({
    readCurrent: { state: "granted", coverage: ["accepted_artifact"], rights: "safe_derivative_only" },
  });
  assert.equal(out.code, "unavailable");
});

test("withdrawn consent is refused", () => {
  const revoked = refuse({ readCurrent: { state: "revoked" } });
  assert.equal(revoked.code, "revoked");
  assert.equal(revoked.withdrawn, true);
  const withdrawn = refuse({ readCurrent: { state: "withdrawn" } });
  assert.equal(withdrawn.code, "revoked");
  assert.equal(withdrawn.withdrawn, true);
  assert.deepEqual(revoked.permissionChecks.at(-1), { kind: "readCurrent", state: "revoked", ok: false });
});

test("an expired permission is refused", () => {
  const out = refuse({
    readCurrent: authority({ knowledge: { expiresAt: "2026-10-14T17:00:00.000Z" } }),
  });
  assert.equal(out.code, "sharing_denied");
  assert.equal(out.expired, true);
  assert.equal(out.message, "the permission is expired");
});

test("a missing permission is refused", () => {
  const absent = refuse({ readCurrent: null });
  assert.equal(absent.code, "missing_permission");
  const empty = refuse({ readCurrent: {} });
  assert.equal(empty.code, "missing_permission");
  assert.equal(empty.expired, false);
  assert.equal(empty.withdrawn, false);
});

test("the contributor and the requester are not the distinct consumer", () => {
  const contributor = refuse({
    principal: { role: "contributor", accountId: "contrib-cedar", tenantId: "tenanta" },
  });
  assert.equal(contributor.code, "forbidden");
  const requester = refuse({
    principal: { role: "consumer", accountId: "requester-cedar", tenantId: "tenanta" },
  });
  assert.equal(requester.code, "forbidden");
});

test("a tampered template digest is refused", () => {
  const result = templateResult();
  result.message = "tampered";
  const out = refuse({ result });
  assert.equal(out.code, "result_digest_mismatch");
  assert.equal(out.disposition, null);
});

test("a template result that reran the supplier is refused", () => {
  const result = templateResult();
  result.supplier228200 = { ...result.supplier228200, rerun: true };
  result.digest = sealedDigest(result);
  const out = refuse({ result });
  assert.equal(out.code, "not_finite");
  assert.equal(out.supplierRerun, false);
});

test("a widened sharing value is refused", () => {
  const out = refuse({ readCurrent: authority({ sharing: "raw_bytes" }) });
  assert.equal(out.code, "wrong_rights");
  assert.equal(out.rawServed, false);
});

test("coverage without accepted_artifact is refused", () => {
  const out = refuse({
    readCurrent: authority({ knowledge: { coverage: ["safe_summary"] } }),
  });
  assert.equal(out.code, "wrong_rights");
  assert.equal(out.used, false);
});

test("a context that is not the work context is refused", () => {
  const out = refuse({
    readCurrent: authority({ binding: { contextId: "ctx-other" } }),
  });
  assert.equal(out.code, "forbidden");
  assert.equal(out.used, false);
});

test("an authority sharing_denied answer is refused", () => {
  const out = refuse({ readCurrent: { state: "sharing_denied" } });
  assert.equal(out.code, "sharing_denied");
  assert.equal(out.expired, false);
  assert.equal(out.withdrawn, false);
});
