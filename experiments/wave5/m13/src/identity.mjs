export function selectById(items, id, { idKey = "id" } = {}) {
  if (typeof id === "number") {
    const err = new Error("catalog array index is not service identity");
    err.code = "index-is-not-identity";
    throw err;
  }
  if (id == null || id === "") {
    const err = new Error("stable identity is required");
    err.code = "missing-identity";
    throw err;
  }
  const list = Array.isArray(items) ? items : [];
  return list.find((item) => item && item[idKey] === id) || null;
}

export function firstIndex(items) {
  const list = Array.isArray(items) ? items : [];
  return list[0] || null;
}

export function reverseCopy(items) {
  return [...(Array.isArray(items) ? items : [])].reverse();
}

export function pathOfResource(urlLike) {
  try {
    const url = new URL(urlLike);
    return url.pathname.replace(/\/$/, "") || "/";
  } catch {
    return null;
  }
}
