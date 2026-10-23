import { sql } from "@repo/database";
import { assignedIdCountersTable } from "@repo/database/schema";

import type { Tx } from "../stock/engine";

export type Prefix = "SA" | "PU" | "SR" | "PR" | "RE" | "PA" | "DE" | "WD" | "TR" | "DR" | "OT" | "SL" | "SO" | "PO" | "OB";

// the year and month of a date in India, where the business is
const indiaMonth = new Intl.DateTimeFormat("en-IN", { timeZone: "Asia/Kolkata", year: "numeric", month: "2-digit" });

// numbers like OB26100001: the prefix, the year and month of the transaction's own date, then its number
// in that month. The counter goes up inside the save, so a failed save never uses up a number and two
// saves at once never share one
export default class AssignedIdCounter {
  async next(tx: Tx, prefix: Prefix, date: Date) {
    const parts = indiaMonth.formatToParts(date);
    const year = Number(parts.find((p) => p.type === "year")!.value);
    const month = Number(parts.find((p) => p.type === "month")!.value);

    const [row] = await tx
      .insert(assignedIdCountersTable)
      .values({ prefix, year, month, lastNumber: 1 })
      .onConflictDoUpdate({
        target: [assignedIdCountersTable.prefix, assignedIdCountersTable.year, assignedIdCountersTable.month],
        set: { lastNumber: sql`${assignedIdCountersTable.lastNumber} + 1` },
      })
      .returning({ lastNumber: assignedIdCountersTable.lastNumber });

    return `${prefix}${String(year % 100).padStart(2, "0")}${String(month).padStart(2, "0")}${String(row!.lastNumber).padStart(4, "0")}`;
  }
}
