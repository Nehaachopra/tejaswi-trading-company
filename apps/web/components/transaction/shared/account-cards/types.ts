import { type BankMode } from "@repo/trpc/client";

import { type QrItem } from "../qr-spot";
import { type GridPlace } from "../split-grid";

// a typed reference (UTR, cheque number) for each bank account, with how it was paid when typed
export type Refs = Record<string, { mode: BankMode; text: string }>;

// the words a form gives the cards: a payment's "Paid by", a receipt's "Received by" ...
export type AccountCardsLabels = {
  breakdown: string;
  account: string;
  // what a place holds, as a row's name (only where the fields are rows)
  balance?: string;
  accountAmount: string;
  anotherAccount: string;
  removeAccount: string;
  mode: string;
  modeMissing: string;
  // the meter above the cards: "Left to pay" / "Left to receive", and what it says once nothing is left
  barLeft: string;
  barDone: string;
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
  // what each place holds isn't shown at all, neither beside the places nor as a Balance row (a receipt's: what's
  // there before money comes in only misleads)
  hideHeld?: boolean;
  // Auto, where the form has it (a payment's): fills the cards from what each holds
  auto?: { on: boolean; set: (on: boolean) => void };
  // folded, the place on the left and its amount beside the arrow (a payment's); otherwise the amount on the left
  placeFirst?: boolean;
  // the open card's fields as rows, each name on the left and its value or box on the right, all the same width (a
  // payment's); otherwise each name above its box
  fieldRows?: boolean;
  // how it was paid as rows in one box, like the places, not chips (a payment's)
  modeRows?: boolean;
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
