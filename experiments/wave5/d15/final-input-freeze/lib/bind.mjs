import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

export function listedBindings(body, files) {
  const order = body?.order?.inputs || [];
  const receipt = body?.order?.wrapper?.receipt?.inputs || [];
  const envelope = body?.mailbox?.seeded?.envelope || null;
  const pickup = body?.mailbox?.pickup || null;
  const blob = JSON.stringify({
    order,
    receipt,
    inputSha256: body?.order?.inputSha256 || [],
    envelope,
    pickup,
  });
  return (files || []).map((file) => ({
    name: file.name,
    sha256: file.sha256,
    inOrderInputs: order.some((row) => row.sha256 === file.sha256),
    inReceiptInputs: receipt.some((row) => row.sha256 === file.sha256),
    inOrderInputSha256: (body?.order?.inputSha256 || []).includes(file.sha256),
    inMailboxEnvelope: envelope ? JSON.stringify(envelope).includes(file.sha256) : false,
    inSerializedDelivery: blob.includes(file.sha256),
  }));
}

export function orderJobPath(body) {
  const row = (body?.order?.inputs || []).find((item) => item.flag === "--job");
  return row?.path || null;
}

export function pageVerdict(runOutDir) {
  if (!runOutDir) return null;
  const path = join(runOutDir, "page-change.json");
  if (!existsSync(path)) return null;
  try {
    const json = JSON.parse(readFileSync(path, "utf8"));
    return json?.report?.verdict || json?.verdict || null;
  } catch {
    return null;
  }
}
