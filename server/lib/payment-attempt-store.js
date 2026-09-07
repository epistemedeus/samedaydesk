// Durable (or in-memory) store for server-owned checkout payment attempts.
import { randomUUID } from "node:crypto";
import { isSupabaseConfigured, supabaseAdmin } from "./supabase-admin.js";

const OPEN = "open";
const SUCCEEDED = "succeeded";
const CANCELED = "canceled";

export function createMemoryPaymentAttemptStore() {
  const rows = new Map();

  return {
    async getById(id) {
      return rows.get(id) || null;
    },
    async findOpenByFacts({ userId, offer, factsHash }) {
      let best = null;
      for (const row of rows.values()) {
        if (
          row.user_id === userId
          && row.offer === offer
          && row.facts_hash === factsHash
          && row.status === OPEN
        ) {
          if (!best || row.updated_at > best.updated_at) best = row;
        }
      }
      return best ? { ...best } : null;
    },
    async insert(row) {
      const now = new Date().toISOString();
      const saved = {
        ...row,
        created_at: row.created_at || now,
        updated_at: now,
      };
      rows.set(saved.id, saved);
      return { ...saved };
    },
    async update(id, patch) {
      const existing = rows.get(id);
      if (!existing) return null;
      const saved = {
        ...existing,
        ...patch,
        updated_at: new Date().toISOString(),
      };
      rows.set(id, saved);
      return { ...saved };
    },
  };
}

export function createSupabasePaymentAttemptStore(getAdmin = supabaseAdmin) {
  return {
    async getById(id) {
      const { data, error } = await getAdmin()
        .from("payment_attempts")
        .select("*")
        .eq("id", id)
        .maybeSingle();
      if (error) throw error;
      return data || null;
    },
    async findOpenByFacts({ userId, offer, factsHash }) {
      const { data, error } = await getAdmin()
        .from("payment_attempts")
        .select("*")
        .eq("user_id", userId)
        .eq("offer", offer)
        .eq("facts_hash", factsHash)
        .eq("status", OPEN)
        .order("updated_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      if (error) throw error;
      return data || null;
    },
    async insert(row) {
      const { data, error } = await getAdmin()
        .from("payment_attempts")
        .insert(row)
        .select("*")
        .single();
      if (error) throw error;
      return data;
    },
    async update(id, patch) {
      const { data, error } = await getAdmin()
        .from("payment_attempts")
        .update({ ...patch, updated_at: new Date().toISOString() })
        .eq("id", id)
        .select("*")
        .maybeSingle();
      if (error) throw error;
      return data || null;
    },
  };
}

export const paymentAttemptStoreDeps = {
  _memorySingleton: null,
  getStore() {
    if (isSupabaseConfigured()) return createSupabasePaymentAttemptStore();
    if (!this._memorySingleton) this._memorySingleton = createMemoryPaymentAttemptStore();
    return this._memorySingleton;
  },
  newAttemptId() {
    return `attempt_${randomUUID()}`;
  },
};

export const PAYMENT_ATTEMPT_STATUS = { OPEN, SUCCEEDED, CANCELED };
