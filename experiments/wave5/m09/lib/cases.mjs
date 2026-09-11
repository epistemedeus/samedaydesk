import { CLOCK, SELECTED_FIELDS, SOURCE_A, SOURCE_B, SOURCE_C } from "./paths.mjs";
import {
  BASE_GRADE,
  BASE_LEAD,
  BASE_PACK,
  extractBatch,
  sourceRow,
} from "./batch.mjs";

const T0 = "2026-09-01T10:00:00.000Z";
const T1 = "2026-09-01T10:00:01.000Z";
const T_LATE = "2026-09-10T18:22:03.000Z";
const T_STALE = "2026-08-01T10:00:00.000Z";

function pair(beforeJobId, afterJobId, beforeRows, afterRows, extra = {}) {
  return {
    before: extractBatch({ jobId: beforeJobId, charged: extra.beforeCharged ?? false, sources: beforeRows }),
    after: extractBatch({
      jobId: afterJobId,
      charged: extra.afterCharged ?? extra.beforeCharged ?? false,
      sources: afterRows,
    }),
  };
}

function lead(overrides = {}) {
  const data = Object.hasOwn(overrides, "dataExact")
    ? overrides.dataExact
    : { ...BASE_LEAD, ...overrides.data };
  return sourceRow({
    id: "item-001",
    source: SOURCE_A,
    data,
    extraData: overrides.extraData,
    notes: overrides.notes ?? [],
    fetchedAt: overrides.fetchedAt ?? T0,
    completedAt: overrides.completedAt ?? T1,
    httpStatus: overrides.httpStatus ?? 200,
  });
}

function grade(overrides = {}) {
  return sourceRow({
    id: "item-002",
    source: SOURCE_B,
    data: { ...BASE_GRADE, ...overrides.data },
    extraData: overrides.extraData,
    notes: overrides.notes ?? [],
    fetchedAt: overrides.fetchedAt ?? T0,
    completedAt: overrides.completedAt ?? T1,
  });
}

function pack(overrides = {}) {
  return sourceRow({
    id: "item-003",
    source: SOURCE_C,
    data: { ...BASE_PACK, ...overrides.data },
    fetchedAt: overrides.fetchedAt ?? T0,
    completedAt: overrides.completedAt ?? T1,
  });
}

const LONG_PREFIX = `Northshore fastener lead sheet ${"A".repeat(260)}`;
const LONG_TITLE_OLD = `${LONG_PREFIX} END-OLD`;
const LONG_TITLE_NEW = `${LONG_PREFIX} END-NEW`;

