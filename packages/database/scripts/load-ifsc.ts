// loads every bank branch in India into ifsc_branches from Razorpay's open IFSC dataset (MIT licence,
// github.com/razorpay/ifsc): the latest release's IFSC.csv, read straight from GitHub and not kept on disk.
// Run again to refresh it: pnpm --filter @repo/database ifsc:load
import { sql } from "drizzle-orm";

import { db } from "../index";
import { ifscBranchesTable } from "../schema";

const RELEASES = "https://api.github.com/repos/razorpay/ifsc/releases/latest";
const BATCH = 2000;

// one CSV line's fields (quoted fields may hold commas and doubled quotes)
function fields(line: string) {
  const out: string[] = [];
  let field = "";
  let quoted = false;
  for (let i = 0; i < line.length; i++) {
    const c = line[i]!;
    if (quoted) {
      if (c === '"' && line[i + 1] === '"') {
        field += '"';
        i++;
      } else if (c === '"') quoted = false;
      else field += c;
    } else if (c === '"') quoted = true;
    else if (c === ",") {
      out.push(field);
      field = "";
    } else field += c;
  }
  out.push(field);
  return out;
}

// the file's lines, keeping a line break inside quotes as part of its field
function* lines(text: string) {
  let start = 0;
  let quoted = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (c === '"') quoted = !quoted;
    else if (c === "\n" && !quoted) {
      yield text.slice(start, i).replace(/\r$/, "");
      start = i + 1;
    }
  }
  if (start < text.length) yield text.slice(start);
}

const clip = (value: string | undefined, max: number) => {
  const v = (value ?? "").trim();
  return v === "" || v.toUpperCase() === "NA" ? null : v.slice(0, max);
};

async function main() {
  // the latest release and its IFSC.csv
  const release = (await (await fetch(RELEASES, { headers: { Accept: "application/vnd.github+json" } })).json()) as {
    tag_name: string;
    assets: { name: string; browser_download_url: string }[];
  };
  const asset = release.assets.find((a) => a.name === "IFSC.csv");
  if (!asset) throw new Error("The release has no IFSC.csv");
  console.log(`downloading ${release.tag_name} IFSC.csv`);
  const text = await (await fetch(asset.browser_download_url)).text();

  // the columns by name, then a row per branch
  const all = lines(text);
  const header = fields(all.next().value as string).map((h) => h.trim().toUpperCase());
  const col = (name: string) => header.indexOf(name);
  const at = { bank: col("BANK"), ifsc: col("IFSC"), branch: col("BRANCH"), city: col("CITY"), district: col("DISTRICT"), state: col("STATE") };
  if (Object.values(at).some((i) => i < 0)) throw new Error(`Unexpected columns: ${header.join(", ")}`);

  const rows: (typeof ifscBranchesTable.$inferInsert)[] = [];
  const seen = new Set<string>();
  for (const line of all) {
    if (line.trim() === "") continue;
    const f = fields(line);
    const ifsc = (f[at.ifsc] ?? "").trim().toUpperCase();
    if (!/^[A-Z]{4}0[A-Z0-9]{6}$/.test(ifsc) || seen.has(ifsc)) continue;
    seen.add(ifsc);
    const bank = clip(f[at.bank], 150);
    const branch = clip(f[at.branch], 150);
    if (!bank || !branch) continue;
    rows.push({ ifsc, bank, branch, city: clip(f[at.city], 100), district: clip(f[at.district], 100), state: clip(f[at.state], 100) });
  }
  console.log(`${rows.length} branches read`);

  // replace the old list with the new one in one go
  await db.transaction(async (tx) => {
    await tx.execute(sql`delete from ifsc_branches`);
    for (let i = 0; i < rows.length; i += BATCH) await tx.insert(ifscBranchesTable).values(rows.slice(i, i + BATCH));
  });
  console.log(`loaded ${rows.length} branches`);
}

main().then(
  () => process.exit(0),
  (e) => {
    console.error(e);
    process.exit(1);
  },
);
