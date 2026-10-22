import { selectById } from "../../../wave5/m13/src/identity.mjs";
import { refuse } from "./refuse.mjs";

export function selectExactById(items, id, { idKey = "id" } = {}) {
  if (typeof id === "number") {
    throw refuse("index-is-not-identity", "catalog array index is not service identity");
  }
  if (id == null || id === "") {
    throw refuse("missing-identity", "stable identity is required");
  }
  const list = Array.isArray(items) ? items : [];
  const matches = list.filter((item) => item && item[idKey] === id);
  if (matches.length > 1) {
    throw refuse("duplicate-identity", `identity ${id} matches ${matches.length} catalog rows`, {
      id,
      count: matches.length,
    });
  }
  if (matches.length === 0) return null;
  return matches[0];
}

export function rowsFromJobIds(ids) {
  return (Array.isArray(ids) ? ids : []).map((id) => ({ id }));
}

export { selectById };
