// a demo payment dated in September (wifi expense, ₹1,500 from cash), so Edit payment can be tried on a past month.
// Its transaction id goes in .demo-payments.json.
//   dotenv -e ../../.env -- tsx scripts/seed-demo-payment.ts

import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";

import { asc, db, eq } from "@repo/database";
import { ledgersTable, usersTable } from "@repo/database/schema";

import PaymentService from "../payment";

async function main() {
  const [admin] = await db.select().from(usersTable).where(eq(usersTable.role, "admin")).orderBy(asc(usersTable.createdAt)).limit(1);
  const [wifi] = await db.select({ id: ledgersTable.id }).from(ledgersTable).where(eq(ledgersTable.name, "wifi expense"));
  if (!admin || !wifi) throw new Error("No admin or no wifi expense ledger.");
  const saved = await new PaymentService().create(
    {
      saveKey: null,
      // 15 September 2026, noon in India
      dateTime: new Date("2026-09-15T06:30:00.000Z"),
      paidFor: "expense",
      paidToLedgerId: wifi.id,
      amount: 1500,
      settledIn: "cash",
      remarks: "Demo September wifi bill",
    } as never,
    admin as never,
  );
  // kept with the other demo rows
  const file = resolve(__dirname, "../../../.demo-payments.json");
  const ids = existsSync(file) ? (JSON.parse(readFileSync(file, "utf-8")) as string[]) : [];
  writeFileSync(file, JSON.stringify([...ids, saved.transactionId], null, 2));
  console.log(`payment ${saved.assignedId} (${saved.transactionId})`);
  process.exit(0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
