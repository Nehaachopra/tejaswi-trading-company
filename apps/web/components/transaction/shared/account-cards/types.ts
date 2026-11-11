import { type BankMode } from "@repo/trpc/client";

import { type QrItem } from "../qr-spot";
import { type GridPlace } from "../split-grid";

// a typed reference (UTR, cheque number) for each bank account, with how it was paid when typed
export type Refs = Record<string, { mode: BankMode; text: string }>;

// the words a form gives the cards: a payment's "Paid by", a receipt's "Received by" ...
export type AccountCardsLabels = {
  breakdown: string;
  account: string;
  accountAmount: string;
  anotherAccount: string;
  removeAccount: string;
  mode: string;
  modeMissing: string;
  // under the bar: "Payment" / "Receipt" over the amount typed (left), "Paid" / "Received" over what the cards take
  // up (right)
  barTotal: string;
  barGivenLabel: string;
  // typed past what's left / past what the place holds
  capLeft: (amount: string) => string;
  capOnly: (amount: string) => string;
};

// what the cards need from the form around them
export type AccountCardsApi = {
  value: number;
  places: GridPlace[];
  setText: (id: string, text: string) => void;
  setMode: (id: string, mode: BankMode | null) => void;
  tried: boolean;
  // money going out can't be more than a place holds (a payment); money coming in can (a receipt)
  capAtHeld: boolean;
  // Auto, where the form has it (a payment's): fills the cards from what each holds
  auto?: { on: boolean; set: (on: boolean) => void };
  // a QR for each account by UPI that has a UPI ID to pay
  qrItems: QrItem[];
  // the app, the UPI ID and the pen in one row above the QR (a receipt's); otherwise the ID alone above it
  qrRow?: boolean;
  // the label above the UPI ID shown with the QR (a payment's: the same as its UPI ID box, Supplier UPI ID ...)
  qrIdLabel?: string;
  // the UPI ID shown above an account's QR: hidden while it's being changed in its box, with a pen to change it
  // (none for IDs saved on the account)
  qrId: (id: string) => { hideId: boolean; onEdit?: () => void };
  // what goes between how it was paid and the QR, by UPI: the UPI ID's box (or a note)
  upiPart: (place: GridPlace) => React.ReactNode;
  refs: Refs;
  setRefs: React.Dispatch<React.SetStateAction<Refs>>;
  refLeft: string[];
  setRefLeft: React.Dispatch<React.SetStateAction<string[]>>;
  labels: AccountCardsLabels;
};
