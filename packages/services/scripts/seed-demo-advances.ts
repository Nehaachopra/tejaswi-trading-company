// a fresh advance for some demo employees (from .demo-employees.json), dated today from cash, so the salary table's
// take-back toggle has something to show.
//   dotenv -e ../../.env -- tsx scripts/seed-demo-advances.ts

import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { asc, db, eq, inArray } from "@repo/database";
import { employeesTable, usersTable } from "@repo/database/schema";

import SalaryService from "../salary";

// by party, in .demo-employees.json order: the advance to give (0 for none)
const AMOUNTS = [3000, 0, 5000, 1500, 2000];

async function main() {
  const [admin] = await db.select().from(usersTable).where(eq(usersTable.role, "admin")).orderBy(asc(usersTable.createdAt)).limit(1);
  const partyIds = JSON.parse(readFileSync(resolve(__dirname, "../../../.demo-employees.json"), "utf-8")) as string[];
  const rows = await db.select({ id: employeesTable.id, partyId: employeesTable.partyId }).from(employeesTable).where(inArray(employeesTable.partyId, partyIds));
  const salary = new SalaryService();
  for (const [i, partyId] of partyIds.entries()) {
    const e = rows.find((r) => r.partyId === partyId);
    const amount = AMOUNTS[i] ?? 0;
    if (!e || amount <= 0) continue;
    try {
      const s = await salary.pay(
        { saveKey: null, dateTime: new Date(), employeeId: e.id, kind: "advance", amount, settledIn: "cash", bankDetailsId: null, referenceNumber: null, remarks: "Demo advance" },
        admin as never,
      );
      console.log(`advance ₹${amount}: ${s.assignedId}`);
    } catch (err) {
      console.log(`skipped: ${(err as Error).message}`);
    }
  }
  process.exit(0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
