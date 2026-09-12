export function parseStdoutJson(stdout) {
  const trimmed = String(stdout || "").trim();
  if (!trimmed) {
    return { json: null, whole: false, sliced: false, empty: true };
  }
  try {
    return { json: JSON.parse(trimmed), whole: true, sliced: false, empty: false };
  } catch {
    const start = trimmed.indexOf("{");
    const end = trimmed.lastIndexOf("}");
    if (start >= 0 && end > start) {
      try {
        return {
          json: JSON.parse(trimmed.slice(start, end + 1)),
          whole: false,
          sliced: true,
          empty: false,
        };
      } catch {
        return { json: null, whole: false, sliced: false, empty: false };
      }
    }
    return { json: null, whole: false, sliced: false, empty: false };
  }
}
