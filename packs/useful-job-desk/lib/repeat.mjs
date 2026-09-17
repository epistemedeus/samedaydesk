const REPEAT_DEMAND_FLAGS = new Set([
  "label-repeat-demand",
  "repeat-demand",
  "repeatDemand",
  "repeat_demand",
  "labelRepeatDemand",
  "label_repeat_demand",
]);

const REPEAT_DEMAND_VALUES = new Set([
  "repeat-demand",
  "repeat_demand",
  "repeatDemand",
  "repeat",
]);

const DEMAND_CLASS_FLAGS = new Set(["demand", "demand-class", "demandClass", "demand_class"]);

function truthyFlag(value) {
  return value !== false && value !== "false" && value !== 0 && value !== "0";
}

/** True when CLI args label the run as repeat demand, including hidden aliases. */
export function isLabelledRepeatDemand(args) {
  if (!args || typeof args !== "object") return false;
  for (const [key, value] of Object.entries(args)) {
    if (REPEAT_DEMAND_FLAGS.has(key) && truthyFlag(value)) return true;
    if (DEMAND_CLASS_FLAGS.has(key) && REPEAT_DEMAND_VALUES.has(String(value))) return true;
  }
  return false;
}

export function evaluateRepeatLabel({ afterSha, afterRepeatSha, labelledRepeatDemand }) {
  const sameFixture = afterSha === afterRepeatSha;
  const changedInput = !sameFixture;
  if (labelledRepeatDemand && sameFixture) {
    return {
      refuse: true,
      code: "same-fixture-labelled-repeat-demand",
      message: "same fixture twice labelled repeat demand is refused",
    };
  }
  if (labelledRepeatDemand && changedInput) {
    return {
      refuse: true,
      code: "repeat-demand-unproved",
      message: "changed-input repeat is not organic repeat demand",
    };
  }
  if (sameFixture) {
    return {
      refuse: true,
      code: "unchanged-input-repeat",
      message: "repeat requires a changed after file",
    };
  }
  return { refuse: false, code: "changed-input-repeat", message: "changed-input second run" };
}