export const CASES = [
  {
    id: "noise-observation-metadata",
    control: "noise",
    mutation: "jobId, charged, notes, fetchedAt, completedAt, httpStatus stay 200; selected fields identical",
    html: ["northshore-lead-sheet.v1.html", "northshore-lead-sheet.noise-comment.html"],
    fields: [...SELECTED_FIELDS],
    clock: CLOCK,
    expected: {
      transportOk: true,
      verdict: "unchanged",
      semantic: 0,
      usefulOutputProven: true,
    },
    ...pair(
      "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
      "bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb",
      [lead(), grade()],
      [
        lead({ notes: ["utm=replay-noise", "request-id=req-9f3c"], fetchedAt: T_LATE, completedAt: T_LATE }),
        grade({ notes: ["trace=held-snapshot"], fetchedAt: T_LATE, completedAt: T_LATE }),
      ],
      { beforeCharged: false, afterCharged: true },
    ),
  },
  {
    id: "noise-unselected-opengraph",
    control: "noise",
    mutation: "openGraph title changes; selected fields title/description/headings unchanged",
    html: ["northshore-lead-sheet.v1.html"],
    fields: [...SELECTED_FIELDS],
    clock: CLOCK,
    expected: {
      transportOk: true,
      verdict: "unchanged",
      semantic: 0,
      usefulOutputProven: true,
    },
    ...pair(
      "cccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccc",
      "dddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddd",
      [lead({ extraData: { openGraph: { title: "Lead sheet" } } }), grade()],
      [lead({ extraData: { openGraph: { title: "Lead sheet — sale banner" } } }), grade()],
    ),
  },
  {
    id: "noise-json-key-order",
    control: "noise",
    mutation: "headings object key order h2 before h1; same members",
    html: ["northshore-lead-sheet.v1.html"],
    fields: [...SELECTED_FIELDS],
    clock: CLOCK,
    expected: {
      transportOk: true,
      verdict: "unchanged",
      semantic: 0,
      usefulOutputProven: true,
    },
    ...pair(
      "eeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee",
      "ffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff",
      [lead(), grade()],
      [
        lead({
          data: {
            title: BASE_LEAD.title,
            description: BASE_LEAD.description,
            headings: { h2: ["Lead times", "Grades"], h1: ["Northshore Fasteners"] },
          },
        }),
        grade(),
      ],
    ),
  },
  {
    id: "noise-source-reorder",
    control: "noise",
    mutation: "source list permutation only",
    html: ["northshore-lead-sheet.v1.html"],
    fields: [...SELECTED_FIELDS],
    clock: CLOCK,
    expected: {
      transportOk: true,
      verdict: "reordered",
      semantic: 0,
      usefulOutputProven: true,
    },
    ...pair(
      "1111111111111111111111111111111111111111111111111111111111111111",
      "2222222222222222222222222222222222222222222222222222222222222222",
      [lead(), grade()],
      [grade(), lead()],
    ),
  },
  {
    id: "meaningful-title",
    control: "meaningful",
    mutation: "lead-sheet title records a 21-day lead",
    html: ["northshore-lead-sheet.v1.html", "northshore-lead-sheet.title-changed.html"],
    fields: [...SELECTED_FIELDS],
    clock: CLOCK,
    expected: {
      transportOk: true,
      verdict: "changed",
      minSemantic: 1,
      usefulOutputProven: true,
      changePathIncludes: "/title",
    },
    ...pair(
      "3333333333333333333333333333333333333333333333333333333333333333",
      "4444444444444444444444444444444444444444444444444444444444444444",
      [lead(), grade()],
      [lead({ data: { ...BASE_LEAD, title: "Northshore fastener lead sheet (21-day lead)" } }), grade()],
    ),
  },
  {
    id: "meaningful-description",
    control: "meaningful",
    mutation: "unit price 12.40 USD to 14.10 USD in description",
    html: ["northshore-lead-sheet.v1.html", "northshore-lead-sheet.description-changed.html"],
    fields: [...SELECTED_FIELDS],
    clock: CLOCK,
    expected: {
      transportOk: true,
      verdict: "changed",
      minSemantic: 1,
      usefulOutputProven: true,
      changePathIncludes: "/description",
    },
    ...pair(
      "5555555555555555555555555555555555555555555555555555555555555555",
      "6666666666666666666666666666666666666666666666666666666666666666",
      [lead(), grade()],
      [
        lead({
          data: {
            ...BASE_LEAD,
            description: "Grade 8 hex bolts. Lead time 14 days. Unit price 14.10 USD.",
          },
        }),
        grade(),
      ],
    ),
  },
  {
    id: "meaningful-heading-text",
    control: "meaningful",
    mutation: "h2 member Grades becomes ISO grades; not a permutation",
    html: ["northshore-lead-sheet.v1.html", "northshore-lead-sheet.heading-changed.html"],
    fields: [...SELECTED_FIELDS],
    clock: CLOCK,
    expected: {
      transportOk: true,
      verdict: "changed",
      minSemantic: 1,
      usefulOutputProven: true,
      changePathIncludes: "/headings",
    },
    ...pair(
      "7777777777777777777777777777777777777777777777777777777777777777",
      "8888888888888888888888888888888888888888888888888888888888888888",
      [lead(), grade()],
      [
        lead({
          data: {
            ...BASE_LEAD,
            headings: { h1: ["Northshore Fasteners"], h2: ["Lead times", "ISO grades"] },
          },
        }),
        grade(),
      ],
    ),
  },
  {
    id: "mixed-noise-plus-title",
    control: "meaningful",
    mutation: "observation noise plus title change; noise must not hide the title",
    html: ["northshore-lead-sheet.v1.html", "northshore-lead-sheet.title-changed.html"],
    fields: [...SELECTED_FIELDS],
    clock: CLOCK,
    expected: {
      transportOk: true,
      verdict: "changed",
      minSemantic: 1,
      usefulOutputProven: true,
      changePathIncludes: "/title",
    },
    ...pair(
      "9999999999999999999999999999999999999999999999999999999999999999",
      "abababababababababababababababababababababababababababababababab",
      [lead(), grade()],
      [
        lead({
          data: { ...BASE_LEAD, title: "Northshore fastener lead sheet (21-day lead)" },
          notes: ["utm=banner"],
          fetchedAt: T_LATE,
          completedAt: T_LATE,
        }),
        grade({ fetchedAt: T_LATE, completedAt: T_LATE }),
      ],
      { afterCharged: true },
    ),
  },
  {
    id: "heading-permutation",
    control: "noise",
    mutation: "h2 array permutation of the same members",
    html: ["northshore-lead-sheet.v1.html"],
    fields: [...SELECTED_FIELDS],
    clock: CLOCK,
    expected: {
      transportOk: true,
      verdict: "reordered",
      semantic: 0,
      usefulOutputProven: true,
    },
    ...pair(
      "cdcdcdcdcdcdcdcdcdcdcdcdcdcdcdcdcdcdcdcdcdcdcdcdcdcdcdcdcdcdcdcd",
      "efefefefefefefefefefefefefefefefefefefefefefefefefefefefefefefef",
      [lead(), grade()],
      [
        lead({
          data: {
            ...BASE_LEAD,
            headings: { h1: ["Northshore Fasteners"], h2: ["Grades", "Lead times"] },
          },
        }),
        grade(),
      ],
    ),
  },
  {
    id: "coverage-unknown-absent-description",
    control: "coverage",
    mutation: "after omits description; absent field is coverage unknown, not deletion",
    html: ["northshore-lead-sheet.v1.html"],
    fields: [...SELECTED_FIELDS],
    clock: CLOCK,
    expected: {
      transportOk: true,
      verdict: "incomplete",
      semantic: 0,
      usefulOutputProven: false,
      coverageUnknownField: "description",
    },
    ...pair(
      "1010101010101010101010101010101010101010101010101010101010101010",
      "1212121212121212121212121212121212121212121212121212121212121212",
      [lead(), grade()],
      [
        lead({
          dataExact: {
            title: BASE_LEAD.title,
            headings: BASE_LEAD.headings,
          },
        }),
        grade(),
      ],
    ),
  },
  {
    id: "excerpt-long-title",
    control: "meaningful",
    mutation: "title longer than default maxExcerptBytes changes in the last bytes",
    html: ["northshore-lead-sheet.v1.html"],
    fields: [...SELECTED_FIELDS],
    clock: CLOCK,
    expected: {
      transportOk: true,
      verdict: "changed",
      minSemantic: 1,
      usefulOutputProven: true,
      changePathIncludes: "/title",
    },
    ...pair(
      "1313131313131313131313131313131313131313131313131313131313131313",
      "1414141414141414141414141414141414141414141414141414141414141414",
      [lead({ data: { ...BASE_LEAD, title: LONG_TITLE_OLD } }), grade()],
      [lead({ data: { ...BASE_LEAD, title: LONG_TITLE_NEW } }), grade()],
    ),
  },
  {
    id: "truncation-max-sources-hides-row",
    control: "meaningful",
    mutation: "title change lives on source B; --max-sources 1 drops that row on current Co13 pin",
    html: ["northshore-lead-sheet.v1.html", "northshore-lead-sheet.title-changed.html"],
    fields: [...SELECTED_FIELDS],
    clock: CLOCK,
    extraArgs: ["--max-sources", "1"],
    expected: {
      transportOk: true,
      verdict: "incomplete",
      semantic: 0,
      usefulOutputProven: false,
      remainingBinding:
        "W5-M05: source_limit truncation currently forces verdict incomplete and drops later semantic rows. Do not treat incomplete as unchanged, and do not hide a detected change when the changed row is in-bounds.",
    },
    contrastId: "truncation-max-sources-in-bounds",
    ...pair(
      "1515151515151515151515151515151515151515151515151515151515151515",
      "1616161616161616161616161616161616161616161616161616161616161616",
      [lead(), grade({ data: { ...BASE_GRADE, title: "Northshore grade chart" } }), pack()],
      [lead(), grade({ data: { ...BASE_GRADE, title: "Northshore grade chart (rev B)" } }), pack()],
    ),
  },
  {
    id: "truncation-max-sources-in-bounds",
    control: "meaningful",
    mutation: "same three-source pair without max-sources clamp; grade-chart title change must remain changed",
    html: ["northshore-lead-sheet.v1.html", "northshore-lead-sheet.title-changed.html"],
    fields: [...SELECTED_FIELDS],
    clock: CLOCK,
    expected: {
      transportOk: true,
      verdict: "changed",
      minSemantic: 1,
      usefulOutputProven: true,
      changePathIncludes: "/title",
    },
    ...pair(
      "1717171717171717171717171717171717171717171717171717171717171717",
      "1818181818181818181818181818181818181818181818181818181818181818",
      [lead(), grade({ data: { ...BASE_GRADE, title: "Northshore grade chart" } }), pack()],
      [lead(), grade({ data: { ...BASE_GRADE, title: "Northshore grade chart (rev B)" } }), pack()],
    ),
  },
  {
    id: "truncation-max-changes-hides-verdict",
    control: "meaningful",
    mutation: "title and description both change; --max-changes 1 records a semantic change then incomplete on current Co13 pin",
    html: ["northshore-lead-sheet.v1.html"],
    fields: [...SELECTED_FIELDS],
    clock: CLOCK,
    extraArgs: ["--max-changes", "1"],
    expected: {
      transportOk: true,
      verdict: "changed",
      minSemantic: 1,
      usefulOutputProven: true,
      changePathIncludes: "/description",
      omittedChangePath: "/title",
      remainingBinding:
        "W5-M05: with --max-changes 1, visit stops at >= maxChanges so truncated never becomes true (it tests length > maxChanges). A later sibling path such as /title is omitted from changes[] while verdict stays changed and snapshot.truncated stays false.",
    },
    contrastId: "truncation-max-changes-in-bounds",
    ...pair(
      "1919191919191919191919191919191919191919191919191919191919191919",
      "1a1a1a1a1a1a1a1a1a1a1a1a1a1a1a1a1a1a1a1a1a1a1a1a1a1a1a1a1a1a1a1a",
      [lead(), grade()],
      [
        lead({
          data: {
            ...BASE_LEAD,
            title: "Northshore fastener lead sheet (21-day lead)",
            description: "Grade 8 hex bolts. Lead time 14 days. Unit price 14.10 USD.",
          },
        }),
        grade(),
      ],
    ),
  },
  {
    id: "truncation-max-changes-in-bounds",
    control: "meaningful",
    mutation: "same title and description changes with default max-changes; verdict must stay changed",
    html: ["northshore-lead-sheet.v1.html"],
    fields: [...SELECTED_FIELDS],
    clock: CLOCK,
    expected: {
      transportOk: true,
      verdict: "changed",
      minSemantic: 2,
      usefulOutputProven: true,
    },
    ...pair(
      "1b1b1b1b1b1b1b1b1b1b1b1b1b1b1b1b1b1b1b1b1b1b1b1b1b1b1b1b1b1b1b1b",
      "1c1c1c1c1c1c1c1c1c1c1c1c1c1c1c1c1c1c1c1c1c1c1c1c1c1c1c1c1c1c1c1c",
      [lead(), grade()],
      [
        lead({
          data: {
            ...BASE_LEAD,
            title: "Northshore fastener lead sheet (21-day lead)",
            description: "Grade 8 hex bolts. Lead time 14 days. Unit price 14.10 USD.",
          },
        }),
        grade(),
      ],
    ),
  },
  {
    id: "stale-option-noop",
    control: "noise",
    mutation: "same selected fields; provenance 30 days apart; --max-stale-ms 1000 is unused on current Co13 pin",
    html: ["northshore-lead-sheet.v1.html"],
    fields: [...SELECTED_FIELDS],
    clock: CLOCK,
    extraArgs: ["--max-stale-ms", "1000"],
    expected: {
      transportOk: true,
      verdict: "unchanged",
      semantic: 0,
      usefulOutputProven: true,
      freshness: "unknown",
      remainingBinding:
        "W5-M05: DEFAULT_LIMITS.maxStaleMs / maxJsonDepth / maxJsonNodes and CLI --max-stale-ms are accepted but unused in io/parse/compare on 91b57334. Fixture customer-job.limits.maxStaleMs=86400000 likewise does not bind freshness.",
    },
    ...pair(
      "1d1d1d1d1d1d1d1d1d1d1d1d1d1d1d1d1d1d1d1d1d1d1d1d1d1d1d1d1d1d1d1d",
      "1e1e1e1e1e1e1e1e1e1e1e1e1e1e1e1e1e1e1e1e1e1e1e1e1e1e1e1e1e1e1e1e",
      [lead({ fetchedAt: T_STALE, completedAt: T_STALE }), grade({ fetchedAt: T_STALE, completedAt: T_STALE })],
      [lead({ fetchedAt: T_LATE, completedAt: T_LATE }), grade({ fetchedAt: T_LATE, completedAt: T_LATE })],
    ),
  },
];

export const REFUSAL_CASES = [
  {
    id: "refuse-quote-only",
    control: "refusal",
    expected: { transportOk: false, code: "quote_as_success" },
  },
  {
    id: "refuse-live-url",
    control: "refusal",
    expected: { transportOk: false, code: "live_fetch_url" },
  },
  {
    id: "refuse-clock-required",
    control: "refusal",
    expected: { transportOk: false, code: "clock_required" },
  },
];
