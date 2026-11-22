import { Link } from 'react-router-dom';
import { ALL_OFFERS, PAYMENT_LINKS } from '../lib/services';
import type { FreeCheckFinding, FreeCheckResult } from '../lib/freeCheck';
import styles from './FreeCheckReport.module.css';

const points = (n: number) => `${n} ${n === 1 ? 'point' : 'points'}`;
const offerOf = (slug: string | null | undefined) => ALL_OFFERS.find((item) => item.slug === slug);

function Finding({ finding, withOffer }: { finding: FreeCheckFinding; withOffer: boolean }) {
  const offer = withOffer ? offerOf(finding.offer) : undefined;
  return <li className={styles.finding} data-status={finding.status}>
    <h3>{finding.label} <span className={styles.points}>{finding.status === 'pass' ? '' : `+${points(finding.weight)}`}</span></h3>
    <p>{finding.detail}</p>
    {finding.fix && <p><strong>Fix:</strong> {finding.fix}</p>}
    {finding.evidence.length > 0 && <details><summary>What we saw</summary><ul>{finding.evidence.map((item, index) => <li key={index}>
      <a href={item.url} target="_blank" rel="noreferrer">{item.kind}</a><pre>{item.value}</pre>
    </li>)}</ul></details>}
    {offer && <Link className={styles.offer} to={PAYMENT_LINKS[offer.slug]}>{offer.plain} · {offer.price} USD →</Link>}
  </li>;
}
export default function FreeCheckReport({ report, compact = false }: { report: FreeCheckResult; compact?: boolean }) {
  const of = (status: FreeCheckFinding['status']) => report.checks.filter((item) => item.status === status).sort((a, b) => b.weight - a.weight);
  const problems = of('problem'), upgrades = of('upgrade'), passed = of('pass'), unmeasured = of('unknown');
  const summary = report.summary;
  const offer = offerOf(summary?.offer);
  const top = summary?.topFixes ?? [...problems, ...upgrades].slice(0, 3).map((item) => ({ id: item.id, label: item.label, points: item.weight, fix: item.fix }));
  const name = report.name || new URL(report.url).hostname;
  return <section className={styles.report} aria-label="Your free check" data-free-check-report>
    <header className={styles.head}>
      <p className="mono">Free check · version {report.ruleVersion}</p>
      <p className={styles.url}>{report.url}</p>
      <p className={styles.score}><strong>{report.score}</strong> /100</p>
      <p>{name}: {problems.length === 1 ? '1 problem' : `${problems.length} problems`} costing {points(problems.reduce((sum, item) => sum + item.weight, 0))}, and {upgrades.length === 1 ? '1 upgrade' : `${upgrades.length} upgrades`} worth {points(upgrades.reduce((sum, item) => sum + item.weight, 0))}.</p>
      {report.scoring.cap === 75 && <p>No route an agent can act on was found, so the score stops at 75.</p>}
    </header>
    {top.length > 0 && <section className={styles.summary} aria-labelledby="free-check-top">
      <h2 id="free-check-top">The three fixes worth the most</h2>
      <ol className={styles.fixes}>{top.map((item) => <li key={item.id}><strong>{item.label}, +{points(item.points)}.</strong> {item.fix}</li>)}</ol>
      {offer && <Link className={styles.cta} to={PAYMENT_LINKS[offer.slug]}>{offer.plain} · {offer.price} USD →</Link>}
    </section>}
    <section className={styles.section}>
      <h2>Problems <span>({problems.length})</span></h2>
      {problems.length ? <ul className={styles.findings}>{(compact ? problems.slice(0, 2) : problems).map((finding) => <Finding key={finding.id} finding={finding} withOffer={false} />)}</ul> : <p>No problems in what this check could read.</p>}
    </section>
    <section className={styles.section}>
      <h2>Upgrades <span>({upgrades.length})</span></h2>
      <p>New things agents could do with {name}.</p>
      {upgrades.length > 0 && <ul className={styles.findings}>{(compact ? upgrades.slice(0, 2) : upgrades).map((finding) => <Finding key={finding.id} finding={finding} withOffer />)}</ul>}
    </section>
    {unmeasured.length > 0 && <p className={styles.unmeasured}>Not measured in this run ({points(report.scoring.unknown)}): {unmeasured.map((item) => item.detail).join('; ')}.</p>}
    {compact && <Link to={report.permalink || '/tools/ai-readiness'} state={{ readiness: report }}>Every check and its evidence →</Link>}
    {!compact && <>
      <details className={styles.section}><summary>Passed ({passed.length})</summary>
        <ul className={styles.findings}>{passed.map((finding) => <Finding key={finding.id} finding={finding} withOffer={false} />)}</ul>
      </details>
      <ul className={styles.groups}>{report.groups.map((group) => <li key={group.group}>{group.group.replaceAll('-', ' ')}: {group.earned}/{group.maximum}</li>)}</ul>
      <p className={styles.meta}>Checked {new Date(report.checkedAt).toISOString().slice(0, 16).replace('T', ' ')} UTC. {report.limitations.join(' ')}</p>
      {report.permalink && <p className={styles.meta}><Link to={report.permalink}>Permanent link to this report</Link> · <a href={`/api/tools/ai-readiness?version=2&report=${encodeURIComponent(new URLSearchParams(report.permalink.split('?')[1]).get('report') || '')}`}>Report JSON</a></p>}
      {report.storageNotice && <p role="status">{report.storageNotice}</p>}
      <details className={styles.section}><summary>Crawler rules</summary>
        <ul>{report.policies.map((policy) => <li key={policy.agent}>{policy.agent}: {policy.allowed === null ? 'not read' : policy.allowed ? 'allowed' : 'blocked'} ({policy.purpose}).</li>)}</ul>
      </details>
    </>}
  </section>;
}
