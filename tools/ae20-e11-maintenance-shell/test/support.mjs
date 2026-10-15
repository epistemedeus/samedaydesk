import { readFileSync } from "node:fs";

const fixture = (name) => JSON.parse(readFileSync(new URL(`../fixtures/${name}`, import.meta.url), "utf8"));

export function templateResult() {
  return fixture("template-result.json");
}

export function authority(patch = {}) {
  const base = fixture("authority-current.json");
  return {
    ...base,
    ...patch,
    binding: { ...base.binding, ...(patch.binding ?? {}) },
    knowledge: { ...base.knowledge, ...(patch.knowledge ?? {}) },
  };
}

export function shellInput(overrides = {}) {
  const call = fixture("call.json");
  return {
    result: templateResult(),
    readCurrent: authority(),
    principal: fixture("principal.json"),
    work: fixture("work.json"),
    now: call.now,
    laterTaskId: call.laterTaskId,
    asked: call.asked,
    ...overrides,
  };
}
