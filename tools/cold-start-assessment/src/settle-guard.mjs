import { FORBIDDEN_REQUEST_HEADERS, STRIP_CHILD_ENV } from "./catalog.mjs";
import { AssessmentError } from "./errors.mjs";

function headerName(name) {
  return String(name || "").toLowerCase();
}

export function assertNoPaymentHeaders(headers = {}) {
  for (const [name, value] of Object.entries(headers)) {
    if (value == null || value === "") continue;
    if (FORBIDDEN_REQUEST_HEADERS.includes(headerName(name))) {
      throw new AssessmentError(
        "payment_header_forbidden",
        `refusing to send ${headerName(name)}; this fixture assessment does not pay, authenticate, or settle`,
        1,
      );
    }
  }
}

export function refuseSettleRequest(options = {}) {
  if (options.settle || options.liveSettle || options.pay) {
    throw new AssessmentError(
      "live-settle-out-of-scope",
      "Live settlement is out of scope. The proposed $5 price is a labelled fixture and cannot settle.",
      1,
      { cannotSettle: true, purchaseAuthority: false, fundingState: "fixture" },
    );
  }
}

export function childEnv(isolatedHome) {
  const env = {
    PATH: process.env.PATH,
    HOME: isolatedHome,
    TMPDIR: isolatedHome,
    LANG: process.env.LANG || "C",
    NODE_ENV: "test",
    NO_PROXY: "*",
    HTTP_PROXY: "",
    HTTPS_PROXY: "",
  };
  for (const key of STRIP_CHILD_ENV) {
    if (key in env) delete env[key];
  }
  return env;
}
