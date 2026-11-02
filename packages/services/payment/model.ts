import { z } from "zod";

import { amountModel, headTdsModel, ledgerNameModel, ledgerSummaryModel, LOAN_PAYMENT_KINDS, PARTY_PAYMENT_KINDS, type PaymentKind, paymentKindModel, type TdsType, tdsTypeModel } from "../accounts/model";
import { loanTermsInputModel } from "../due/model";
import { createPartyInputModel, createPayeeInputModel, GSTIN_PATTERN } from "../party/model";
import { remarksModel } from "../transaction/model";

const idModel = z.string().uuid();

// the kinds as the database keeps them
export const PAID_FOR_DB = {
  supplier: "supplier",
  loanRepaid: "loan_repaid",
  interestPaid: "interest_paid",
  loanGiven: "loan_given",
  expense: "expense",
  taxPaid: "tax_paid",
  refund: "refund",
} as const satisfies Record<PaymentKind, string>;

// how many months' rent a payment covers: rent's TDS limit is a month's
const rentMonthsModel = z.number().int().min(1).max(120).default(1);

// a PAN given with a payment, for someone with none on record: it lowers their TDS and is kept on their record
const panNowModel = z.string().trim().toUpperCase().regex(/^[A-Z]{5}\d{4}[A-Z]$/, "A PAN looks like ABCDE1234F.").nullable().default(null);

// the GST rates a bill can carry (12 and 28 only on bills from before 22 September 2025)
export const BILL_GST_RATES = [5, 12, 18, 28, 40] as const;

const gstinModel = z.string().trim().toUpperCase().regex(GSTIN_PATTERN, "That isn't a valid GSTIN.");

// an expense's GST: a bill that charges it (the amount paid includes it, and it's claimed back), or a goods transport
// agency under reverse charge (we pay 5% ourselves, and it may have no GSTIN)
export const expenseGstModel = z.discriminatedUnion("mode", [
  z.object({
    mode: z.literal("bill"),
    gstin: gstinModel,
    billNumber: z.string().trim().min(1).max(16),
    billDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
    rate: z.union(BILL_GST_RATES.map((r) => z.literal(r))),
  }),
  z.object({ mode: z.literal("transport"), gstin: gstinModel.nullable().default(null) }),
]);

export type ExpenseGstModel = z.infer<typeof expenseGstModel>;

// money paid out: what it was for, to a ledger of that kind (or a new one made in the same save: a party, or an
// expense head), from cash or one bank account, on any date. A loan repaid or the interest on one names the loan
// (dueId) instead, and goes to its lender. TDS on a supplier is worked out here, never sent; a loan given gives its terms.
// Lengths follow payments: reference 30, remarks 100
export const createPaymentInputModel = z
  .object({
    dateTime: z.coerce.date(),
    paidFor: paymentKindModel,
    paidToLedgerId: idModel.nullable().default(null),
    dueId: idModel.nullable().default(null),
    // a new expense head, with the TDS its payments carry (rent, contract work, brokerage) if any
    newLedger: z.object({ name: ledgerNameModel, tdsType: tdsTypeModel.nullable().default(null) }).nullable().default(null),
    newParty: createPartyInputModel.nullable().default(null),
    // an expense to a head with TDS: who was paid, a party already added or a new one; a landlord for rent
    payeeLedgerId: idModel.nullable().default(null),
    payeeLandlordId: idModel.nullable().default(null),
    newPayee: createPayeeInputModel.nullable().default(null),
    rentMonths: rentMonthsModel,
    loan: loanTermsInputModel.nullable().default(null),
    // an expense's GST, if any
    gst: expenseGstModel.nullable().default(null),
    pan: panNowModel,
    amount: amountModel,
    settledIn: z.enum(["cash", "bank"]),
    bankDetailsId: idModel.nullable().default(null),
    referenceNumber: z
      .string()
      .trim()
      .max(30)
      .transform((v) => (v === "" ? null : v))
      .nullable()
      .default(null),
    remarks: remarksModel,
  })
  .refine((p) => [p.paidToLedgerId, p.newLedger, p.newParty].filter((v) => v !== null).length === (LOAN_PAYMENT_KINDS.includes(p.paidFor) ? 0 : 1), {
    message: "Pick who it was paid to, or add a new one.",
    path: ["paidToLedgerId"],
  })
  .refine((p) => (p.dueId !== null) === LOAN_PAYMENT_KINDS.includes(p.paidFor), { message: "Pick the loan.", path: ["dueId"] })
  .refine((p) => p.newParty === null || p.newParty.addresses.length > 0, { message: "A new party needs an address.", path: ["newParty"] })
  .refine((p) => p.newParty === null || PARTY_PAYMENT_KINDS.includes(p.paidFor), { message: "Only a supplier, a loan or a refund goes to a new party.", path: ["newParty"] })
  .refine((p) => p.newLedger === null || p.paidFor === "expense", { message: "Only an expense makes a new ledger.", path: ["newLedger"] })
  .refine((p) => p.gst === null || p.paidFor === "expense", { message: "Only an expense carries GST here.", path: ["gst"] })
  .refine((p) => (p.paidFor === "loanGiven") === (p.loan !== null), { message: "A loan given needs its terms.", path: ["loan"] })
  .refine((p) => p.settledIn === "cash" || p.bankDetailsId !== null, { message: "Pick the bank account.", path: ["bankDetailsId"] })
  .refine((p) => p.paidFor === "expense" || (p.payeeLedgerId === null && p.payeeLandlordId === null && p.newPayee === null), { message: "Only an expense names who was paid.", path: ["payeeLedgerId"] })
  .refine((p) => p.payeeLedgerId === null || p.newPayee === null, { message: "Pick who was paid, or add them.", path: ["payeeLedgerId"] })
  .refine((p) => p.newPayee === null || p.newPayee.addresses.length > 0, { message: "A new party needs an address.", path: ["newPayee"] });

