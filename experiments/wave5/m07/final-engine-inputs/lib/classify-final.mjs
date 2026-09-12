function namesIn(report) {
  const rows = [...(report?.added || []), ...(report?.removed || []), ...(report?.changed || [])];
  return rows.map((row) => row.name || row.after?.name || row.before?.name).filter(Boolean);
}

function idsIn(report) {
  const rows = [...(report?.added || []), ...(report?.removed || []), ...(report?.changed || [])];
  return rows.map((row) => row.id || row.after?.id || row.before?.id).filter(Boolean);
}

function kindsOf(row) {
  return Array.isArray(row?.changeKinds) ? [...row.changeKinds].sort() : [];
}

function emptyDelta(report) {
  return report.counts.changed === 0 && report.counts.added === 0 && report.counts.removed === 0;
}

function defect(kind, detail) {
  return { kind, ok: false, ownerqa: true, nBty003: false, detail };
}

export function classifyFinal(caseSpec, cli) {
  const base = {
    id: caseSpec.id,
    engine: cli.kind,
    exit: cli.status,
    status: cli.json?.status || cli.report?.status || null,
    counts: cli.report?.counts || cli.json?.counts || null,
  };
  if (cli.status !== 0) {
    return {
      ...base,
      ...defect("engine-failure", `exit ${cli.status} code=${cli.json?.code || "none"} ${cli.stderr || cli.stdout}`),
    };
  }
  const report = cli.report;
  if (!report) {
    return { ...base, ...defect("engine-failure", "exit 0 without pin-delta.json") };
  }

  const domain = caseSpec.domain;
  const liveNames = namesIn(report);
  const liveIds = idsIn(report);

  if (domain.outcome === "no-material-change" || domain.outcome === "supported-unknown") {
    const empty = emptyDelta(report);
    const omitted = (domain.omitIds || []).every((id) => !liveIds.includes(id));
    const namedOk = (domain.forbidNames || []).every((n) => !liveNames.includes(n));
    if (empty && omitted && namedOk) {
      return {
        ...base,
        kind: domain.outcome === "supported-unknown" ? "supported-unknown" : "match",
        ok: true,
        ownerqa: false,
        nBty003: false,
        finding: domain.finding || null,
        detail:
          domain.outcome === "supported-unknown"
            ? domain.finding
            : "pin identity fields unchanged; extra keys omitted",
      };
    }
    if (!empty && domain.outcome === "supported-unknown") {
      return {
        ...base,
        ...defect(
          "incorrect-named-delta",
          `expected documented skip ${domain.finding}; got added=${report.counts.added} removed=${report.counts.removed} changed=${report.counts.changed} ids=${liveIds.join(",")}`,
        ),
      };
    }
    return {
      ...base,
      ...defect(
        "incorrect-named-delta",
        `pin-only control listed a delta ids=${liveIds.join(",") || "none"} names=${liveNames.join(",") || "none"}`,
      ),
    };
  }

  const pin = domain.pin;
  const row = (report.changed || []).find((r) => r.id === pin.id);
  if (!row) {
    const byName = (report.changed || []).find((r) => r.name === pin.name);
    if (byName) {
      return {
        ...base,
        ...defect(
          "incorrect-named-delta",
          `name ${pin.name} attached to id ${byName.id}, expected ${pin.id}`,
        ),
      };
    }
    return {
      ...base,
      ...defect("incorrect-named-delta", `missing changed pin id=${pin.id} name=${pin.name}; live ids=${liveIds.join(",") || "none"}`),
    };
  }
  if (row.name !== pin.name) {
    return {
      ...base,
      ...defect("incorrect-named-delta", `id ${pin.id} named ${JSON.stringify(row.name)}, expected ${pin.name}`),
    };
  }
  const forbidden = (domain.forbidNames || []).find((n) => liveNames.includes(n));
  if (forbidden) {
    return {
      ...base,
      ...defect("incorrect-named-delta", `delta used forbidden name ${forbidden}`),
    };
  }
  const leaked = (domain.omitIds || []).find((id) => liveIds.includes(id));
  if (leaked) {
    return {
      ...base,
      ...defect("incorrect-named-delta", `unchanged path ${leaked} appeared in the delta`),
    };
  }
  const liveKinds = kindsOf(row);
  const expectedKinds = [...pin.changeKinds].sort();
  const missingKinds = expectedKinds.filter((k) => !liveKinds.includes(k));
  if (missingKinds.length) {
    return {
      ...base,
      ...defect(
        "incorrect-named-delta",
        `id ${pin.id} changeKinds ${liveKinds.join("|") || "none"} missing ${missingKinds.join("|")}`,
      ),
    };
  }
  if (pin.before?.version != null && row.before?.version !== pin.before.version) {
    return { ...base, ...defect("incorrect-named-delta", `${pin.id} before.version ${row.before?.version}`) };
  }
  if (pin.after?.version != null && row.after?.version !== pin.after.version) {
    return { ...base, ...defect("incorrect-named-delta", `${pin.id} after.version ${row.after?.version}`) };
  }
  if (pin.before?.integrity && row.before?.integrity !== pin.before.integrity) {
    return { ...base, ...defect("incorrect-named-delta", `${pin.id} before.integrity mismatch`) };
  }
  if (pin.after?.integrity && row.after?.integrity !== pin.after.integrity) {
    return { ...base, ...defect("incorrect-named-delta", `${pin.id} after.integrity mismatch`) };
  }
  if (pin.before?.resolved && row.before?.resolved !== pin.before.resolved) {
    return { ...base, ...defect("incorrect-named-delta", `${pin.id} before.resolved mismatch`) };
  }
  if (pin.after?.resolved && row.after?.resolved !== pin.after.resolved) {
    return { ...base, ...defect("incorrect-named-delta", `${pin.id} after.resolved mismatch`) };
  }
  return {
    ...base,
    kind: "match",
    ok: true,
    ownerqa: false,
    nBty003: false,
    detail: `explained ${pin.name} at ${pin.id} kinds=${liveKinds.join(",")}`,
  };
}
