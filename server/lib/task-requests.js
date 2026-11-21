// Custom task requests: validated, stored, confirmed to the requester by email and announced to
// the desk. The configured private Care database owns new release requests; legacy
// Supabase and local memory remain available when no Care database is configured.
import { randomUUID } from "node:crypto";
import { isSupabaseConfigured, supabaseAdmin } from "./supabase-admin.js";

import { sharedCarePool, careTable } from "./care-database.js";

const EMAIL = /^[^\s@]{1,64}@[^\s@]{1,190}\.[^\s@]{2,}$/;

/** Returns { request } with clean fields, or { error } naming the first field to fix. */
export function validateTaskRequest(body) {
  const email = String(body?.email ?? "").trim().toLowerCase();
  const website = String(body?.website ?? "").trim();
  const task = String(body?.task ?? "").trim();
  if (!EMAIL.test(email) || email.length > 254) return { error: "email" };
  if (website.length > 300) return { error: "website" };
  if (task.length < 10 || task.length > 4000) return { error: "task" };
  // A filled honeypot field means a form robot; it is accepted silently and not stored.
  if (String(body?.company_fax ?? "").trim()) return { error: "robot" };
  return { request: { email, website: website || null, task } };
}

export function createMemoryTaskRequestStore() {
  const rows = [];
  return {
    rows,
    async insert(request) {
      const row = { id: randomUUID(), created_at: new Date().toISOString(), status: "received", ...request };
      rows.push(row);
      return row;
    },
  };
}

export function createSupabaseTaskRequestStore() {
  return {
    async insert(request) {
      const { data, error } = await supabaseAdmin().from("task_requests").insert(request).select("id, created_at").single();
      if (error) throw new Error(error.message);
      return { ...request, ...data, status: "received" };
    },
  };
}

export function defaultTaskRequestStore() {
  const pool = sharedCarePool();
  if (pool) return { insert: async (request) => (await pool.query(
    `insert into ${careTable("task_requests")}(email,website,task) values ($1,$2,$3) returning *`,
    [request.email, request.website, request.task])).rows[0] };
  return process.env.SDS_PRIVATE_PREVIEW !== "1" && isSupabaseConfigured() ? createSupabaseTaskRequestStore() : createMemoryTaskRequestStore();
}
