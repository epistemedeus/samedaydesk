export const TEMPLATE = {
  schema: "samedaydesk.compat-maintenance-acceptance.v1",
  occurrence: "one-finite",
  slots: [
    {
      id: "compatibility-change",
      source: "tools/recurring-job-recipes source-change-alert",
      required: true,
    },
    {
      id: "repair-or-useful-no-fit",
      source: "E02 useful_positive or useful_negative",
      required: true,
    },
    {
      id: "accept-or-reject",
      source: "authorized reviewer; operator capture is not acceptance",
      required: true,
    },
    {
      id: "repeat-procurement",
      source: "E01 distinct tasks and no repurchase of retained output",
      required: true,
    },
    {
      id: "cold-takeover",
      source: "E01 revoked mandate read without inherited authority",
      required: true,
    },
    {
      id: "task-economics",
      source: "E06 per-capture floor; unknown effort stays unknown",
      required: true,
    },
    {
      id: "result-reuse",
      source: "tools/result-reuse opt-in observation; permission stays ungranted",
      required: true,
    },
    {
      id: "legacy-terms",
      source: "221400 and 234100 nets stay unrepriced",
      required: true,
    },
    {
      id: "h-join",
      source: "pilot joined receiving matrix",
      status: "pending-join",
      required: true,
    },
  ],
  forbidden: [
    "timer",
    "scheduler",
    "queue",
    "live-obligation",
    "subscription",
    "supplier-228200-rerun",
  ],
};