export type CreatePaymentInputModel = z.infer<typeof createPaymentInputModel>;

// TDS under section 194Q: once this year's payments to a supplier pass ₹50 lakh, `rate`% of the part above it. What's
// paid is what's left after the TDS, so the owed amount it settles is found back from it: owed − rate × (the part of
// owed above the limit, counting what was paid before) = paid
export const TDS_194Q_LIMIT = 5_000_000;
export function tds194Q(paid: number, before: number, rate: number) {
  const r = rate / 100;
  if (before + paid <= TDS_194Q_LIMIT) return { tds: 0, above: 0 };
  const owed = before >= TDS_194Q_LIMIT ? paid / (1 - r) : (paid - r * (TDS_194Q_LIMIT - before)) / (1 - r);
  const tds = Math.round((owed - paid) * 100) / 100;
  return { tds, above: Math.round(Math.min(owed, before + owed - TDS_194Q_LIMIT) * 100) / 100 };
}

// TDS on an expense head's payment (a proprietor in a year after one above ₹1 crore): rent 10% (194I), contract work
// such as transport, labour and loading 1% to a person (PAN's 4th letter P or H) or 2% to a firm or company (194C),
// brokerage 2% (194H); 20% without a PAN. Null when none is taken: a small transporter's declaration (with a PAN)
export function expenseTdsRate(type: TdsType, pan: string | null, transportDeclaration: boolean) {
  if (type === "contract" && transportDeclaration && pan) return null;
  if (!pan) return 20;
  if (type === "rent" || type === "professional") return 10;
  if (type === "brokerage") return 2;
  return "PH".includes(pan[3] ?? "") ? 1 : 2;
}

// when it starts: rent over ₹50,000 in a month, contract work over ₹1 lakh in a year (or one bill over ₹30,000),
// brokerage over ₹20,000 in a year, each to that payee
export const EXPENSE_TDS_LIMIT: Record<TdsType | "interest", number> = { rent: 50_000, contract: 100_000, brokerage: 20_000, professional: 50_000, interest: 10_000 };
export const CONTRACT_BILL_LIMIT = 30_000;

// the TDS on this payment. Once the period's total passes its limit, TDS is on the whole period's amount (earlier
// payments included), less the TDS already taken; what's paid is what's left after it, so the amount owed is found
// back from it: owed − (rate × (before + owed) − taken) = paid. One contract bill over ₹30,000 has TDS on itself
export function expenseTds(type: TdsType | "interest", paid: number, before: { owed: number; tds: number }, rate: number, gstRate = 0, periods = 1) {
  const r = rate / 100;
  // a bill's GST is in what's paid, but TDS and its limits go by the amount without it
  const g = gstRate / 100;
  const round = (v: number) => Math.round(v * 100) / 100;
  const base = paid / (1 + g);
  // rent's limit is a month's, so a payment for several months has that many months' limit
  if (before.owed + base > EXPENSE_TDS_LIMIT[type] * periods) {
    const owed = (paid + r * before.owed - before.tds) / (1 + g - r);
    const tds = round(owed * (1 + g) - paid);
    if (tds > 0) return { tds, on: round(before.owed + owed), taxable: round(owed) };
  }
  if (type === "contract" && base > CONTRACT_BILL_LIMIT) {
    const owed = paid / (1 + g - r);
    return { tds: round(owed * (1 + g) - paid), on: round(owed), taxable: round(owed) };
  }
  return { tds: 0, on: 0, taxable: round(base) };
}

