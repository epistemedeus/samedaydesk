import { trafficProjection } from "../../server/lib/traffic-context.mjs";
// SameDayDesk's side of the shared release kit's demand.mjs (pinned in release/kit.json): journey rows from
// the care database through the read-only role in DEMAND_DATABASE_URL, schema DEMAND_DATABASE_SCHEMA.
const host = (session) => { try { return new URL(session.success_url).hostname; } catch { return ""; } };

export function readJourney({ sql, between }) {
  const schema = process.env.DEMAND_DATABASE_SCHEMA;
  if (!/^[a-z][a-z0-9_]{0,62}$/.test(schema ?? "")) throw new Error("Set DEMAND_DATABASE_SCHEMA to the care schema");
  const rows = sql(`select event, session_id::text as session, order_id, test, is_agent as agent, referrer, utm, traffic
    from "${schema}".journey_events where brand = 'samedaydesk' and ${between("created_at")} order by created_at`);
  const qaSessions = new Set(rows.filter((row) => row.test).flatMap((row) => [row.session, row.order_id]).filter(Boolean));
  const live = rows.filter((row) => !row.test);
  return {
    traffic: trafficProjection(rows.filter(row => row.event === 'visit'), qaSessions),
    visits: live.filter((row) => row.event === "visit").map(({ session, referrer, utm, agent }) => ({ session, referrer, utm, agent })),
    checkouts: live.filter((row) => row.event === "checkout_started").length,
    qaSessions,
  };
}

export const ownsSession = (session) => Boolean(session.metadata?.sds_care_order || session.metadata?.sds_task_quote) ||
  host(session) === "samedaydesk.com" || host(session).endsWith(".samedaydesk.com");
export const journeySession = (session) => session.metadata?.journey_session ?? session.metadata?.sds_care_order ?? null;
