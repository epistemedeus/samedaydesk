import pg from "pg";
import { isSupabaseConfigured, supabaseAdmin } from "./supabase-admin.js";
import { careDatabaseOptions } from "./care-store.js";

let previewPool;
export async function saveMailEvent(row) {
  if (process.env.SDS_PRIVATE_PREVIEW === "1") {
    const options = careDatabaseOptions();
    if (!options) throw new Error("Mail preview requires its isolated database");
    previewPool ??= new pg.Pool({ ...options, max: 1,
      connectionTimeoutMillis: 2000, idleTimeoutMillis: 1000, allowExitOnIdle: true });
    await previewPool.query(`insert into public.mail_events(event_id,email_id,event_type,test)
      values ($1,$2,$3,true) on conflict (event_id) do nothing`, [row.event_id, row.email_id, row.event_type]);
  } else {
    if (!isSupabaseConfigured()) throw new Error("Mail event storage is not configured");
    const { error } = await supabaseAdmin().from("mail_events").upsert(row, { onConflict: "event_id", ignoreDuplicates: true });
    if (error) throw error;
  }
}
