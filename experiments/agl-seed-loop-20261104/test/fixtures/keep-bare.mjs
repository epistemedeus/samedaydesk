function decode(value) {
  return decodeURIComponent(value.replace(/\+/g, ' '));
}

export function key(method, path, rawQuery) {
  const pairs = rawQuery.split('&').filter((segment) => segment.length > 0).map((segment) => {
    const index = segment.indexOf('=');
    if (index < 0) return [decode(segment), null];
    return [decode(segment.slice(0, index)), decode(segment.slice(index + 1))];
  });
  return JSON.stringify({method, path, pairs});
}
