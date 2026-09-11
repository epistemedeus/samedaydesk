import { BUYER_CLASS } from "./contract.mjs";
import { TESTED_WRAPPER_SHA } from "./paths.mjs";

export function observedFriction({ wrapper, pythonMeta, wrapperSha }) {
  const items = [];
  if (!wrapper?.transport || !wrapper?.analysis || !wrapper?.delivery) {
    items.push({
      id: "pr52-cli-lacks-d01-execution-fields",
      observed: true,
      note: "PR52 CLI JSON has ok/engine/receipt. It does not emit D01 transport/analysis/delivery objects.",
    });
  }
  if (pythonMeta?.cli && String(pythonMeta.cli).includes("server/paid-useful-jobs/bin/cli.mjs")) {
    items.push({
      id: "wrapper-cli-requires-sds-checkout",
      observed: true,
      note: "The Python runtime invoked a repo-relative PR52 CLI. D24 clean-environment install is not this pin.",
    });
  }
  if (pythonMeta?.nodeBin) {
    items.push({
      id: "python-runtime-requires-node",
      observed: true,
      note: "The independent runtime is Python 3. It still subprocesses Node for the wrapper. That is friction, not a second engine.",
    });
  }
  if (wrapperSha === TESTED_WRAPPER_SHA) {
    items.push({
      id: "tested-pr52-not-d01-head",
      observed: true,
      note: `Classified against ${TESTED_WRAPPER_SHA}. D01 contract SHA was read-only and is not claimed.`,
    });
  }
  items.push({
    id: "co14-not-consumed",
    observed: true,
    note: "This kit does not import tools/python-useful-jobs-client. Co14 acquires the PR51 archive directly.",
  });
  items.push({
    id: "recruitment-unexecuted",
    observed: true,
    note: "No recruited operator ran this kit. Owner QA is not demand.",
  });
  return items;
}

export function remainingBinding() {
  return [
    {
      id: "W5-D01",
      status: "unbound-for-this-consumer",
      note: "execution.v1 fields are a future sibling. This kit classifies PR52 engine.status instead.",
    },
    {
      id: "W5-D08",
      status: "unbound",
      note: "Installed Python client should call this wrapper CLI. D27 ships a thin trial.py instead of vendoring Co14.",
    },
    {
      id: "W5-D24",
      status: "unbound",
      note: "Clean-environment package install is still a checkout plus Node.",
    },
    {
      id: "W5-D25",
      status: "unbound",
      note: "Buyer journey harness is not this packet.",
    },
    {
      id: "W5-D26",
      status: "unbound",
      note: "Price-floor measurement is not this packet. Fixture 0.02 USDC is labelled non-live.",
    },
    {
      id: "F",
      status: "unbound",
      note: "Root-held recruitment of a non-owner independent runtime. No messages or spend from this worker.",
    },
  ];
}

export function buyerClassLabel(buyerClass) {
  if (buyerClass === BUYER_CLASS.OWNER_QA) return "owner-qa";
  if (buyerClass === BUYER_CLASS.RECRUITED_INDEPENDENT) return "recruited-independent";
  return "unknown";
}
