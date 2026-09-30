/**
 * Normalize an operation name so camelCase, snake_case, kebab-case, dotted and
 * spaced spellings collapse to the same key: "issue_status_grant",
 * "issueStatusGrant" and "Issue Status Grant" all become "issuestatusgrant".
 */
export function normalizeName(raw) {
    return raw
        .trim()
        .replace(/([a-z0-9])([A-Z])/g, "$1 $2")
        .replace(/[_\-./:]+/g, " ")
        .replace(/[^A-Za-z0-9 ]+/g, "")
        .toLowerCase()
        .split(/\s+/)
        .filter(Boolean)
        .join("");
}
export function displayName(raw) {
    return raw.trim();
}
const SURFACES = ["llms.txt", "skill.md", "openapi", "mcp", "agentCard"];
/** Pull plausible operation names out of free-form markdown/text. */
export function extractNamesFromText(text) {
    const names = new Set();
    // `backticked` identifiers and bare camelCase / snake_case tokens
    const patterns = [
        /`([A-Za-z][A-Za-z0-9_.-]{2,})`/g,
        /\b([a-z][a-z0-9]*(?:[A-Z][a-z0-9]*)+)\b/g,
        /\b([a-z][a-z0-9]*(?:_[a-z0-9]+)+)\b/g,
    ];
    for (const re of patterns) {
        let m;
        while ((m = re.exec(text))) {
            const candidate = m[1];
            if (!candidate || candidate.length < 4)
                continue;
            if (/^(https?|json|html|text|llms|skill|txt|utf8)$/i.test(candidate))
                continue;
            names.add(candidate);
        }
    }
    return [...names];
}
export function buildIdentityMatrix(named) {
    const keyToDisplay = new Map();
    const bySurface = new Map();
    for (const surface of SURFACES) {
        const list = named[surface] ?? [];
        const keys = new Set();
        for (const raw of list) {
            const key = normalizeName(raw);
            if (!key)
                continue;
            keys.add(key);
            if (!keyToDisplay.has(key))
                keyToDisplay.set(key, displayName(raw));
        }
        bySurface.set(surface, keys);
    }
    const activeSurfaces = SURFACES.filter((s) => (bySurface.get(s)?.size ?? 0) > 0);
    const operations = [...keyToDisplay.keys()].sort((a, b) => keyToDisplay.get(a).localeCompare(keyToDisplay.get(b)));
    const present = {};
    const mismatches = [];
    for (const key of operations) {
        const row = {};
        for (const surface of SURFACES)
            row[surface] = bySurface.get(surface).has(key);
        present[keyToDisplay.get(key)] = row;
        const missing = activeSurfaces.filter((s) => !row[s]);
        if (missing.length > 0) {
            mismatches.push(`${keyToDisplay.get(key)} is missing from ${missing.join(", ")}`);
        }
    }
    return { operations: operations.map((k) => keyToDisplay.get(k)), surfaces: SURFACES, present, activeSurfaces, mismatches };
}
