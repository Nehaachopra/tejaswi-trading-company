// demo employees, so the salary table has something to show: each with a joining date a few months back (so several
// months are owed), a pay and a pay day, some with an advance; then every month due is posted. Their party ids go in
// .demo-employees.json at the repo root. Safe to run again: phones already in use are skipped.
//   pnpm --filter @repo/services exec dotenv -e ../../.env -- tsx scripts/seed-demo-employees.ts

import { writeFileSync } from "node:fs";
import { resolve } from "node:path";

import { asc, db, eq, sql } from "@repo/database";
import { employeesTable, partiesTable, usersTable } from "@repo/database/schema";

import PartyService from "../party";
import SalaryService from "../salary";

// name, short name, phone, joined, pay a month, pay day, an advance given (0 for none)
const DEMO = [
  { name: "Ramesh Kumar", short: "RAMESH", phone: "9000000101", joined: "2026-07-01", pay: 18000, payDay: 1, advance: 3000 },
  { name: "Jeevan Shetty", short: "JEEVAN", phone: "9000000102", joined: "2026-09-10", pay: 22000, payDay: 5, advance: 0 },
  { name: "Shankar Gowda", short: "SHANKAR", phone: "9000000103", joined: "2026-08-01", pay: 15000, payDay: 1, advance: 5000 },
  { name: "Lakshmi Devi", short: "LAKSHMI", phone: "9000000104", joined: "2026-10-01", pay: 14000, payDay: 7, advance: 0 },
  { name: "Manjunath Rao", short: "MANJU", phone: "9000000105", joined: "2026-06-15", pay: 16500, payDay: 1, advance: 2000 },
];

async function main() {
  const [admin] = await db.select().from(usersTable).where(eq(usersTable.role, "admin")).orderBy(asc(usersTable.createdAt)).limit(1);
  if (!admin) throw new Error("No admin user.");
  const actor = admin as never;
  const parties = new PartyService();
  const salary = new SalaryService();
  const ids: string[] = [];

  for (const d of DEMO) {
    const [taken] = await db.select({ id: partiesTable.id }).from(partiesTable).where(eq(partiesTable.phone, d.phone));
    if (taken) {
      console.log(`skip ${d.name}: phone in use`);
      ids.push(taken.id);
      continue;
    }
    const p = await parties.create(
      {
        details: { name: d.name, shortName: d.short, phone: d.phone, email: null, pan: null, remarks: null, transportDeclaration: false },
        types: ["employee"],
        employment: { joiningDate: d.joined, monthlySalary: d.pay, payDay: d.payDay },
        addresses: [],
      } as never,
      actor,
    );
    ids.push(p.id);
    // added to the app the day they joined, so posting starts from their joining month
    await db.update(employeesTable).set({ createdAt: new Date(`${d.joined}T00:00:00+05:30`) }).where(eq(employeesTable.partyId, p.id));
    console.log(`added ${d.name}`);

    // an advance a few days after joining, taken back from their next posted month
    if (d.advance > 0) {
      const [e] = await db.select({ id: employeesTable.id }).from(employeesTable).where(eq(employeesTable.partyId, p.id));
      try {
        await salary.pay(
          {
            saveKey: null,
            dateTime: new Date(`${d.joined}T12:00:00+05:30`),
            employeeId: e!.id,
            kind: "advance",
            amount: d.advance,
            settledIn: "cash",
            bankDetailsId: null,
            referenceNumber: null,
            remarks: "Demo advance",
          },
          actor,
        );
        console.log(`  advance ₹${d.advance}`);
      } catch (err) {
        console.log(`  advance skipped: ${(err as Error).message}`);
      }
    }
  }

  const posted = await salary.postDue();
  console.log(`posted ${posted} months`);
  writeFileSync(resolve(__dirname, "../../../.demo-employees.json"), JSON.stringify(ids, null, 2) + "\n");
  void sql;
  process.exit(0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
