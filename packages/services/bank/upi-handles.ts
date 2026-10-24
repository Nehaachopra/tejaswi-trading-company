// the UPI handles (the part after @) each app gives out, so a UPI ID can be checked against the app it's said to be
// in, and the app worked out from the handle. "other" is the banks' own handles. Shared by the server and the bank
// form, so both say the same thing
export const UPI_HANDLES = {
  phonepe: ["ybl", "ibl", "axl"],
  gpay: ["okaxis", "okhdfcbank", "okicici", "oksbi"],
  paytm: ["paytm", "ptyes", "ptaxis", "pthdfc", "ptsbi"],
  bhim: ["upi"],
  amazon_pay: ["apl", "yapl", "rapl"],
  other: [
    "sbi", "hdfcbank", "icici", "axisbank", "kotak", "pnb", "barodampay", "cnrb", "kbl", "federal", "yesbank", "idfcbank", "idfcfirst",
    "aubank", "indus", "kvb", "cub", "sib", "boi", "unionbank", "unionbankofindia", "uboi", "centralbank", "cboi", "iob", "uco", "mahb",
    "indianbank", "idbi", "rbl", "dbs", "equitas", "ujjivan", "fbl", "jkb", "kaypay", "airtel", "jio", "freecharge", "mobikwik",
    "ikwik", "fam", "slice", "waaxis", "wahdfcbank", "wasbi", "waicici", "naviaxis", "yesbankltd", "pockets", "abfspay",
  ],
} as const;

export type UpiApp = keyof typeof UPI_HANDLES;

// the part before @: letters, digits, dot, dash, underscore, 2 to 255 long
const NAME = /^[a-z0-9._-]{2,255}$/;

// the app a UPI ID's handle belongs to, if it's a known one
export const appOfUpi = (upiId: string): UpiApp | null => {
  const handle = upiId.trim().toLowerCase().split("@")[1] ?? "";
  for (const [app, handles] of Object.entries(UPI_HANDLES) as [UpiApp, readonly string[]][]) if (handles.includes(handle)) return app;
  return null;
};

// what's wrong with a UPI ID for an app: "format" (not name@handle), "handle" (not one of the app's), or null
export const upiProblem = (upiId: string, app: UpiApp): "format" | "handle" | null => {
  const [name, handle, extra] = upiId.trim().toLowerCase().split("@");
  if (!name || !handle || extra !== undefined || !NAME.test(name) || !/^[a-z]{2,30}$/.test(handle)) return "format";
  return (UPI_HANDLES[app] as readonly string[]).includes(handle) ? null : "handle";
};
