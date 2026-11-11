// India Post's free PIN directory: a PIN's post offices, each with its block (the taluk, which is the town people write)
// and its district. The town is the block most of its offices share ("Hiriyur"), or the first office's name when no
// block is given; the district is the district ("Chitradurga"). Null when the PIN isn't found
// A town or district India Post still knows by an old name (Tumkur) comes back as today's (Tumakuru)
import { currentTownName, townNames } from "@repo/trpc/client";

type Office = { Name: string; Block: string; District: string; State: string };
type TownOffice = Office & { Pincode: string; BranchType: string };

// the other way round: a town's PIN, from the post office named exactly after it, under any name the town goes by
// (Tumakuru is looked up as Tumkur too). Several offices with that name (villages called the same in other
// districts): its one head post office; otherwise null unless they share one PIN, as a place with several can't be
// guessed
export async function indiaPostTownPin(city: string, signal?: AbortSignal) {
  for (const name of townNames(city)) {
    const r = await fetch(`https://api.postalpincode.in/postoffice/${encodeURIComponent(name)}`, { signal });
    if (!r.ok) continue;
    const found = (await r.json()) as { Status: string; PostOffice: TownOffice[] | null }[];
    const offices = (found?.[0]?.Status === "Success" ? (found[0].PostOffice ?? []) : []).filter(
      (o) => o.Name.trim().toLowerCase() === name.toLowerCase(),
    );
    const heads = offices.filter((o) => o.BranchType === "Head Post Office");
    const pins = [...new Set(offices.map((o) => o.Pincode))];
    const office = heads.length === 1 ? heads[0]! : pins.length === 1 ? offices[0]! : null;
    if (office)
      return {
        postalCode: office.Pincode,
        district: currentTownName(office.District).slice(0, 100),
        state: office.State.slice(0, 100),
      };
  }
  return null;
}

export async function indiaPostPlace(pin: string, signal?: AbortSignal) {
  const r = await fetch(`https://api.postalpincode.in/pincode/${pin}`, { signal });
  if (!r.ok) return null;
  const found = (await r.json()) as { Status: string; PostOffice: Office[] | null }[];
  const offices = found?.[0]?.Status === "Success" ? (found[0].PostOffice ?? []) : [];
  if (offices.length === 0) return null;

  // the block most offices share, leaving out "NA"
  const blocks = new Map<string, number>();
  for (const o of offices) if (o.Block && o.Block !== "NA") blocks.set(o.Block, (blocks.get(o.Block) ?? 0) + 1);
  const block = [...blocks].sort((a, b) => b[1] - a[1])[0]?.[0];

  return {
    city: currentTownName(block ?? offices[0]!.Name).slice(0, 100),
    district: currentTownName(offices[0]!.District).slice(0, 100),
    state: offices[0]!.State.slice(0, 100),
  };
}
