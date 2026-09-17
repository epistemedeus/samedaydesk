import {
  REPAIR_CONTACT_LIFECYCLE,
  findRepairContactLifecycle,
  findSellerRepairBrief,
  isRepairContactLifecycle,
  type RepairContactLifecycle,
  type RepairContactLifecycleRecord,
} from "./sellerRepairBriefs.ts";

export type RepairContactLifecycleAuthority =
  | "public_brief"
  | "outbound_attempt"
  | "transport_bounce"
  | "pulse_anonymous_spoofable"
  | "seller_attributed_reply"
  | "upstream_merge"
  | "payment";

export type RepairContactLifecycleFixtureRow = Readonly<{
  state: RepairContactLifecycle;
  authority: RepairContactLifecycleAuthority;
  uniqueVisitor: false;
  spoofable: boolean;
  demand: false;
}>;

export const PULSE_ANONYMOUS_SPOOFABLE_STATES = Object.freeze([
  "anonymous_view",
  "scope_click",
] as const satisfies readonly RepairContactLifecycle[]);

export const REPAIR_CONTACT_LIFECYCLE_FIXTURE = Object.freeze({
  published: {
    state: "published",
    authority: "public_brief",
    uniqueVisitor: false,
    spoofable: false,
    demand: false,
  },
  attempted_dispatch: {
    state: "attempted_dispatch",
    authority: "outbound_attempt",
    uniqueVisitor: false,
    spoofable: false,
    demand: false,
  },
  bounce: {
    state: "bounce",
    authority: "transport_bounce",
    uniqueVisitor: false,
    spoofable: false,
    demand: false,
  },
  anonymous_view: {
    state: "anonymous_view",
    authority: "pulse_anonymous_spoofable",
    uniqueVisitor: false,
    spoofable: true,
    demand: false,
  },
  scope_click: {
    state: "scope_click",
    authority: "pulse_anonymous_spoofable",
    uniqueVisitor: false,
    spoofable: true,
    demand: false,
  },
  reply: {
    state: "reply",
    authority: "seller_attributed_reply",
    uniqueVisitor: false,
    spoofable: false,
    demand: false,
  },
  repair_merged: {
    state: "repair_merged",
    authority: "upstream_merge",
    uniqueVisitor: false,
    spoofable: false,
    demand: false,
  },
  paid: {
    state: "paid",
    authority: "payment",
    uniqueVisitor: false,
    spoofable: false,
    demand: false,
  },
} as const satisfies Record<RepairContactLifecycle, RepairContactLifecycleFixtureRow>);

export const REPAIR_CONTACT_LIFECYCLE_ENUM_EXAMPLES = Object.freeze(
  REPAIR_CONTACT_LIFECYCLE.map((state) =>
    Object.freeze({
      state,
      kind: "enum_example" as const,
      fixture: REPAIR_CONTACT_LIFECYCLE_FIXTURE[state],
    }),
  ),
);

export function describeRepairContactLifecycle(
  state: RepairContactLifecycle,
): RepairContactLifecycleFixtureRow {
  return REPAIR_CONTACT_LIFECYCLE_FIXTURE[state];
}

export function isAnonymousSpoofablePulseState(state: RepairContactLifecycle): boolean {
  return state === "anonymous_view" || state === "scope_click";
}

export function lookupRepairContactLifecycle(
  id: string | null,
): RepairContactLifecycleRecord | null {
  return findRepairContactLifecycle(id);
}

export function assertKnownFindingLifecycle(id: string): RepairContactLifecycleRecord {
  const record = findRepairContactLifecycle(id);
  if (record == null) {
    throw new Error(`unknown_finding_id:${id}`);
  }
  if (findSellerRepairBrief(id) == null) {
    throw new Error(`unknown_finding_id:${id}`);
  }
  if (!isRepairContactLifecycle(record.state)) {
    throw new Error(`unknown_lifecycle_state:${String(record.state)}`);
  }
  return record;
}

export {
  REPAIR_CONTACT_LIFECYCLE,
  findRepairContactLifecycle,
  isRepairContactLifecycle,
};
export type { RepairContactLifecycle, RepairContactLifecycleRecord };
