function pinBlob(report) {
  return JSON.stringify({
    added: report?.added || [],
    removed: report?.removed || [],
    changed: report?.changed || [],
  });
}

function findChanged(report, name) {
  return (report?.changed || []).find((row) => row.name === name);
}

function kindsOf(row) {
  return Array.isArray(row?.changeKinds) ? [...row.changeKinds].sort() : [];
}

function omitOk(report, names) {
  const blob = pinBlob(report);
  return (names || []).every((name) => !blob.includes(name));
}

export function classifyReplay(caseSpec, cli) {
  const transport =
    cli.status === 0 ? "ok" : cli.status === 2 ? "refused" : "engine-failure";
  const domain = caseSpec.domain;
  const finding = {
    id: caseSpec.id,
    format: caseSpec.format,
    mutation: caseSpec.mutation,
    transport,
    domainOutcome: domain.outcome,
    engineAtPin: caseSpec.engineAtPin,
    live: {
      exit: cli.status,
      ok: cli.json?.ok ?? null,
      refused: cli.json?.refused === true,
      code: cli.json?.code || null,
      status: cli.json?.status || cli.report?.status || null,
      digest: cli.json?.digest ?? null,
      counts: cli.json?.counts || cli.report?.counts || null,
    },
  };

  if (transport === "engine-failure") {
    return {
      ...finding,
      kind: "engine-failure",
      ok: false,
      detail: cli.stderr || cli.json?.error || "non-refuse crash",
    };
  }

  if (domain.outcome === "valid-refusal") {
    const codeOk = cli.json?.refused === true && cli.json?.code === domain.refuseCode;
    return {
      ...finding,
      kind: codeOk ? "valid-refusal" : "gap",
      ok: codeOk,
      detail: codeOk
        ? `refused ${domain.refuseCode}`
        : `expected refuse ${domain.refuseCode}, got exit=${cli.status} code=${cli.json?.code || "none"}`,
    };
  }

  if (transport === "refused") {
    return {
      ...finding,
      kind: "gap",
      ok: false,
      detail: `domain ${domain.outcome} was refused as ${cli.json?.code}`,
    };
  }

  const report = cli.report;
  if (!report) {
    return {
      ...finding,
      kind: "engine-failure",
      ok: false,
      detail: "CLI exit 0 without pin-delta.json",
    };
  }

  if (domain.outcome === "no-material-change") {
    const empty =
      report.counts.changed === 0 && report.counts.added === 0 && report.counts.removed === 0;
    const match = empty && omitOk(report, domain.omit);
    return {
      ...finding,
      kind: match ? "match" : "gap",
      ok: match,
      detail: match ? "no pin delta; noise omitted" : "engine listed a pin delta for noise-only input",
    };
  }

  if (caseSpec.engineAtPin.kind === "gap" && caseSpec.engineAtPin.finding === "resolved-source-omitted") {
    const empty =
      report.counts.changed === 0 && report.counts.added === 0 && report.counts.removed === 0;
    return {
      ...finding,
      kind: "gap",
      ok: empty && omitOk(report, domain.omit),
      finding: "resolved-source-omitted",
      detail: empty
        ? "reproduced resolved-source-omitted; domain still wants the resolved URL or git identity explained"
        : `engine now lists a pin delta (changed=${report.counts.changed}); update engineAtPin if W5-M03 bound resolved`,
    };
  }

  const explained = [];
  const missing = [];
  for (const pin of domain.pins || []) {
    const row = findChanged(report, pin.name);
    if (!row) {
      missing.push(pin.name);
      continue;
    }
    const liveKinds = kindsOf(row);
    const expectedKinds = [...pin.changeKinds].sort();
    const omittedKinds = expectedKinds.filter((k) => !liveKinds.includes(k));
    if (pin.before?.version != null && row.before?.version !== pin.before.version) {
      missing.push(`${pin.name}.before.version`);
    }
    if (pin.after?.version != null && row.after?.version !== pin.after.version) {
      missing.push(`${pin.name}.after.version`);
    }
    if (pin.before?.integrity && row.before?.integrity !== pin.before.integrity) {
      missing.push(`${pin.name}.before.integrity`);
    }
    if (pin.after?.integrity && row.after?.integrity !== pin.after.integrity) {
      missing.push(`${pin.name}.after.integrity`);
    }
    explained.push({ name: pin.name, expectedKinds, liveKinds, omittedKinds });
  }

  const kindsOk = explained.every((e) => e.omittedKinds.length === 0);
  const match = missing.length === 0 && kindsOk && omitOk(report, domain.omit);
  return {
    ...finding,
    kind: match ? "match" : "gap",
    ok: match,
    detail: match
      ? "engine explained the domain pin change"
      : `unexplained pins=${missing.join(",") || "none"} kinds=${explained
          .map((e) => `${e.name}:${e.omittedKinds.join("|") || "ok"}`)
          .join(";")}`,
    explained,
    missing,
  };
}
