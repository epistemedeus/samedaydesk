const DEMO_ARG_RE = /(?:^|\s)(--example|--offline-example|--probe|example|demo|cold-start|journey)(?:\s|$)/;

export function isDemoCommand(command) {
  if (command?.demo) return true;
  const argv = Array.isArray(command?.argv) ? command.argv.join(" ") : "";
  return DEMO_ARG_RE.test(argv);
}

function walk(value, path, visit) {
  if (value == null) return;
  if (Array.isArray(value)) {
    value.forEach((item, index) => walk(item, `${path}[${index}]`, visit));
    return;
  }
  if (typeof value !== "object") return;
  for (const [key, child] of Object.entries(value)) {
    const next = path ? `${path}.${key}` : key;
    visit(key, child, next, value);
    if (child && typeof child === "object") walk(child, next, visit);
  }
}

function isTrue(value) {
  return value === true || value === "true";
}

function collectDemo(documents, demoContext) {
  let demo = demoContext;
  for (const doc of documents) {
    if (!doc || typeof doc !== "object") continue;
    walk(doc, "", (key, value) => {
      if (key === "completionLabel" && value === "fixture_demo") demo = true;
      if (key === "sampleLabel" || key === "exampleKind" || key === "exampleMode") demo = true;
      if ((key === "mode" || key === "provenance") && (value === "demo" || value === "fixture_demo")) {
        demo = true;
      }
      if (key === "fixture" && isTrue(value)) demo = true;
      if (key === "demo" && isTrue(value)) demo = true;
      if (key === "inputSource" && value === "demo") demo = true;
    });
  }
  return demo;
}

function isPaidCompletionClaim(key, value) {
  if (key === "actualCompletion" && isTrue(value)) return true;
  if (key === "purchaseAuthority" && isTrue(value)) return true;
  if (key === "noPurchaseAuthority" && value === false) return true;
  if (key === "paid" && isTrue(value)) return true;
  if (key === "createsCheckout" && isTrue(value)) return true;
  if (key === "paidCalls" && isTrue(value)) return true;
  if (key === "customerCompletion" && isTrue(value)) return true;
  if (key === "sold" && isTrue(value)) return true;
  if (
    key === "completionLabel" &&
    typeof value === "string" &&
    /paid|customer|actual_completion/i.test(value) &&
    value !== "fixture_demo"
  ) {
    return true;
  }
  if (key === "status" && typeof value === "string" && /paid[- ]completion/i.test(value)) return true;
  return false;
}

/**
 * SAMPLE / demo output must not be labelled actual_completion or paid.
 * A local command pass is a usable reproduction, not customer completion.
 */
export function inspectHonesty(documents, { demoContext = false } = {}) {
  const findings = [];
  const flags = {
    purchaseAuthority: false,
    actualCompletion: false,
    demo: collectDemo(documents, demoContext),
    localGate: false,
    customerCompletion: false,
    sampleLabelledAsPaidCompletion: false,
    paid: false,
  };

  for (const doc of documents) {
    if (!doc || typeof doc !== "object") continue;
    walk(doc, "", (key, value, path) => {
      if (key === "purchaseAuthority" && isTrue(value)) flags.purchaseAuthority = true;
      if (key === "noPurchaseAuthority" && value === false) flags.purchaseAuthority = true;
      if (key === "actualCompletion" && isTrue(value)) flags.actualCompletion = true;
      if (key === "paid" && isTrue(value)) flags.paid = true;
      if (key === "sold" && isTrue(value)) flags.paid = true;
      if (key === "localRunOk" && isTrue(value)) flags.localGate = true;
      if (key === "decision" && value === "pass") flags.localGate = true;

      if (flags.demo && isPaidCompletionClaim(key, value)) {
        flags.sampleLabelledAsPaidCompletion = true;
        flags.customerCompletion = true;
        findings.push({
          ok: false,
          code: "sample_labelled_as_paid_completion",
          path,
          message: `SAMPLE/demo output at ${path} claims paid or customer completion`,
        });
      }
    });
  }

  if (flags.actualCompletion && !flags.demo) {
    flags.customerCompletion = true;
    findings.push({
      ok: false,
      code: "actual_completion_claimed",
      path: "actualCompletion",
      message: "actualCompletion is true; a local gate is not customer completion",
    });
  }

  if (flags.localGate && !flags.actualCompletion) {
    findings.push({
      ok: true,
      code: "local_gate_not_customer_completion",
      path: "localRunOk",
      message: "local gate pass recorded; not customer completion",
    });
  }

  return { flags, findings };
}
