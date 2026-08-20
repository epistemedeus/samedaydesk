// The answer panel: five frozen questions, asked once each through the OpenAI Responses
// API with web search on. Every card says which surface produced it and when.
//
// The prompts are not written here. They come from shared/offers.json, which carries the
// frozen panel, so the free panel and the paid census ask the same questions.
import { RECORD } from "../pricing.js";
import { openaiModel } from "./panel.js";

const API_URL = "https://api.openai.com/v1/responses";
const TIMEOUT_MS = 45000;

export function fillSlots(template, slots) {
  return template.replace(/\{([A-Z_]+)\}/g, (whole, key) => slots[key] ?? whole);
}

// Which of the five frozen prompts can be asked with the slots this visitor gave us.
// A prompt with a missing slot uses its published fallback, or is skipped and said so.
export function planPrompts(slots) {
  return RECORD.panel.prompts.map((p) => {
    const missing = (p.requires || []).filter((k) => !slots[k]);
    if (!missing.length) return { slot: p.slot, text: fillSlots(p.text, slots), asked: true };
    if (p.fallback) {
      const fallbackMissing = [...p.fallback.matchAll(/\{([A-Z_]+)\}/g)].map((m) => m[1]).filter((k) => !slots[k]);
      if (!fallbackMissing.length) return { slot: p.slot, text: fillSlots(p.fallback, slots), asked: true, usedFallback: true };
      return { slot: p.slot, asked: false, skippedFor: [...new Set([...missing, ...fallbackMissing])] };
    }
    return { slot: p.slot, asked: false, skippedFor: missing };
  });
}

// Mechanical labels only. The free panel reports what is checkable from the text; a human
// assigns the defect word in the paid audit. Guessing here would be the thing we sell
// against.
export function labelAnswer({ answer, brand, fact }) {
  const text = String(answer || "").toLowerCase();
  const labels = [];
  const named = brand && text.includes(String(brand).toLowerCase());
  labels.push(named ? "named" : "silent");
  if (fact) {
    const factText = String(fact).toLowerCase();
    const words = factText.split(/[^a-z0-9]+/).filter((w) => w.length > 3);
    const hits = words.filter((w) => text.includes(w)).length;
    labels.push(words.length && hits / words.length >= 0.6 ? "carries your fact" : "does not carry your fact");
  }
  return labels;
}

export async function askOne({ prompt, model, apiKey, signal }) {
  const body = {
    model,
    input: prompt,
    tools: [{ type: "web_search" }],
    temperature: 0,
  };
  const res = await fetch(API_URL, {
    method: "POST",
    signal,
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}` },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const detail = await res.text().catch(() => "");
    throw new Error(`OpenAI responded ${res.status}: ${detail.slice(0, 200)}`);
  }
  const data = await res.json();
  return { text: extractText(data), raw: { id: data.id, model: data.model } };
}

// The Responses API returns a content tree. Take the output text and nothing else.
export function extractText(data) {
  if (typeof data?.output_text === "string" && data.output_text.trim()) return data.output_text.trim();
  const chunks = [];
  for (const item of data?.output || []) {
    for (const c of item?.content || []) {
      if (typeof c?.text === "string") chunks.push(c.text);
      else if (typeof c?.text?.value === "string") chunks.push(c.text.value);
    }
  }
  return chunks.join("\n").trim();
}

export async function runPanel({ slots, brand, fact, onCard }) {
  const apiKey = process.env.OPENAI_API_KEY;
  const model = openaiModel();
  const plan = planPrompts(slots);
  const cards = [];
  for (const step of plan) {
    if (!step.asked) {
      const card = { ...step, engine: null, askedAt: null };
      cards.push(card);
      await onCard?.(card);
      continue;
    }
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
    const askedAt = new Date().toISOString();
    try {
      const { text, raw } = await askOne({ prompt: step.text, model, apiKey, signal: controller.signal });
      const card = {
        ...step,
        answer: text,
        labels: labelAnswer({ answer: text, brand, fact }),
        engine: RECORD.panel.engine_label.replace("{model}", raw.model || model),
        askedAt,
      };
      cards.push(card);
      await onCard?.(card);
    } catch (e) {
      const card = { ...step, error: e?.message || "the request failed", engine: RECORD.panel.engine_label.replace("{model}", model), askedAt };
      cards.push(card);
      await onCard?.(card);
    } finally {
      clearTimeout(timer);
    }
  }
  return cards;
}