// GST under reverse charge: we pay it ourselves and claim it back as input credit. Rent from a landlord without a GSTIN
// is 18%, within our state; a goods transport agency 5%, as IGST when it's in another state
export const RCM_RENT_RATE = 18;
export const RCM_TRANSPORT_RATE = 5;
export const RCM_SERVICE_RATE = 18;

// the services a payment can carry reverse charge on, with the code each prints
export const RCM_SAC = { rent: "997212", transport: "996791", legal: "998212" } as const;

// the heads where someone new can be paid with no phone on record; every other head's payee gives one
export const PHONE_OPTIONAL_HEADS: (string | null)[] = ["legalFees", "professionalFees"];

// which head's payments are always reverse charge: an advocate's
export function rcmServiceOf(headKey: string | null) {
  return headKey === "legalFees" ? ("legal" as const) : null;
}
export function rcmOn(taxable: number, rate: number, otherState = false) {
  if (otherState) {
    const igst = Math.round(taxable * rate) / 100;
    return { taxable, rate, cgst: 0, sgst: 0, igst, gst: igst };
  }
  const half = Math.round(taxable * (rate / 2)) / 100;
  return { taxable, rate, cgst: half, sgst: half, igst: 0, gst: Math.round(half * 2 * 100) / 100 };
}

// the GST inside a bill: what it comes to with the TDS, less the amount without GST, split for our state or another
export function gstInBill(whole: number, taxable: number, rate: number, otherState: boolean) {
  const gst = Math.round((whole - taxable) * 100) / 100;
  if (otherState) return { taxable, rate, cgst: 0, sgst: 0, igst: gst, gst };
  const cgst = Math.floor((gst / 2) * 100) / 100;
  return { taxable, rate, cgst, sgst: Math.round((gst - cgst) * 100) / 100, igst: 0, gst };
}

// an expense's tax as the form fills in: its TDS (if any) and its reverse-charge GST (rent from a landlord without a
// GSTIN). The head is one already added or a new one with its TDS type; the payee one already added or a new one
export const expenseTaxInputModel = z.object({
  paidToLedgerId: idModel.nullable().default(null),
  newHeadTdsType: tdsTypeModel.nullable().default(null),
  payeeLedgerId: idModel.nullable().default(null),
  payeeLandlordId: idModel.nullable().default(null),
  // a new payee being added: its PAN, whether it has a GSTIN, and a small transporter's declaration
  rentMonths: rentMonthsModel,
  newPayee: z.boolean().default(false),
  newPayeePan: z.string().trim().toUpperCase().max(10).default(""),
  newPayeeHasGstin: z.boolean().default(false),
  newPayeeDeclared: z.boolean().default(false),
  gst: expenseGstModel.nullable().default(null),
  pan: panNowModel,
  amount: amountModel,
  dateTime: z.coerce.date(),
});

export type ExpenseTaxInputModel = z.infer<typeof expenseTaxInputModel>;

const gstPartsModel = z.object({ taxable: z.number(), rate: z.number(), cgst: z.number(), sgst: z.number(), igst: z.number(), gst: z.number() });

export const expenseTaxModel = z.object({
  tdsType: headTdsModel.nullable(),
  // the TDS: its rate, amount, and the amount it's on (the period's whole, once past its limit)
  tds: z.object({ rate: z.number(), tds: z.number(), on: z.number() }).nullable(),
  // no TDS because of a small transporter's declaration
  declared: z.boolean(),
  // this payment can carry TDS (its year's switch is on), even if it's under the limit so far
  applies: z.boolean(),
  // who it's paid to has no PAN, so it's asked here
  panMissing: z.boolean(),
  rcm: gstPartsModel.nullable(),
  // GST inside a bill, claimed back
  bill: gstPartsModel.nullable(),
});

export type ExpenseTaxModel = z.infer<typeof expenseTaxModel>;

// TDS on a loan's interest: 10%, or 20% without a PAN, above ₹10,000 a year to that lender; none to a bank. The loan
// says who gave it, as told when it was registered
export const interestTdsInputModel = z.object({
  dueId: idModel,
  pan: panNowModel,
  amount: amountModel,
  dateTime: z.coerce.date(),
});

export type InterestTdsInputModel = z.infer<typeof interestTdsInputModel>;

export const interestTdsModel = z.object({
  // this interest can carry TDS, even if it's under the limit so far
  applies: z.boolean(),
  // the lender has no PAN, so it's asked here
  panMissing: z.boolean(),
  tds: z.object({ rate: z.number(), tds: z.number(), on: z.number() }).nullable(),
});

export type InterestTdsModel = z.infer<typeof interestTdsModel>;

