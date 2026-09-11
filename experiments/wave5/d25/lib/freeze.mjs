import { freezeFile } from "./sha.mjs";

export function freezeInputs(files) {
  const slots = {};
  for (const [name, filePath] of Object.entries(files || {})) {
    if (!filePath) continue;
    slots[name] = freezeFile(name, filePath);
  }
  return slots;
}

export function assertChanged(previous, current, slot) {
  const prev = previous?.[slot];
  const next = current?.[slot];
  if (!prev || !next) {
    return { ok: false, code: "missing-slot", slot, previous: prev || null, current: next || null };
  }
  if (prev.sha256 === next.sha256) {
    return { ok: false, code: "input-unchanged", slot, sha256: next.sha256 };
  }
  return {
    ok: true,
    slot,
    previous: { bytes: prev.bytes, sha256: prev.sha256 },
    current: { bytes: next.bytes, sha256: next.sha256 },
  };
}

export function assertNotPreviousOutput(currentInputs, previousOutputs) {
  const outputShas = new Set((previousOutputs || []).map((o) => o.sha256).filter(Boolean));
  const reused = [];
  for (const slot of Object.values(currentInputs || {})) {
    if (slot?.sha256 && outputShas.has(slot.sha256)) reused.push(slot.name);
  }
  return { ok: reused.length === 0, reused };
}
