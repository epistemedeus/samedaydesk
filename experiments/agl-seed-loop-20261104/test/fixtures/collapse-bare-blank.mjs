export function key(method, path, rawQuery) {
  const pairs = [];
  for (const [name, value] of new URLSearchParams(rawQuery)) pairs.push([name, value]);
  return JSON.stringify({method, path, pairs});
}
