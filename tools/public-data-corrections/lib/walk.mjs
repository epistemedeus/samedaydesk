export function isPlainObject(value) {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

export function walk(value, visit, path = []) {
  visit(value, path);
  if (Array.isArray(value)) {
    value.forEach((item, i) => walk(item, visit, [...path, i]));
    return;
  }
  if (isPlainObject(value)) {
    for (const [key, child] of Object.entries(value)) {
      walk(child, visit, [...path, key]);
    }
  }
}

export function pathKey(path) {
  if (!path.length) return "";
  return String(path[path.length - 1]);
}

export function pathString(path) {
  return path.map(String).join(".");
}
