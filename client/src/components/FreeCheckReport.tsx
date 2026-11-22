import { Link } from 'react-router-dom';
import { ALL_OFFERS, PAYMENT_LINKS } from '../lib/services';
import type { FreeCheckFinding, FreeCheckResult } from '../lib/freeCheck';
import styles from './FreeCheckReport.module.css';

function Finding({ finding }: { finding: FreeCheckFinding }) {
  const offer = ALL_OFFERS.find((item) => item.slug === finding.offer);
  return <li className={styles.finding} data-status={finding.status}>
    <h3>{finding.label}</h3>
    <p>{finding.detail}</p>
    {finding.fix && <p><strong>{finding.status === 'upgrade' ? 'Consider' : 'Fix'}:</strong> {finding.fix}</p>}
    {finding.status !== 'pass' && finding.status !== 'unknown' && <p className={styles.meta}>Impact: {finding.impact}. Effort: {finding.effort}. {finding.weight} points.</p>}
    {finding.evidence.length > 0 && <details><summary>Evidence</summary><ul>{finding.evidence.map((item, index) => <li key={index}>
      <a href={item.url} target="_blank" rel="noreferrer">{item.kind}</a><pre>{item.value}</pre>
    </li>)}</ul></details>}
    {offer && finding.status !== 'pass' && finding.status !== 'unknown' && <Link className={styles.offer} to={PAYMENT_LINKS[offer.slug]}>{offer.plain} · {offer.price} USD →</Link>}
  </li>;
}
export default function FreeCheckReport({ report, compact = false }: { report: FreeCheckResult; compact?: boolean }) {
  const sections = [
    ['problem', 'Problems', 'Observed obstacles in this check.'],
    ['upgrade', 'Upgrades', 'Optional improvements to consider for this business.'],
    ['unknown', 'Not verified', 'These checks earned no points. They are not reported as failures.'],
    ['pass', 'Verified', 'What this public read-only check could confirm.'],
  ] as const;
  return <section className={styles.report} aria-label="Your free check" data-free-check-report>
    <header className={styles.head}>
      <p className="mono">Free check · version {report.ruleVersion}</p>
      <p className={styles.url}>{report.url}</p>
      <p className={styles.score}><strong>{report.score}</strong> /100 verified points</p>
      <p>{report.scoring.unknown} points not verified. Possible with those checks: up to {report.scoring.possibleWithUnknowns}/100.</p>
      {report.scoring.cap === 75 && <p>No agent action route was verified, so this score is capped at 75.</p>}
      <p className={styles.meta}>{new Date(report.checkedAt).toISOString().slice(0, 16).replace('T', ' ')} UTC</p>
      {report.permalink && <Link to={report.permalink}>Permanent link to this report</Link>}
      {report.storageNotice && <p role="status">{report.storageNotice}</p>}
    </header>
    {!compact && <ul className={styles.groups}>{report.groups.map((group) => <li key={group.group}>{group.group.replaceAll('-', ' ')}: {group.earned}/{group.maximum}</li>)}</ul>}
    {sections.filter(([status]) => !compact || status === 'problem' || status === 'upgrade').map(([status, title, note]) => {
      const findings = report.checks.filter((item) => item.status === status);
      return <section className={styles.section} key={status}>
        <h2>{title} <span>({findings.length})</span></h2><p>{note}</p>
        {findings.length ? <ul className={styles.findings}>{(compact ? findings.slice(0, 2) : findings).map((finding) => <Finding key={finding.id} finding={finding} />)}</ul> : <p>None found in this check.</p>}
      </section>;
    })}
    {compact && <Link to={report.permalink || '/tools/ai-readiness'} state={{ readiness: report }}>Every check and its evidence →</Link>}
    {!compact && <details className={styles.section}><summary>Crawler controls and limits</summary>
      <ul>{report.policies.map((policy) => <li key={policy.agent}>{policy.agent}: {policy.allowed === null ? 'not verified' : policy.allowed ? 'allowed' : 'disallowed'} ({policy.purpose}). {policy.note}</li>)}</ul>
      <ul>{report.limitations.map((item) => <li key={item}>{item}</li>)}</ul>
      {report.permalink && <a href={`/api/tools/ai-readiness?version=2&report=${encodeURIComponent(new URLSearchParams(report.permalink?.split('?')[1]).get('report') || '')}`}>Report JSON</a>}
    </details>}
  </section>;
}
