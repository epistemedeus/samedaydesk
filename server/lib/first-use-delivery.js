import { createHash } from "node:crypto";
import { AGENT_FIRST_USE_REPORT, CURRENCY, getOffer } from "../pricing.js";
import { publicFirstUseUrl } from "./first-use-intake.js";
import { supabaseAdmin } from "./supabase-admin.js";

export const firstUseReportMaxBytes = 10 * 1024 * 1024; // existing intake-uploads bucket
const orderId = /^order_pi_[A-Za-z0-9_]{1,128}$/;
const pdfDigest = value => createHash("sha256").update(value).digest("hex");
const reportPath = id => `agent-first-use-reports/${id}/report.pdf`;
const offer = AGENT_FIRST_USE_REPORT;
const cents = getOffer(offer).amount;
const bucket = sb => sb.storage.from("intake-uploads");

async function lookup(sb, id, uid) {
  if (typeof id !== "string" || !orderId.test(id)) return null;
  const query = sb.from("orders").select("id,user_id,offer,label,amount,currency,status,meta")
    .eq("id", id).eq("offer", offer).eq("amount", cents).eq("currency", CURRENCY);
  if (uid) query.eq("user_id", uid);
  const { data, error } = await query.maybeSingle();
  if (error) throw error;
  return data;
}

// The existing received orders are the queue. The limit is a batch size.
export async function firstUseWorkQueue({ sb = supabaseAdmin() } = {}) {
  const { data, error } = await sb.from("orders").select("id,created_at,status,meta")
    .eq("offer", offer).eq("status", "received").eq("amount", cents).eq("currency", CURRENCY)
    .order("created_at", { ascending: true }).order("id", { ascending: true }).limit(25);
  if (error) throw error;
  return data.map(row => ({ id: row.id, createdAt: row.created_at, intake: row.meta?.intake }));
}

function deliveryFacts({ recordingUrl, recordingAccessConfirmed, fixPrUrl, pdf }) {
  const recording = publicFirstUseUrl(recordingUrl);
  const fix = fixPrUrl === undefined || fixPrUrl === null ? null : publicFirstUseUrl(fixPrUrl);
  if (!recording || recordingAccessConfirmed !== true ||
      (fixPrUrl != null && (!fix || !/^https:\/\/github\.com\/[\w.-]+\/[\w.-]+\/pull\/[1-9][0-9]*$/.test(fix))) ||
      !Buffer.isBuffer(pdf) || pdf.length < 6 || pdf.length > firstUseReportMaxBytes ||
      pdf.subarray(0, 5).toString() !== "%PDF-") throw new Error("Provide a PDF report and an owner-verified private recording");
  return { reportSha256: pdfDigest(pdf), recordingUrl: recording, fixPrUrl: fix };
}

function sameDelivery(existing, facts) {
  return existing?.reportSha256 === facts.reportSha256 && existing.recordingUrl === facts.recordingUrl &&
    existing.fixPrUrl === facts.fixPrUrl;
}

// Staff uses the existing service-role owner, with a real report and private
// recording ready for this recipient. The buyer cannot write this bucket prefix.
export async function deliverFirstUseReport({ id, sb = supabaseAdmin(), ...input }) {
  const facts = deliveryFacts(input);
  const row = await lookup(sb, id);
  if (row?.status === "delivered" && sameDelivery(row.meta?.first_use_delivery, facts)) return { status: "delivered", reused: true };
  if (row?.status !== "received" || !row.meta?.intake?.targetUrl || !row.meta.intake.details) {
    throw new Error("The paid first-use order cannot accept this delivery");
  }
  const storage = bucket(sb);
  const path = reportPath(id);
  try {
    const { error } = await storage.upload(path, input.pdf, { contentType: "application/pdf", upsert: false });
    if (error) throw error;
  } catch {
    // A duplicate or unknown upload result is read back at the same path.
    const { data, error } = await storage.download(path);
    if (error || !data || data.size !== input.pdf.length ||
        pdfDigest(Buffer.from(await data.arrayBuffer())) !== facts.reportSha256) throw new Error("Report upload not received");
  }
  try {
    const { data, error } = await sb.from("orders")
      .update({ status: "delivered", meta: { ...row.meta, first_use_delivery: facts } })
      .eq("id", id).eq("offer", offer).eq("user_id", row.user_id).eq("status", "received")
      .select("id").maybeSingle();
    if (!error && data?.id === id) return { status: "delivered", reused: false };
  } catch {
    // The update may have committed. Receive it without rewriting a delivery.
  }
  const stored = await lookup(sb, id);
  if (stored?.status === "delivered" && sameDelivery(stored.meta?.first_use_delivery, facts)) return { status: "delivered", reused: true };
  throw new Error("Delivery not received");
}

export async function readFirstUseDelivery({ id, uid, sb = supabaseAdmin() }) {
  if (!uid) return null;
  const row = await lookup(sb, id, uid);
  if (!row) return null;
  const facts = row.meta?.first_use_delivery;
  if (row.status !== "delivered" || !/^[a-f0-9]{64}$/.test(facts?.reportSha256 ?? "") || !publicFirstUseUrl(facts.recordingUrl)) {
    return { orderId: id, status: row.status, delivery: null };
  }
  const { data, error } = await bucket(sb).createSignedUrl(reportPath(id), 300);
  if (error || !data?.signedUrl) throw new Error("Private report unavailable");
  return { orderId: id, status: row.status, delivery: { ...facts, reportUrl: data.signedUrl, reportUrlExpiresIn: 300 } };
}
