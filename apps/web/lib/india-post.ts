// India Post's free PIN directory: a PIN's post offices, each with its block (the taluk, which is the town people write)
// and its district. The town is the block most of its offices share ("Hiriyur"), or the first office's name when no
// block is given; the district is the district ("Chitradurga"). Null when the PIN isn't found
type Office = { Name: string; Block: string; District: string; State: string };

// the other way round: a town's PIN, from the post office named exactly after it. Null unless that's one PIN, as a
// place with several can't be guessed
export async function indiaPostTownPin(city: string, signal?: AbortSignal) {
  const r = await fetch(`https://api.postalpincode.in/postoffice/${encodeURIComponent(city)}`, { signal });
  if (!r.ok) return null;
  const found = (await r.json()) as { Status: string; PostOffice: (Office & { Pincode: string })[] | null }[];
  const offices = (found?.[0]?.Status === "Success" ? (found[0].PostOffice ?? []) : []).filter((o) => o.Name.toLowerCase() === city.toLowerCase());
  const pins = [...new Set(offices.map((o) => o.Pincode))];
  if (pins.length !== 1) return null;
  return { postalCode: pins[0]!, district: offices[0]!.District.slice(0, 100), state: offices[0]!.State.slice(0, 100) };
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
    city: (block ?? offices[0]!.Name).slice(0, 100),
    district: offices[0]!.District.slice(0, 100),
    state: offices[0]!.State.slice(0, 100),
  };
}
