import { nominalReward } from "./inspect.ts";
import type { Effort, JobCard } from "./types.ts";

/**
 * Effort is a third type. Crowding can be known; win probability is never invented.
 */
export function scoreEffort(card: JobCard): Effort {
  const submissions = card.competition?.submissions;
  const hasCrowding = Number.isInteger(submissions) && Number(submissions) >= 0;
  const effort: Effort = {
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
export function labelledWinProbabilityGuess(
  card: JobCard,
): { value: number; labelled: "guess"; formula: string } | undefined {
  const n = card.competition?.submissions;
  if (!Number.isInteger(n) || Number(n) < 1) return undefined;
  if (card.competition?.winnerOnly !== true) return undefined;
  return {
    value: 1 / Number(n),
    labelled: "guess",
    formula: "1/submissions for winner-take-one (guess, not a measured win rate)",
  };
}
