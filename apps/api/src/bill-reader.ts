import { readFile } from "node:fs/promises";

import { logger } from "@repo/logger";

import { env } from "./env";

// what a bill's photo or PDF is read for: its number and date, each null when the model couldn't find it (or what it
// found isn't one)
export type BillRead = { number: string | null; date: string | null };

const NOTHING: BillRead = { number: null, date: null };

// the day it is in India, as YYYY-MM-DD
const indiaToday = () => new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Kolkata" }).format(new Date());

// what the model is asked: only the two fields, as JSON. Indian bills write the day first
const PROMPT = `This is a supplier's GST tax invoice from India. Find the invoice (bill) number and the invoice date.
Reply with only this JSON and nothing else:
{"invoiceNumber": "<as printed, or null>", "invoiceDate": "<YYYY-MM-DD, or null>"}
Dates on Indian invoices are written day first (13/11/2026 is 13 November 2026). Don't guess: use null when unsure.`;

// a number as GST allows it: up to 16 capital letters, digits, / and -
function cleanNumber(raw: unknown): string | null {
  if (typeof raw !== "string") return null;
  const n = raw.toUpperCase().replace(/\s+/g, "");
  return /^[A-Z0-9/-]{1,16}$/.test(n) ? n : null;
}

// a real day, this century, not after today
function cleanDate(raw: unknown): string | null {
  if (typeof raw !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(raw)) return null;
  const d = new Date(`${raw}T12:00:00Z`);
  if (Number.isNaN(d.getTime()) || d.toISOString().slice(0, 10) !== raw) return null;
  return raw >= "2000-01-01" && raw <= indiaToday() ? raw : null;
}

// the first {...} in the reply, parsed (free models sometimes wrap it in words or a code fence)
function firstJson(text: string): Record<string, unknown> | null {
  const match = text.match(/\{[\s\S]*\}/);
  if (!match) return null;
  try {
    return JSON.parse(match[0]) as Record<string, unknown>;
  } catch {
    return null;
  }
}

// reads a stored bill with a free vision model on OpenRouter (the first in OPENROUTER_MODELS that answers; the others
// are its fallbacks). A photo goes as an image; a PDF as a file, its text taken out by OpenRouter's free parser. With no
// key, or when the model fails or times out, nothing is read: the bill's number and date are typed as before
export async function readBill(path: string, contentType: string): Promise<BillRead> {
  if (!env.OPENROUTER_API_KEY) return NOTHING;
  const data = (await readFile(path)).toString("base64");
  const pdf = contentType === "application/pdf";
  const attachment = pdf
    ? { type: "file", file: { filename: "bill.pdf", file_data: `data:application/pdf;base64,${data}` } }
    : { type: "image_url", image_url: { url: `data:${contentType};base64,${data}` } };
  try {
    const res = await fetch("https://openrouter.ai/api/v1/chat/completions", {
      method: "POST",
      headers: { Authorization: `Bearer ${env.OPENROUTER_API_KEY}`, "Content-Type": "application/json", "X-Title": "Bill reader" },
      body: JSON.stringify({
        models: env.OPENROUTER_MODELS.split(",").map((m) => m.trim()).filter(Boolean),
        temperature: 0,
        messages: [{ role: "user", content: [{ type: "text", text: PROMPT }, attachment] }],
        ...(pdf ? { plugins: [{ id: "file-parser", pdf: { engine: "pdf-text" } }] } : {}),
      }),
      signal: AbortSignal.timeout(30_000),
    });
    if (!res.ok) {
      logger.warn("Bill reader: OpenRouter refused", { status: res.status });
      return NOTHING;
    }
    const body = (await res.json()) as { choices?: { message?: { content?: string } }[] };
    const found = firstJson(body.choices?.[0]?.message?.content ?? "");
    if (!found) return NOTHING;
    return { number: cleanNumber(found.invoiceNumber), date: cleanDate(found.invoiceDate) };
  } catch (error) {
    logger.warn("Bill reader: couldn't read the bill", { error });
    return NOTHING;
  }
}
