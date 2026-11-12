"use client";

import { AccountCards } from "../shared/account-cards/account-cards";
import { type AccountCardsApi, type Refs } from "../shared/account-cards/types";
import { useSalaryEntry } from "./state";

// a salary's Paid from as a payment's: a card per place (cash or a bank account), picked one by one or filled by Auto
// (off to start with), each never more than it holds; a bank card then asks how it paid and its UTR or cheque no.
export function SalaryCards() {
  return <AccountCards api={useSalaryCards()} />;
}

// the cards with a salary's words and parts, laid out as a payment's (every field a row): capped at what each place
// holds, Auto, no QR (the employees aren't paid by scanning one)
function useSalaryCards(): AccountCardsApi {
  const e = useSalaryEntry();
  const { tc, tpf } = e;
  // each bank account's reference, kept with how it paid (one typed before a way was picked is left out)
  const refs: Refs = Object.fromEntries(
    Object.entries(e.bankRefs).flatMap(([id, text]) => {
      const mode = e.bankModes[id];
      return mode ? [[id, { mode, text }]] : [];
    }),
  );
  return {
    value: e.value,
    places: e.places.map((p) => ({ ...p, mode: e.bankModes[p.id] ?? null })),
    setText: e.setSplit,
    setMode: (id, mode) => e.setBankModes((all) => ({ ...all, [id]: mode })),
    tried: e.tried,
    capAtHeld: true,
    // laid out as a payment's: every field a row, how it paid as rows, the place first when folded
    modeRows: true,
    placeFirst: true,
    fieldRows: true,
    auto: { on: e.splitAuto, set: e.setSplitAuto },
    qrItems: [],
    qrId: () => ({ hideId: false }),
    upiPart: () => null,
    refs,
    setRefs: (update) => {
      const next = typeof update === "function" ? update(refs) : update;
      e.setBankRefs(Object.fromEntries(Object.entries(next).map(([id, r]) => [id, r.text])));
    },
    refLeft: e.refLeft,
    setRefLeft: e.setRefLeft,
    labels: {
      breakdown: tpf("breakdown"),
      account: tpf("account"),
      balance: tpf("balance"),
      // a short name, as it sits beside its box
      accountAmount: tc("q.amount"),
      anotherAccount: tpf("anotherAccount"),
      removeAccount: tc("removeAccount"),
      mode: tpf("paidBy"),
      modeMissing: tpf("pickMode"),
      barLeft: tpf("leftToPay"),
      barDone: tpf("nothingLeft"),
      capLeft: (amount) => tpf("capLeft", { amount }),
      capOnly: (amount) => tpf("capOnly", { amount }),
    },
  };
}
