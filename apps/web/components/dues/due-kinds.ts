// the four tabs of /dues: who owes us, whom we owe, loans we gave and loans we took (a plain module, so pages on the
// server can read it too)
export const DUE_KINDS = ["debtor", "creditor", "loanGiven", "loanTaken"] as const;
export type DueKind = (typeof DUE_KINDS)[number];