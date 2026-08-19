// One-shot recovery for a paid order whose intake is still open after 24 hours.
//
// The clock does not start until the intake is complete, so an abandoned form means a
// buyer is waiting for work that cannot start. Exactly one email goes out per order, and
// the flag that records it is written before the send is considered done.
import { supabaseAdmin, isSupabaseConfigured } from "./supabase-admin.js";
import { sendTemplate } from "./notify.js";
import { intakeRecovery } from "../emails/index.js";
import { getOffer } from "../pricing.js";

const DAY_MS = 24 * 60 * 60 * 1000;

export async function sweepAbandonedIntakes({ now = new Date() } = {}) {
  if (!isSupabaseConfigured()) return { ran: false, reason: "no_storage", sent: 0 };
  const cutoff = new Date(now.getTime() - DAY_MS).toISOString();
  try {
    const sb = supabaseAdmin();
    const { data, error } = await sb
      .from("orders")
      .select("id, stripe_session_id, offer_slug, delivery_email, created_at")
      .eq("status", "paid")
      .eq("recovery_sent", false)
      .not("stripe_session_id", "is", null)
      .lt("created_at", cutoff)
      .limit(50);
    if (error) throw error;

    let sent = 0;
    for (const row of data || []) {
      if (!getOffer(row.offer_slug) || !row.delivery_email) continue;
      // Flag first: a duplicate email is worse than a missed one here.
      const { error: flagError } = await sb.from("orders").update({ recovery_sent: true }).eq("id", row.id).eq("recovery_sent", false);
      if (flagError) continue;
      await sendTemplate(row.delivery_email, intakeRecovery({ slug: row.offer_slug, sessionId: row.stripe_session_id }));
      sent += 1;
    }
    return { ran: true, sent, considered: (data || []).length };
  } catch (e) {
    console.error("[abandoned] sweep failed", e?.message);
    return { ran: false, reason: e?.message, sent: 0 };
  }
}

// Daily timer, started from the server entry point. Unref'd so it never holds the process
// open, and wrapped so a failure can never take the process down.
export function startAbandonedSweep() {
  const run = () => sweepAbandonedIntakes().catch((e) => console.error("[abandoned]", e?.message));
  const timer = setInterval(run, DAY_MS);
  timer.unref?.();
  setTimeout(run, 5 * 60 * 1000).unref?.();
  return timer;
}
