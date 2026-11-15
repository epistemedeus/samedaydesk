import { isRewardKey, privateRewardPathAllowed } from "./constants.mjs";

export function findDisallowedRewardKey(value, path = "") {
  if (Array.isArray(value)) {
    for (let index = 0; index < value.length; index += 1) {
      const found = findDisallowedRewardKey(value[index], path ? `${path}.${index}` : String(index));
      if (found) return found;
    }
    return null;
  }
  if (!value || typeof value !== "object") return null;
  for (const [key, child] of Object.entries(value)) {
    const next = path ? `${path}.${key}` : key;
    if (isRewardKey(key) && !privateRewardPathAllowed(next)) return next;
    const found = findDisallowedRewardKey(child, next);
    if (found) return found;
  }
  return null;
}

export function privateAtoms(journey) {
  const atoms = new Set();
  const task = journey?.task || {};
  for (const value of [task.grossAtomic, task.railCostAtomic]) collectAtom(atoms, value);
  const projection = journey?.feeProjection;
  if (projection) {
    for (const value of [projection.grossAtomic, projection.platformFeeAtomic, projection.contributorNetAtomic, projection.railCostAtomic]) {
      collectAtom(atoms, value);
    }
  }
  if (task.effort && typeof task.effort === "object") {
    for (const value of Object.values(task.effort)) collectAtom(atoms, value);
  }
  if (Array.isArray(task.costLines)) {
    for (const line of task.costLines) collectAtom(atoms, line?.atomic);
  }
  return [...atoms];
}

function collectAtom(atoms, value) {
  if (typeof value !== "string") return;
  if (!/^(0|[1-9][0-9]{0,18})$/.test(value)) return;
  if (value === "0") return;
  atoms.add(value);
}

export function containsPrivateAtom(value, atoms) {
  if (atoms.length === 0) return false;
  const text = typeof value === "string" ? value : JSON.stringify(value);
  return atoms.some((atom) => text.includes(atom));
}

export function publicTask(task) {
  return {
    taskId: task.taskId,
    title: task.title,
    summary: task.summary,
    criteria: task.criteria,
    publicationConsent: task.publicationConsent,
    provenance: task.provenance,
  };
}

export function publicArtifact(artifact) {
  if (!artifact || typeof artifact !== "object") return undefined;
  return {
    schema: artifact.schema,
    artifactClass: artifact.artifactClass,
    heading: artifact.heading,
    headingDigest: artifact.headingDigest,
    sourceLabel: artifact.sourceLabel,
  };
}
