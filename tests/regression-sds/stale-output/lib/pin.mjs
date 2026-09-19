/** Current useful-jobs pin (cite client/src/data/usefulJobsKit.json; write only under stale-output). */
export const FEATURE = "stale-output";

export const CURRENT_PIN = Object.freeze({
  version: "1.4.7",
  sha256: "e2e9b44e4d7318ac55052953318f05e53dbc121ab02e2762e34c919ac5469dec",
  bytes: 5255824,
  rootName: "useful-jobs-1.4.7",
});

/** Known historical (stale) pins from usefulJobsKit.json immutableArchives + previous. */
export const STALE_PINS = Object.freeze({
  "1.0.0": Object.freeze({
    version: "1.0.0",
    sha256: "6bf650391fad4fa658a7959e9717fc5499faf4caffa0a39f67c6c2ee033bdb51",
    bytes: 2522418,
  }),
  "1.1.0": Object.freeze({
    version: "1.1.0",
    sha256: "de8ebee19ffd5d9019fa7988291fe37d861e7bf3f5ee7dd341c9d2f0f0065534",
    bytes: 2577606,
  }),
  "1.2.0": Object.freeze({
    version: "1.2.0",
    sha256: "dec31ea66f1605fb9578c7d15c9583b130c6e2c0b82b5e6b93422381a04461eb",
    bytes: 2579117,
  }),
  "1.3.0": Object.freeze({
    version: "1.3.0",
    sha256: "bc4db0ec83109852b8fdbd542d10d515c0053a30dd9b93836c9ad7c738510b6c",
    bytes: 2574904,
  }),
  "1.4.0": Object.freeze({
    version: "1.4.0",
    sha256: "2b1949189f0ad2e3c1bd5f7a43f7eda800fd5f0dc3a395415689feee0419ff4f",
    bytes: 2575215,
  }),
});

export const FABRICATED_SHA =
  "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa";

export const BOUNDARY = Object.freeze({
  paymentSent: false,
  stripeOrX402: false,
  write: "tests/regression-sds/stale-output/**",
});
