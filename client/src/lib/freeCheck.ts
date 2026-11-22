export type FreeCheckFinding = {
  id: string; label: string; group: string; weight: number;
  status: 'pass' | 'problem' | 'upgrade' | 'unknown'; detail: string;
  evidence: { url: string; kind: string; value: string }[];
  impact: string; effort: string; fix: string | null; offer: string | null;
};
export type FreeCheckResult = {
  version: 2; ruleVersion: string; ruleSha256: string; url: string; score: number; grade: string;
  name?: string; checkedAt: string; checks: FreeCheckFinding[];
  summary?: { problems: number; upgrades: number; offer: string | null; topFixes: { id: string; label: string; points: number; fix: string | null }[] }; permalink?: string | null; storageNotice?: string;
  scoring: { unknown: number; maximum: number; cap: number; possibleWithUnknowns: number; meaning: string };
  groups: { group: string; maximum: number; earned: number }[];
  limitations: string[]; policies: { agent: string; purpose: string; allowed: boolean | null; note: string | null }[];
};
export type CheckProgress = { kind: string; label?: string; detail?: string; url?: string; status?: number };
export async function requestFreeCheck(url: string, signal: AbortSignal, onProgress: (event: CheckProgress) => void) {
  const response = await fetch(`/api/tools/ai-readiness?version=2&stream=1&url=${encodeURIComponent(url)}`, {
    signal: AbortSignal.any([signal, AbortSignal.timeout(20_000)]), headers: { Accept: 'text/event-stream' },
  });
  if (!response.ok || !response.body) throw Error('The check could not start. Check the address and try again.');
  const reader = response.body.getReader(), decoder = new TextDecoder();
  let buffer = '', total = 0, result: FreeCheckResult | null = null;
  try {
    for (;;) {
      const chunk = await reader.read();
      if (chunk.done) break;
      total += chunk.value.byteLength;
      if (total > 1_500_000) throw Error('The response exceeded the report limit.');
      buffer += decoder.decode(chunk.value, { stream: true }).replace(/\r\n/g, '\n');
      let end;
      while ((end = buffer.indexOf('\n\n')) >= 0) {
        const frame = buffer.slice(0, end); buffer = buffer.slice(end + 2);
        const event = frame.split('\n').find((line) => line.startsWith('event: '))?.slice(7);
        const data = frame.split('\n').filter((line) => line.startsWith('data: ')).map((line) => line.slice(6)).join('\n');
        if (!data) continue;
        const value = JSON.parse(data);
        if (event === 'error') throw Error(value.error || 'The check did not finish.');
        if (event === 'progress') onProgress(value);
        if (event === 'result' && value.version === 2 && Array.isArray(value.checks)) result = value;
      }
    }
  } finally { await reader.cancel().catch(() => {}); reader.releaseLock(); }
  if (!result) throw Error('The check ended without a complete report.');
  return result;
}
