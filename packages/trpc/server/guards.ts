import { TRPCError } from "@trpc/server";

// guards for recording transactions: a per-user limit on saves, one save per form (a retried save gets the first
// one's result), and the dates a transaction may carry. Kept in memory: the API runs as one process

const MINUTE_MS = 60 * 1000;

// saves a user may make in a minute: plenty for a busy counter, too few for a script filling the books with junk
const SAVES_PER_MINUTE = 20;
const savesBy = new Map<string, number[]>();

export function limitSaves(userId: string) {
  const now = Date.now();
  const recent = (savesBy.get(userId) ?? []).filter((at) => now - at < MINUTE_MS);
  if (recent.length >= SAVES_PER_MINUTE) {
    savesBy.set(userId, recent);
    throw new TRPCError({ code: "TOO_MANY_REQUESTS", message: "Too many saves. Please wait a minute and try again." });
  }
  recent.push(now);
  savesBy.set(userId, recent);
}

// one save per form: the form sends a key made when it opened; a second save with the same key (a retry after the
// connection dropped, a double tap) gets the first one's result instead of a second transaction. A failed save is
// forgotten, so it can be tried again. Kept for an hour
const KEY_KEEP_MS = 60 * MINUTE_MS;
const saved = new Map<string, { at: number; result: Promise<unknown> }>();

export function onceFor<T>(userId: string, saveKey: string, save: () => Promise<T>): Promise<T> {
  const now = Date.now();
  for (const [k, v] of saved) if (now - v.at > KEY_KEEP_MS) saved.delete(k);
  const key = `${userId}|${saveKey}`;
  const known = saved.get(key);
  if (known) return known.result as Promise<T>;
  const result = save();
  saved.set(key, { at: now, result });
  result.catch(() => saved.delete(key));
  return result;
}

// the day a moment falls on in India, as YYYY-MM-DD
const indiaDay = (d: Date) => new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Kolkata" }).format(d);

// how far back staff may date a transaction; the admin may go back as far as needed (old books being entered)
export const STAFF_DAYS_BACK = 7;

// a transaction's date: never after today (India); staff no further back than STAFF_DAYS_BACK days
export function checkDate(dateTime: Date, role: string) {
  const day = indiaDay(dateTime);
  const today = indiaDay(new Date());
  if (day > today) throw new TRPCError({ code: "BAD_REQUEST", message: "The date can't be after today." });
  if (role !== "admin") {
    const earliest = indiaDay(new Date(Date.now() - STAFF_DAYS_BACK * 24 * 60 * MINUTE_MS));
    if (day < earliest) throw new TRPCError({ code: "BAD_REQUEST", message: `Staff can date it at most ${STAFF_DAYS_BACK} days back.` });
  }
}
