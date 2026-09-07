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
    async findOpenByOffer({ userId, offer }) {
      let best = null;
      for (const row of rows.values()) {
        if (
          row.user_id === userId
          && row.offer === offer
          && row.status === OPEN
        ) {
          if (!best || row.updated_at > best.updated_at) best = row;
        }
      }
      return best ? { ...best } : null;
    },
    async insert(row) {
      // Match the database's one-open-purchase-per-user/offer constraint.
      for (const existing of rows.values()) {
        if (existing.user_id === row.user_id && existing.offer === row.offer && existing.status === OPEN) {
          return { ...existing };
        }
      }
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
    async freezeIntake(id, userId, snapshot, hash) {
      const row = rows.get(id);
      if (!row || row.user_id !== userId) return null;
      if (row.status === OPEN && !row.intake_snapshot) {
        return this.update(id, { intake_snapshot: snapshot, intake_hash: hash });
      }
      return { ...row };
    },
  };
}

export function createSupabasePaymentAttemptStore(getAdmin = supabaseAdmin) {
  return {
    async freezeIntake(id, userId, snapshot, hash) {
      const { data, error } = await getAdmin().from("payment_attempts")
        .update({ intake_snapshot: snapshot, intake_hash: hash, updated_at: new Date().toISOString() })
        .eq("id", id).eq("user_id", userId).eq("status", OPEN)
        .is("intake_snapshot", null).select("*").maybeSingle();
      if (error) throw error;
      return data || this.getById(id);
    },
    async getById(id) {
      const { data, error } = await getAdmin()
        .from("payment_attempts")
        .select("*")
        .eq("id", id)
        .maybeSingle();
      if (error) throw error;
      return data || null;
    },
    async findOpenByOffer({ userId, offer }) {
      const { data, error } = await getAdmin()
        .from("payment_attempts")
        .select("*")
        .eq("user_id", userId)
        .eq("offer", offer)
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
      if (error?.code === "23505") {
        // Another request/process won admission. Never mint a second Stripe key.
        const existing = await this.findOpenByOffer({ userId: row.user_id, offer: row.offer });
        if (existing) return existing;
      }
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