// a supplier's TDS for a payment: 0.1%, or 5% with no PAN; nothing in a year our turnover is under ₹10 crore
export const supplierTdsInputModel = z.object({
  // an existing supplier, or a new one (who has paid nothing yet) with or without a PAN
  paidToLedgerId: idModel.nullable().default(null),
  newPartyHasPan: z.boolean().default(false),
  pan: panNowModel,
  amount: amountModel,
  dateTime: z.coerce.date(),
});

export type SupplierTdsInputModel = z.infer<typeof supplierTdsInputModel>;

export const supplierTdsModel = z.object({
  rate: z.number(),
  tds: z.number(),
  // the part of this payment above ₹50 lakh for the year, and what was paid them before it this year
  above: z.number(),
  before: z.number(),
}).nullable();

export type SupplierTdsModel = z.infer<typeof supplierTdsModel>;

// a payment's own details, for its page and voucher (no balances: staff open vouchers too); everything the voucher
// prints is as it was when paid
export const paymentModel = z.object({
  transactionId: idModel,
  assignedId: z.string(),
  dateTime: z.date(),
  remarks: z.string().nullable(),
  status: z.enum(["active", "cancelled"]),
  paidFor: paymentKindModel,
  createdByName: z.string(),
  // the bank account it went from: its bank, the last 4 digits and IFSC
  bank: z.object({ name: z.string(), last4: z.string(), ifsc: z.string().nullable() }).nullable(),
  paidToLedgerId: idModel,
  // as it was named when paid (a party's short name or full name, or the ledger's name)
  paidToName: z.string(),
  partyPhone: z.string().nullable(),
  // the party it went to, for the voucher's Paid to block: full name, short name and its default address
  party: z
    .object({
      name: z.string(),
      shortName: z.string().nullable(),
      address: z
        .object({
          line1: z.string(),
          line2: z.string().nullable(),
          city: z.string(),
          postalCode: z.string(),
          state: z.string(),
          stateCode: z.string(),
          gstin: z.string().nullable(),
        })
        .nullable(),
    })
    .nullable(),
  // a loan given: its interest
  loan: z.object({ interestRate: z.number(), frequency: z.enum(["monthly", "quarterly", "half_yearly", "yearly"]) }).nullable(),
  // our own details the voucher is headed with
  company: z.object({
    name: z.string(),
    address: z.string(),
    phone: z.string(),
    email: z.string(),
    state: z.string(),
    stateCode: z.string(),
    gstin: z.string(),
    fssai: z.string(),
    jurisdiction: z.string(),
  }),
  settledIn: z.enum(["cash", "bank"]),
  bankDetailsId: idModel.nullable(),
  referenceNumber: z.string().nullable(),
  amount: z.number(),
  tdsRate: z.number().nullable(),
  tdsAmount: z.number().nullable(),
  // the PAN of whoever the TDS was taken from
  tdsPan: z.string().nullable(),
  // reverse charge: the GST we pay ourselves and what it's on, for rent or goods transport
  rcm: z.object({ service: z.enum(["rent", "transport", "legal"]), sac: z.string(), taxable: z.number(), rate: z.number(), gst: z.number(), otherState: z.boolean(), supplierGstin: z.string().nullable() }).nullable(),
  // GST on the supplier's bill, claimed back
  bill: z.object({ number: z.string(), gstin: z.string(), taxable: z.number(), rate: z.number(), gst: z.number() }).nullable(),
});

export type PaymentModel = z.infer<typeof paymentModel>;

export const paymentIdInputModel = z.object({ transactionId: idModel });

export type PaymentIdInputModel = z.infer<typeof paymentIdInputModel>;

// where a payment can come from, with what each holds today (null for staff, who never see balances)
export const paymentSourcesModel = z.object({
  cash: z.number().nullable(),
  banks: z.array(z.object({ id: idModel, bankName: z.string(), last4: z.string(), available: z.number().nullable() })),
});

export type PaymentSourcesModel = z.infer<typeof paymentSourcesModel>;

// whether an amount can be paid from cash or one bank account: no more than it holds today
export const paymentFitsInputModel = z.object({
  settledIn: z.enum(["cash", "bank"]),
  bankDetailsId: idModel.nullable().default(null),
  amount: amountModel,
});

export type PaymentFitsInputModel = z.infer<typeof paymentFitsInputModel>;

// a voucher opened from a link shared with the party: the payment and the key in its link
export const sharedPaymentInputModel = z.object({ transactionId: idModel, key: z.string().min(1).max(64) });

export const paymentShareKeyModel = z.object({ key: z.string() });

// right after a save: the payment with the ledgers it moved and their balances (null for staff)
export const savedPaymentModel = paymentModel.extend({ balances: z.array(ledgerSummaryModel).nullable() });

export type SavedPaymentModel = z.infer<typeof savedPaymentModel>;
