// the website's settings as they start: our business details (from the tax invoice we use today) and no year with TDS
// on suppliers. Safe to run again: a setting already saved is left as it is.
//   pnpm --filter @repo/database seed:settings

import { db } from "../index";
import { settingsTable } from "../schema";

const SEED = [
  {
    key: "company",
    value: {
      name: "Tejaswi Trading Company",
      address: "VMP Compound, Main Road, Hiriyur - 577598",
      phone: "+91 98451 12749",
      email: "utc@customerCare.in",
      state: "Karnataka",
      stateCode: "29",
      gstin: "29ADPR5634F1ZZ",
      fssai: "11217311000034",
      jurisdiction: "HIRIYUR",
    },
  },
  { key: "tds194qYears", value: [] },
];

async function main() {
  const added = await db.insert(settingsTable).values(SEED).onConflictDoNothing().returning({ key: settingsTable.key });
  console.log(added.length ? `Added: ${added.map((a) => a.key).join(", ")}` : "Settings already there.");
  process.exit(0);
}

void main();
