/** Visible scope diff between two brief revisions (by structured brief objects). */

function indexById(items) {
  const map = new Map();
  for (const item of items || []) map.set(item.id, item);
  return map;
}

export function diffBriefScope(boundBrief, currentBrief) {
  const addedObjective = [];
  const removedObjective = [];
  const changedObjective = [];
  const addedSubjective = [];
  const removedSubjective = [];
  const changedSubjective = [];

  const boundObj = indexById(boundBrief.objectiveChecks);
  const currObj = indexById(currentBrief.objectiveChecks);
  for (const [id, cur] of currObj) {
    if (!boundObj.has(id)) addedObjective.push(id);
    else if (JSON.stringify(boundObj.get(id).check) !== JSON.stringify(cur.check) ||
      boundObj.get(id).description !== cur.description) {
      changedObjective.push(id);
    }
  }
  for (const id of boundObj.keys()) {
    if (!currObj.has(id)) removedObjective.push(id);
  }

  const boundSub = indexById(boundBrief.subjectiveCriteria);
  const currSub = indexById(currentBrief.subjectiveCriteria);
  for (const [id, cur] of currSub) {
    if (!boundSub.has(id)) addedSubjective.push(id);
    else if (boundSub.get(id).description !== cur.description) changedSubjective.push(id);
  }
  for (const id of boundSub.keys()) {
    if (!currSub.has(id)) removedSubjective.push(id);
  }

  const boundFields = boundBrief.deliverableContract?.requiredFields || [];
  const currFields = currentBrief.deliverableContract?.requiredFields || [];
  const fieldsAdded = currFields.filter((f) => !boundFields.includes(f));
  const fieldsRemoved = boundFields.filter((f) => !currFields.includes(f));

  const changed =
    addedObjective.length +
      removedObjective.length +
      changedObjective.length +
      addedSubjective.length +
      removedSubjective.length +
      changedSubjective.length +
      fieldsAdded.length +
      fieldsRemoved.length >
    0;

  return {
    changed,
    objective: { added: addedObjective, removed: removedObjective, changed: changedObjective },
    subjective: { added: addedSubjective, removed: removedSubjective, changed: changedSubjective },
    requiredFields: { added: fieldsAdded, removed: fieldsRemoved },
  };
}
