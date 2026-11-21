import { nominalReward } from "./inspect.js";
/**
 * Effort is a third type. Crowding can be known; win probability is never invented.
 */
export function scoreEffort(card) {
    const submissions = card.competition?.submissions;
    const hasCrowding = Number.isInteger(submissions) && Number(submissions) >= 0;
    const effort = {
        kind: hasCrowding ? "expected" : "unknown",
        winProbability: "unknown",
    };
    if (hasCrowding) {
        effort.crowding = {
            submissions: Number(submissions),
            nominalReward: nominalReward(card.reward?.gross),
        };
    }
    return effort;
}
/** Documented 1/n formula. Labelled guess only — never copied onto Effort.winProbability. */
export function labelledWinProbabilityGuess(card) {
    const n = card.competition?.submissions;
    if (!Number.isInteger(n) || Number(n) < 1)
        return undefined;
    if (card.competition?.winnerOnly !== true)
        return undefined;
    return {
        value: 1 / Number(n),
        labelled: "guess",
        formula: "1/submissions for winner-take-one (guess, not a measured win rate)",
    };
}
