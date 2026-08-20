// Order and intake storage for the four answer-correction offers.
//
// Every write degrades: when Supabase is not configured or errors, the payload is mailed to
// the admin address instead. A paid order or a completed intake must never be lost because
// a database was unreachable.
import { supabaseAdmin, isSupabaseConfigured } from "./supabase-admin.js";
import { notifyAdmin } from "./notify.js";

export function orderIdForSession(sessionId) {
  return `sdd_${sessionId}`;
}

export async function recordOrder({ sessionId, slug, label, amount, currency, deliveryEmail, siteUrl, brandName }) {
  const id = orderIdForSession(sessionId);
  const row = {
    id,
    offer: slug,
    offer_slug: slug,
    label,
    amount,
    currency: currency || "usd",
    status: "paid",
    stripe_session_id: sessionId,
    delivery_email: deliveryEmail || null,
    site_url: siteUrl || null,
    brand_name: brandName || null,
  };
  if (!isSupabaseConfigured()) {
    await notifyAdmin(
      `Paid order with no database: ${label}`,
      `<p>Storage was not configured when this order was paid. Record it by hand.</p><pre>${escapeHtml(JSON.stringify(row, null, 2))}</pre>`,
    );
    return { ok: false, id, stored: false };
  }
  try {
    const { data, error } = await supabaseAdmin()
      .from("orders")
      .upsert(row, { onConflict: "id", ignoreDuplicates: true })
      .select("id");
    if (error) throw error;
    return { ok: true, id, stored: true, isNew: Array.isArray(data) && data.length > 0 };
  } catch (e) {
    console.error("[orders] record failed", e?.message);
    await notifyAdmin(
      `Paid order that failed to store: ${label}`,
      `<p>${escapeHtml(e?.message || "unknown error")}</p><pre>${escapeHtml(JSON.stringify(row, null, 2))}</pre>`,
    );
    return { ok: false, id, stored: false };
  }
}

export async function getOrderBySession(sessionId) {
  if (!isSupabaseConfigured()) return null;
  try {
    const { data } = await supabaseAdmin()
      .from("orders")
      .select("id, offer_slug, status, delivery_email, site_url, brand_name, intake_completed_at")
      .eq("stripe_session_id", sessionId)
      .maybeSingle();
    return data || null;
  } catch (e) {
    console.error("[orders] lookup failed", e?.message);
    return null;
  }
}

export async function saveIntake({ sessionId, slug, fields }) {
  const id = orderIdForSession(sessionId);
  if (!isSupabaseConfigured()) {
    await notifyAdmin(
      `Intake complete with no database: ${slug}`,
      `<p>Storage was not configured. The buyer completed the intake below.</p><pre>${escapeHtml(JSON.stringify({ sessionId, slug, fields }, null, 2))}</pre>`,
    );
    return { ok: false, stored: false };
  }
  try {
    const sb = supabaseAdmin();
    const { error } = await sb.from("intakes").insert({ order_id: id, fields });
    if (error) throw error;
    await sb.from("orders").update({ status: "intake_complete", intake_completed_at: new Date().toISOString() }).eq("id", id);
    return { ok: true, stored: true };
  } catch (e) {
    console.error("[orders] intake save failed", e?.message);
    await notifyAdmin(
      `Intake that failed to store: ${slug}`,
      `<p>${escapeHtml(e?.message || "unknown error")}</p><pre>${escapeHtml(JSON.stringify({ sessionId, slug, fields }, null, 2))}</pre>`,
    );
    return { ok: false, stored: false };
  }
}

export function escapeHtml(s) {
  return String(s == null ? "" : s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);
}
