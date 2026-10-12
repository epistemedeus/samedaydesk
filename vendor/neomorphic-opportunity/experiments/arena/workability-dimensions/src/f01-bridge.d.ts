export function cardFromEarnedWorkTask(task: unknown): unknown;
export function scoreCard(card: unknown, opts?: { now?: Date | string | number }): {
  schema: "arena.a3.workability-dimensions.envelope.v1";
  packet: {
    eligibility: { agentAccess: string; claimAuthority: string; doNotStartWork: boolean };
    funding: { class: string; deadlineExpired: boolean; purpose: string };
    effort: { kind: string; winProbability: string };
    mixedScore?: { value: number; displayOnly: true };
  };
  doNotStartWork: boolean;
};
export function workGateFromDimensions(packet: unknown): { reasons: string[] };
