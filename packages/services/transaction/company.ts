import type { CompanySnapshot } from "@repo/database/schema";

// our own details, as every invoice and voucher heads them (from the tax invoice we use today); one place to change
// until there's a Business profile page. Each transaction keeps a copy when it's saved, so a change here never
// rewrites an old voucher
export const COMPANY: CompanySnapshot = {
  name: "Tejaswi Trading Company",
  address: "VMP Compound, Main Road, Hiriyur - 577598",
  phone: "+91 98451 12749",
  email: "utc@customerCare.in",
  state: "Karnataka",
  stateCode: "29",
  gstin: "29ADPR5634F1ZZ",
  fssai: "11217311000034",
  jurisdiction: "HIRIYUR",
};
