import { SCHEMA_CARD_A3, SCHEMA_CARD_F03 } from "./constants.js";
export function unwrapCard(payload) {
    if (!payload || typeof payload !== "object") {
        throw new Error("job card must be an object");
    }
    const root = payload;
    if (root.labelled && root.inner && typeof root.inner === "object") {
        return unwrapCard(root.inner);
    }
    if (root.schema === SCHEMA_CARD_A3 || root.schema === SCHEMA_CARD_F03 || root.listing || root.source) {
        return payload;
    }
    if (root.data && typeof root.data === "object") {
        return unwrapCard(root.data);
    }
    throw new Error("unrecognized job card shape");
}
export function cardId(card) {
    return card.listing?.id || card.source?.nativeId || null;
}
