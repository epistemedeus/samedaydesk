import { isSupabaseConfigured, supabaseAdmin } from "./supabase-admin.js";
import { sharedCarePool, careTable } from "./care-database.js";

export async function saveMailEvent(row) {
  const pool = sharedCarePool();
  if (pool) {
    await pool.query(`insert into ${careTable("mail_events")}(event_id,email_id,event_type,test)
      values ($1,$2,$3,$4) on conflict (event_id) do nothing`, [row.event_id, row.email_id, row.event_type, process.env.SDS_PRIVATE_PREVIEW === "1" || row.test === true]);
  } else {
    if (process.env.SDS_PRIVATE_PREVIEW === "1") throw new Error("Mail preview requires its isolated database");
    if (!isSupabaseConfigured()) throw new Error("Mail event storage is not configured");
    const { error } = await supabaseAdmin().from("mail_events").upsert(row, { onConflict: "event_id", ignoreDuplicates: true });
    if (error) throw error;
  }
}
