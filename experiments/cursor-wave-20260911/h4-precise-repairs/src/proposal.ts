import { requireSubject } from "./subjects.ts";
import type { SubjectJobId } from "./types.ts";

export type ExactRepairProposal = {
  family: "G";
  id: "G01";
  kind: "proposal";
  liveJob: false;
  liveJobUsd: null;
  fifteenDollarJob: false;
  subjectJobId: SubjectJobId;
  saleState: "not_a_sale";
  paidWrapper: false;
  note: string;
};

export function designExactRepairProposal(subjectJobId: unknown): ExactRepairProposal {
  const id = requireSubject(subjectJobId ?? "listing-repair-packet");
  return {
    family: "G",
    id: "G01",
    kind: "proposal",
    liveJob: false,
    liveJobUsd: null,
    fifteenDollarJob: false,
    subjectJobId: id,
    saleState: "not_a_sale",
    paidWrapper: false,
    note: "Exact repair proposal design only. Not a hosted paid job at any price.",
  };
}
