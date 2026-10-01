import type { JobCard, Packet } from "./types.ts";
import { isEscrowTxHash } from "./inspect.ts";

export class HonestyError extends Error {
  code: string;
  constructor(code: string, message: string) {
    super(message);
    this.name = "HonestyError";
    this.code = code;
  }
}

export function assertHonestPacket(card: JobCard, packet: Packet): void {
  const auth = packet.eligibility.claimAuthority;
  if (auth === "agent") {
    throw new HonestyError(
      "fabricated_authority_rejected",
      "claimAuthority=agent is never inferred from a public GET, expired-OPEN, HUMAN_ONLY, referral, or paused/401 source",
    );
  }
  if (String(auth) === "auth_claim") {
    throw new HonestyError(
      "fabricated_authority_rejected",
      "claimAuthority cannot be auth_claim; that token is agentAccess, not authority",
    );
  }
  if (packet.effort.winProbability !== "unknown") {
    throw new HonestyError(
      "invented_win_probability_rejected",
      "winProbability must stay unknown unless a documented formula is labelled guess (and then not this field)",
    );
  }
  if (packet.mixedScore && packet.mixedScore.displayOnly !== true) {
    throw new HonestyError(
      "mixed_score_authority_rejected",
      "mixedScore must be labelled displayOnly:true and is never the gate",
    );
  }
  if (packet.funding.class === "escrowed" && !isEscrowTxHash(card.listing?.escrowTxHash)) {
    throw new HonestyError(
      "unescrowed_marked_escrowed",
      "promised/unescrowed listings cannot be marked escrowed without a 32-byte 0x hash",
    );
  }
}
