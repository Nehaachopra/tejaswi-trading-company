"use client";

import { CalendarDays, Plus, SendHorizontal } from "lucide-react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { useEffect, useRef, useState } from "react";

import { MicButton } from "~/components/ui/mic-button";
import { NumberInput } from "~/components/ui/number-input";
import { Spinner } from "~/components/ui/spinner";
import { rupees, titleCase } from "~/lib/format";
import { spokenDigits, wholePhone, wordsToNumber } from "~/lib/number-words";
import { cn } from "~/lib/utils";
import { trpc } from "~/trpc/client";
import { PHONE_PATTERN } from "@repo/trpc/client";

import { indiaDay } from "../../account/balance";
import { useLedgerName } from "../../account/ledger-name";
import {
  draftInput as partyInput,
  emptyAddress,
  emptyDraft as emptyParty,
  type PartyDraft,
} from "../../account/party/party-fields";
import { GST_STATES, partyLabel, stateCodeOf } from "../../account/party/party-kinds";
import { SignedAmount } from "../../account/signed-amount";
import type { LedgerChoice, PaymentKind, Pickable, ReceiptKind } from "../ledger-picker";
import { PartyPick, usePhoneMatches, withCode } from "../party-finder";
import {
  AnswerBubble,
  Card,
  Cards,
  Chip,
  Chips,
  HelperBubble,
  Note,
  TypingBubble,
} from "./chat-parts";

// every question the chat can ask, in the order it asks them (only the ones that apply are asked)
type Q =
  | "amount"
  | "kind"
  | "from"
  | "ledgerName"
  | "phone"
  | "phoneMatch"
  | "name"
  | "pin"
  | "line1"
  | "city"
  | "district"
  | "state"
  | "tds"
  | "tdsRate"
  | "loanRate"
  | "loanFrequency"
  | "interest"
  | "into"
  | "bank"
  | "reference"
  | "date"
  | "remarks"
  | "summary";

// money in or out: the chat is the same, only its kinds, a few words and the save differ
type Flow = "receipt" | "payment";
type Kind = ReceiptKind | PaymentKind;

// per flow: what it can be for, which of those go to a party, which can add a plain ledger, which one a party deducts
// TDS on, and which one brings a loan with its terms
const FLOWS: Record<Flow, { kinds: Kind[]; partyKinds: Kind[]; plainKinds: Kind[]; tdsKind: Kind; loanKind: Kind }> = {
  receipt: {
    kinds: ["customer", "loanTaken", "loanReturned", "capital", "refund", "otherIncome"],
    partyKinds: ["customer", "loanTaken", "loanReturned"],
    plainKinds: ["refund", "otherIncome"],
    tdsKind: "customer",
    loanKind: "loanTaken",
  },
  payment: {
    kinds: ["supplier", "loanRepaid", "loanGiven", "expense", "taxPaid", "refund"],
    partyKinds: ["supplier", "loanRepaid", "loanGiven", "refund"],
    plainKinds: ["expense"],
    tdsKind: "supplier",
    loanKind: "loanGiven",
  },
};
const FREQUENCIES = ["monthly", "quarterly", "half_yearly", "yearly"] as const;
type Frequency = (typeof FREQUENCIES)[number];

// the questions a new party's details take, and the ones a picked party's change resets
const PARTY_QS: Q[] = [
  "ledgerName",
  "phone",
  "phoneMatch",
  "name",
  "pin",
  "city",
  "district",
  "state",
  "line1",
];

const REFERENCE_MAX = 30;
const REMARKS_MAX = 100;

// the TDS deducted (by a customer from us, or by us from a supplier), on what was owed (as the server works it out)
const tdsOn = (settled: number, rate: number) =>
  Math.round((settled / (1 - rate / 100) - settled) * 100) / 100;

// a day as the moment it's saved at: now for today, noon (India) for any other day
const momentOf = (day: string) =>
  day === indiaDay(new Date()) ? new Date() : new Date(`${day}T12:00:00+05:30`);

// a ledger of a customer or supplier (or a party with no sale or purchase yet)
const isParty = (l: Pickable) =>
  l.masterKey === "debtors" ||
  l.masterKey === "creditors" ||
  l.masterKey === "debtorCreditors" ||
  l.masterKey === "parties";

// /transaction/receipt and /transaction/payment as a chat: Tejaswi asks one thing at a time, the answers stack up on
// the right (tap one to change it), choices come as chips and cards, anything typed or spoken goes in the box at the
// bottom. Nothing is saved until the summary's Save; the save goes to the receipt's or payment's own page
export function ReceiptChat({ isAdmin }: { isAdmin: boolean }) {
  return <MoneyChat flow="receipt" isAdmin={isAdmin} />;
}

export function PaymentChat({ isAdmin }: { isAdmin: boolean }) {
  return <MoneyChat flow="payment" isAdmin={isAdmin} />;
}

function MoneyChat({ flow, isAdmin }: { flow: Flow; isAdmin: boolean }) {
  const base = useTranslations("transactions.chat");
  // a payment's own words where it has them (To, Paid from, Save payment ...), the shared ones otherwise
  const own = useTranslations("transactions.payment.chat");
  const t = ((key: string, values?: Record<string, string>) =>
    flow === "payment" && own.has(key as never) ? own(key as never, values as never) : base(key as never, values as never)) as typeof base;
  const tk = useTranslations(flow === "payment" ? "transactions.payment.kinds" : "transactions.receipt.kinds");
  const tf = useTranslations("transactions.loan.frequencies");
  const utils = trpc.useUtils();
  const router = useRouter();
  const nameOf = useLedgerName();
  const banks = trpc.accounts.bank.pickable.useQuery();
  const createReceipt = trpc.transactions.receipt.create.useMutation();
  const createPayment = trpc.transactions.payment.create.useMutation();
  const create = flow === "payment" ? createPayment : createReceipt;
  const { kinds: KINDS, partyKinds: PARTY_KINDS, plainKinds: PLAIN_KINDS, tdsKind, loanKind } = FLOWS[flow];

  // the answers
  const [amount, setAmount] = useState("");
  const [kind, setKind] = useState<Kind | null>(null);
  const [from, setFrom] = useState<LedgerChoice>(null);
  const [party, setParty] = useState<PartyDraft>(() => emptyParty());
  const [tds, setTds] = useState(false);
  const [tdsRate, setTdsRate] = useState("");
  const [loanRate, setLoanRate] = useState("");
  const [frequency, setFrequency] = useState<Frequency | null>(null);
  // a loan repaid: how much of it is interest ("0" for none)
  const [interest, setInterest] = useState("");
  const [into, setInto] = useState<"cash" | "bank">("cash");
  const [bankId, setBankId] = useState<string | null>(null);
  const [reference, setReference] = useState("");
  const [day, setDay] = useState(() => indiaDay(new Date()));
  const [remarks, setRemarks] = useState("");

  // which questions are answered, which one is open again, what's in the box, and what went wrong
  const [done, setDone] = useState<Set<Q>>(new Set());
  const [editing, setEditing] = useState<Q | null>(null);
  const [typed, setTyped] = useState("");
  const [problem, setProblem] = useState<string | null>(null);
  const [saveError, setSaveError] = useState<string | null>(null);
  const bottom = useRef<HTMLDivElement>(null);
  const current = useRef<HTMLLIElement>(null);
  const dateBox = useRef<HTMLInputElement>(null);
  // the helper "types" for a moment before each new question (not when motion is turned down)
  const [typing, setTyping] = useState(true);

  const address = party.addresses[0]!;
  const value = Number(amount) || 0;
  const bank = banks.data?.find((b) => b.id === bankId);
  const phoneMatches = usePhoneMatches(party.phone, "customer");
  // a phone someone already has: one phone, one party, so it's them (or the phone gets changed)
  const showMatch = from?.kind === "party" && phoneMatches.length > 0;
  // TDS is asked of the party it applies to: a customer paying us, or a supplier we pay
  const tdsParty =
    kind === tdsKind &&
    ((from?.kind === "ledger" && isParty(from.ledger)) || from?.kind === "party");
  const interestValue = Number(interest) || 0;
  const tdsValue = Number(tdsRate) || 0;

  // who it came from: the box searches (phone, name or short name) once typing pauses; the ones used last first
  const [asked, setAsked] = useState("");
  useEffect(() => {
    const timer = setTimeout(() => setAsked(typed.trim()), 250);
    return () => clearTimeout(timer);
  }, [typed]);
  const found = trpc.accounts.ledger.pickable.useQuery(
    {
      purpose: flow,
      receiptKind: flow === "receipt" ? (kind as ReceiptKind | null) : null,
      paymentKind: flow === "payment" ? (kind as PaymentKind | null) : null,
      search: asked,
    },
    { enabled: kind !== null && !done.has("from"), placeholderData: (previous) => previous },
  );
  const tdsAmount =
    tdsParty && tds && tdsValue > 0 && tdsValue < 100 ? tdsOn(value, tdsValue) : 0;

  // the questions that apply now, in order; the open one is the one being changed, or else the first unanswered
  const sequence: Q[] = [
    "amount",
    "kind",
    "from",
    ...(from?.kind === "new" ? (["ledgerName"] as Q[]) : []),
    ...(from?.kind === "party"
      ? ([
          "phone",
          ...(showMatch ? ["phoneMatch"] : []),
          "name",
          // a PIN that's found fills the town, district and state; they're still asked, filled in, to change if needed
          "pin",
          "city",
          "district",
          "state",
          "line1",
        ] as Q[])
      : []),
    ...(tdsParty ? (["tds", ...(tds ? ["tdsRate"] : [])] as Q[]) : []),
    ...(kind === loanKind ? (["loanRate", "loanFrequency"] as Q[]) : []),
    ...(flow === "payment" && kind === "loanRepaid" ? (["interest"] as Q[]) : []),
    "into",
    ...(into === "bank" ? (["bank", "reference"] as Q[]) : []),
    "date",
    "remarks",
    "summary",
  ];
  const active: Q = editing ?? sequence.find((q) => !done.has(q)) ?? "summary";
  const shown = sequence
    .slice(0, sequence.indexOf(active) + 1)
    .concat(
      editing
        ? sequence.filter((q) => done.has(q) && sequence.indexOf(q) > sequence.indexOf(active))
        : [],
    );

  // after every answer, the open question scrolls into view, again once its typing dots give way to it: the end of
  // the chat for the next question, or the middle of the screen for an earlier answer being changed
  useEffect(() => {
    const frame = requestAnimationFrame(() => {
      if (editing) current.current?.scrollIntoView({ behavior: "smooth", block: "center" });
      else bottom.current?.scrollIntoView({ behavior: "smooth", block: "end" });
    });
    return () => cancelAnimationFrame(frame);
  }, [active, done.size, typing, editing]);
  // a new question: a moment of typing dots first (an answer being changed opens at once)
  useEffect(() => {
    if (editing || window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      setTyping(false);
      return;
    }
    setTyping(true);
    const timer = setTimeout(() => setTyping(false), 600);
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- only when the open question changes
  }, [active]);

  // the box starts with what's already there when a question is opened again
  useEffect(() => {
    setProblem(null);
    setTyped(prefill(active));
    // eslint-disable-next-line react-hooks/exhaustive-deps -- only when the open question changes
  }, [active]);

  // an answer taken: the question is done, and anything it changes later is asked again
  function answered(q: Q, reset: Q[] = []) {
    setDone((d) => {
      const next = new Set(d);
      next.add(q);
      for (const r of reset) next.delete(r);
      return next;
    });
    setEditing(null);
    setTyped("");
    setProblem(null);
  }

  // what a question's box holds when it's opened again
  function prefill(q: Q) {
    switch (q) {
      case "amount":
        return amount;
      case "ledgerName":
        return from?.kind === "new" ? from.name : "";
      case "phone":
        return party.phone;
      case "name":
        return party.name;
      case "pin":
        return address.postalCode;
      case "line1":
        return address.addressLine1;
      case "city":
        return address.city;
      case "district":
        return address.district;
      case "state":
        return address.state;
      case "tdsRate":
        return tdsRate;
      case "loanRate":
        return loanRate;
      case "interest":
        return interest === "0" ? "" : interest;
      case "reference":
        return reference;
      case "remarks":
        return remarks;
      default:
        return "";
    }
  }

  const setAddress = (patch: Partial<typeof address>) =>
    setParty((p) => ({ ...p, addresses: [{ ...p.addresses[0]!, ...patch }] }));

  // someone already added, used in place of a new party
  function pickParty(ledger: Pickable) {
    setFrom({ kind: "ledger", ledger });
    answered("from", [...PARTY_QS, "tds", "tdsRate"]);
  }

  // what the box sends, for the open question
  async function send(raw = typed) {
    const text = raw.trim();
    const bad = (key: string) => setProblem(t(`problems.${key}`));
    switch (active) {
      case "amount": {
        const n = Number(text.replace(/,/g, "")) || wordsToNumber(text) || 0;
        if (!(n > 0)) return bad("amount");
        setAmount(String(n));
        return answered("amount", ["tdsRate", "interest"]);
      }
      // an existing party or ledger is only taken when tapped; Enter adds someone new with what was typed
      case "from": {
        const partyKind = kind !== null && PARTY_KINDS.includes(kind);
        const canAdd = isAdmin && kind !== null && (partyKind || PLAIN_KINDS.includes(kind));
        if (text && canAdd) newFrom(partyKind);
        return;
      }
      case "ledgerName":
        if (!text) return bad("required");
        setFrom({ kind: "new", name: text.slice(0, 150) });
        return answered("ledgerName");
      case "phone": {
        const digits = /\d/.test(text) ? text.replace(/\D/g, "") : spokenDigits(text);
        if (!PHONE_PATTERN.test(digits)) return bad("phone");
        setParty((p) => ({ ...p, phone: digits }));
        return answered("phone", ["phoneMatch"]);
      }
      // a state is taken when tapped, or on Enter once the search leaves just one
      case "state": {
        const left = statesLike(text);
        if (left.length === 1) pickState(left[0]![0]);
        return;
      }
      case "name":
        if (!text) return bad("required");
        setParty((p) => ({ ...p, name: text.slice(0, 150) }));
        return answered("name");
      // the town, district and state come from the PIN: an address already saved with it (taken as is), else India
      // Post's free PIN directory (asked, filled in, to change if needed); unknown → typed in
      case "pin": {
        if (!/^\d{6}$/.test(text)) return bad("pin");
        const after: Q[] = ["city", "district", "state"];
        const saved = await utils.accounts.party.pinPlace.fetch({ postalCode: text }).catch(() => null);
        // a PIN already saved on an address: its town, district and state are taken as they are (tap one to
        // change it), and the address line comes next
        if (saved) {
          setAddress({ postalCode: text, ...saved });
          answered("pin");
          return setDone((d) => new Set([...d, ...after]));
        }
        try {
          const r = await fetch(`https://api.postalpincode.in/pincode/${text}`);
          const found = (await r.json()) as {
            Status: string;
            PostOffice: { District: string; State: string; Name: string }[] | null;
          }[];
          const office = found?.[0]?.Status === "Success" ? found[0].PostOffice?.[0] : undefined;
          if (office) {
            setAddress({
              postalCode: text,
              city: office.District.slice(0, 100),
              district: office.District.slice(0, 100),
              state: office.State.slice(0, 100),
              stateCode: stateCodeOf(office.State),
            });
            return answered("pin", after);
          }
        } catch {
          // no lookup: the town, district and state are typed in
        }
        setAddress({ postalCode: text, city: "", district: "", state: "", stateCode: null });
        return answered("pin", after);
      }
      case "line1":
        if (!text) return bad("required");
        setAddress({ addressLine1: text.slice(0, 200) });
        return answered("line1");
      case "city":
      case "district":
        if (!text) return bad("required");
        setAddress({ [active]: text.slice(0, 100) });
        return answered(active);
      case "tdsRate":
      case "loanRate": {
        const n = Number(text) || wordsToNumber(text) || 0;
        if (!(n > 0 && n < 100) && !(active === "loanRate" && text === "0")) return bad("rate");
        (active === "tdsRate" ? setTdsRate : setLoanRate)(String(n));
        return answered(active);
      }
      // the interest part of a loan repaid: none (0) up to the whole amount
      case "interest": {
        const n = text === "" || text === "0" ? 0 : Number(text.replace(/,/g, "")) || wordsToNumber(text) || -1;
        if (n < 0) return bad("amount");
        if (n > value) return bad("interest");
        setInterest(String(n));
        return answered("interest");
      }
      case "reference":
        setReference(text.replace(/\s+/g, "").toUpperCase().slice(0, REFERENCE_MAX));
        return answered("reference");
      case "remarks":
        setRemarks(text.slice(0, REMARKS_MAX));
        return answered("remarks");
      // the box shows today until another day is picked, so Enter or send on it as it is takes that day
      case "date": {
        const picked = text || day;
        if (!/^\d{4}-\d{2}-\d{2}$/.test(picked)) return bad("date");
        setDay(picked);
        return answered("date");
      }
      default:
        return;
    }
  }

  // the save, from the summary
  async function save() {
    setSaveError(null);
    // what both saves share; each names who it was with in its own words
    const shared = {
      dateTime: momentOf(day),
      newLedger: from?.kind === "new" ? { name: from.name } : null,
      newParty: from?.kind === "party" ? partyInput(party) : null,
      loan: kind === loanKind ? { interestRate: Number(loanRate), frequency: frequency! } : null,
      amount: value,
      settledIn: into,
      bankDetailsId: into === "bank" ? bankId : null,
      referenceNumber: into === "bank" ? reference : "",
      tdsRate: tdsAmount > 0 ? tdsValue : null,
      remarks,
    };
    const ledgerId = from?.kind === "ledger" ? from.ledger.id : null;
    try {
      if (flow === "payment") {
        const r = await createPayment.mutateAsync({
          ...shared,
          paidFor: kind as PaymentKind,
          paidToLedgerId: ledgerId,
          interestAmount: kind === "loanRepaid" ? interestValue : null,
        });
        void utils.accounts.invalidate();
        utils.transactions.payment.get.setData({ transactionId: r.transactionId }, r);
        utils.transactions.payment.balances.setData({ transactionId: r.transactionId }, r.balances);
        router.replace(`/transaction/payment/${r.transactionId}`);
      } else {
        const r = await createReceipt.mutateAsync({ ...shared, receivedFor: kind as ReceiptKind, receivedFromLedgerId: ledgerId });
        void utils.accounts.invalidate();
        utils.transactions.receipt.get.setData({ transactionId: r.transactionId }, r);
        utils.transactions.receipt.balances.setData({ transactionId: r.transactionId }, r.balances);
        router.replace(`/transaction/receipt/${r.transactionId}`);
      }
    } catch (err) {
      const code = (err as { data?: { code?: string } })?.data?.code;
      if (code === "CONFLICT" && (err as { message?: string }).message?.startsWith("Phone")) return setSaveError(t("saveErrors.phone"));
      setSaveError(
        t(
          `saveErrors.${!code ? "network" : code === "CONFLICT" ? "taken" : code === "BAD_REQUEST" ? "check" : "failed"}`,
        ),
      );
    }
  }

  // how an answered question reads on the right
  function answerText(q: Q): React.ReactNode {
    switch (q) {
      case "amount":
        return <span className="font-heading text-lg font-bold">{rupees(value)}</span>;
      case "kind":
        return kind ? tk(kind) : "";
      case "from":
        return from?.kind === "ledger"
          ? from.ledger.party
            ? partyLabel(from.ledger.party)
            : nameOf(from.ledger)
          : from?.kind === "new"
            ? t("newLedger")
            : t("newParty");
      case "ledgerName":
        return from?.kind === "new" ? titleCase(from.name) : "";
      case "phone":
        return withCode(party.phone);
      case "name":
        return party.name;
      case "pin":
        return address.postalCode;
      case "line1":
        return address.addressLine1;
      case "city":
        return address.city;
      case "district":
        return address.district;
      case "state":
        return address.state;
      case "tds":
        return tds ? t("yes") : t("no");
      case "tdsRate":
        return `${tdsRate}% · ${rupees(tdsAmount)}`;
      case "loanRate":
        return `${loanRate}% ${t("aYear")}`;
      case "loanFrequency":
        return frequency ? tf(frequency) : "";
      // the interest, and what's left towards the loan
      case "interest":
        return interestValue > 0
          ? `${rupees(interestValue)} · ${t("sum.principal")} ${rupees(value - interestValue)}`
          : t("none");
      case "into":
        return into === "cash" ? t("cash") : t("bank");
      case "bank":
        return bank ? `${titleCase(bank.bankName)} ••${bank.last4}` : "";
      case "reference":
        return reference || t("skipped");
      // the day of the week and the date, with "Today" in front when it's today
      case "date": {
        const shown = new Date(`${day}T12:00:00+05:30`).toLocaleDateString("en-IN", {
          weekday: "long",
          day: "numeric",
          month: "short",
          year: "numeric",
        });
        return day === indiaDay(new Date()) ? `${shown}` : shown;
      }
      case "remarks":
        return remarks || t("skipped");
      default:
        return "";
    }
  }

  return (
    <main className="mx-auto flex h-[calc(100dvh-10rem)] max-w-2xl flex-col px-4 py-4 sm:px-6 lg:h-[calc(100dvh-4rem)]">
      <h1 className="sr-only">{t("title")}</h1>

      {/* the conversation so far: it takes the space above the box, newest at the bottom, and once it fills the
          screen older messages scroll up; the box stays fixed at the bottom */}
      <div className="scrollbar-none flex min-h-0 flex-1 flex-col overflow-y-auto">
        <ol className="mt-auto flex flex-col gap-3 pb-4" aria-live="polite">
          {shown.map((q, i) =>
            q === active && typing ? (
              <li key={`${q}-typing`}>
                <TypingBubble />
              </li>
            ) : (
              <li key={q} ref={q === active ? current : undefined} className="flex flex-col gap-2">
                <HelperBubble first={i === 0 || q === "summary"}>
                  {q === "summary"
                    ? t("q.summary")
                    : t(`q.${q}`, { name: party.name.split(" ")[0] ?? "" })}
                </HelperBubble>
                {q === active
                  ? options(q)
                  : done.has(q) &&
                    q !== "summary" && (
                      <AnswerBubble
                        label={t(`q.${q}`, { name: party.name.split(" ")[0] ?? "" })}
                        onEdit={() => setEditing(q)}
                        editing={editing === q}
                      >
                        {answerText(q)}
                      </AnswerBubble>
                    )}
                {q === active && problem && <Note tone="error">{problem}</Note>}
              </li>
            ),
          )}
        </ol>
        <div ref={bottom} />
      </div>

      {/* the box: whatever the open question takes in, typed or spoken */}
      {composer()}
    </main>
  );

  // the chips and cards under the open question
  function options(q: Q) {
    switch (q) {
      case "kind":
        return (
          <Chips>
            {KINDS.map((k) => (
              <Chip
                key={k}
                on={kind === k}
                onClick={() => {
                  if (kind !== k) {
                    setKind(k);
                    setFrom(null);
                    setTds(false);
                  }
                  answered(
                    "kind",
                    kind === k
                      ? []
                      : ["from", ...PARTY_QS, "tds", "tdsRate", "loanRate", "loanFrequency", "interest"],
                  );
                }}
              >
                {tk(k)}
              </Chip>
            ))}
          </Chips>
        );
      case "from":
        return null;
      case "phoneMatch":
        return (
          <Cards>
            {phoneMatches.map((l) => (
              <Card key={l.id} onClick={() => pickParty(l)}>
                <PartyPick ledger={l} party={l.party!} />
              </Card>
            ))}
            <Chips>
              <Chip
                onClick={() => {
                  setEditing("phone");
                }}
              >
                {t("changePhone")}
              </Chip>
            </Chips>
          </Cards>
        );
      case "state":
        return null;
      case "tds":
        return (
          <Chips>
            <Chip
              on={done.has("tds") && !tds}
              onClick={() => {
                setTds(false);
                answered("tds", ["tdsRate"]);
              }}
            >
              {t("no")}
            </Chip>
            <Chip
              on={done.has("tds") && tds}
              onClick={() => {
                setTds(true);
                answered("tds");
              }}
            >
              {t("yes")}
            </Chip>
          </Chips>
        );
      case "loanFrequency":
        return (
          <Chips>
            {FREQUENCIES.map((f) => (
              <Chip
                key={f}
                on={frequency === f}
                onClick={() => {
                  setFrequency(f);
                  answered("loanFrequency");
                }}
              >
                {tf(f)}
              </Chip>
            ))}
          </Chips>
        );
      case "into":
        return (
          <Chips>
            <Chip
              on={done.has("into") && into === "cash"}
              onClick={() => {
                setInto("cash");
                answered("into", ["bank", "reference"]);
              }}
            >
              {t("cash")}
            </Chip>
            <Chip
              on={done.has("into") && into === "bank"}
              onClick={() => {
                setInto("bank");
                answered("into");
              }}
            >
              {t("bank")}
            </Chip>
          </Chips>
        );
      case "bank":
        return banks.data?.length === 0 ? (
          <Note>{t("noBanks")}</Note>
        ) : (
          <Chips>
            {(banks.data ?? []).map((b) => (
              <Chip
                key={b.id}
                on={bankId === b.id}
                onClick={() => {
                  setBankId(b.id);
                  answered("bank");
                }}
              >
                {titleCase(b.bankName)} ••{b.last4}
              </Chip>
            ))}
          </Chips>
        );
      case "reference":
      case "remarks":
        return (
          <Chips>
            <Chip onClick={() => void send("")}>{t("skip")}</Chip>
          </Chips>
        );
      case "interest":
        return (
          <Chips>
            <Chip on={done.has("interest") && interestValue === 0} onClick={() => void send("0")}>
              {t("none")}
            </Chip>
          </Chips>
        );
      case "date":
        return (
          <Chips>
            <Chip
              on={day === indiaDay(new Date())}
              onClick={() => {
                setDay(indiaDay(new Date()));
                answered("date");
              }}
            >
              {t("today")}
            </Chip>
            {/* any other day: the calendar opens on the box below */}
            <Chip onClick={() => dateBox.current?.showPicker()}>
              <span className="flex items-center gap-1.5">
                <CalendarDays className="size-4" aria-hidden /> {t("pickDay")}
              </span>
            </Chip>
          </Chips>
        );
      case "summary":
        return summary();
      default:
        return null;
    }
  }

  // who it came from: the bar at the bottom is the search (phone, name or short name), and the matches open in a list
  // just above it, the best one nearest the bar (with nothing typed, the ones used last); it scrolls on its own. At its
  // very bottom, adding someone new: a party for a payment or a loan (what's typed goes into it), a ledger for a refund
  // or other income (the admin only). A match is taken only when tapped; Enter adds someone new
  function fromDropdown() {
    const list = found.data ?? [];
    const partyKind = kind !== null && PARTY_KINDS.includes(kind);
    const canAdd = isAdmin && kind !== null && (partyKind || PLAIN_KINDS.includes(kind));
    return (
      <div role="listbox" aria-label={t("q.from")} className="on-ivory absolute inset-x-0 bottom-full z-30 mb-2 flex max-h-[min(24rem,55dvh)] flex-col overflow-hidden rounded-2xl bg-ivory text-chestnut shadow-xl">
        {/* the matches: best at the bottom, nearest the bar */}
        <ul className="scrollbar-none flex min-h-0 flex-1 flex-col-reverse divide-y divide-y-reverse divide-chestnut/10 overflow-y-auto">
          {list.map((l) => (
            <li key={l.id}>
              <button type="button" role="option" aria-selected={false} onClick={() => pickFrom(l)} className="flex w-full items-center gap-2 px-4 py-2.5 text-left hover:bg-chestnut/[0.06]">
                {l.party ? (
                  <PartyPick ledger={l} party={l.party} />
                ) : (
                  <>
                    <span className="min-w-0 flex-1 truncate font-medium">{nameOf(l)}</span>
                    {l.balance && <SignedAmount balance={l.balance.today} head={l.head} className="shrink-0 text-sm" />}
                  </>
                )}
              </button>
            </li>
          ))}
          {list.length === 0 && (
            <li className="px-4 py-3 text-sm">
              {found.isPending ? (
                <span className="flex items-center gap-2">
                  <Spinner className="size-4" /> {t("looking")}
                </span>
              ) : (
                t(asked ? "noMatch" : "typeToFind")
              )}
            </li>
          )}
        </ul>
        {/* someone new */}
        {canAdd && (
          <button type="button" onClick={() => newFrom(partyKind)} className="flex min-h-12 shrink-0 items-center justify-center gap-2 border-t border-chestnut/15 font-semibold hover:bg-chestnut/[0.06]">
            <Plus className="size-4" aria-hidden /> {t(partyKind ? "newParty" : "newLedger")}
          </button>
        )}
      </div>
    );
  }

  // the state: the list opens above the box as soon as it's asked, and what's typed narrows it
  function statesLike(text: string) {
    const needle = text.trim().toLowerCase();
    return needle === ""
      ? GST_STATES
      : GST_STATES.filter(([code, name]) => name.toLowerCase().includes(needle) || code === needle);
  }
  function stateDropdown() {
    const list = statesLike(typed);
    return (
      <div role="listbox" aria-label={t("q.state")} className="on-ivory absolute inset-x-0 bottom-full z-30 mb-2 flex max-h-[min(24rem,55dvh)] flex-col overflow-hidden rounded-2xl bg-ivory text-chestnut shadow-xl">
        <ul className="scrollbar-none flex min-h-0 flex-1 flex-col divide-y divide-chestnut/10 overflow-y-auto">
          {list.map(([code, name]) => (
            <li key={code}>
              <button type="button" role="option" aria-selected={address.stateCode === code} onClick={() => pickState(code)} className={cn("flex w-full items-center gap-2 px-4 py-2.5 text-left hover:bg-chestnut/[0.06]", address.stateCode === code && "font-semibold")}>
                <span className="min-w-0 flex-1 truncate">{name}</span>
                <span className="shrink-0 text-xs text-chestnut/60">{code}</span>
              </button>
            </li>
          ))}
          {list.length === 0 && <li className="px-4 py-3 text-sm">{t("noMatch")}</li>}
        </ul>
      </div>
    );
  }
  function pickState(code: (typeof GST_STATES)[number][0]) {
    setAddress({ stateCode: code, state: GST_STATES.find(([c]) => c === code)?.[1] ?? "" });
    answered("state");
  }

  // a party or ledger picked from the list
  function pickFrom(l: Pickable) {
    setFrom({ kind: "ledger", ledger: l });
    setTds(false);
    answered("from", [...PARTY_QS, "tds", "tdsRate"]);
  }

  // someone new: a party (with the phone or name that was being searched already in it) or a plain ledger
  function newFrom(partyKind: boolean) {
    const searched = typed.trim();
    const digits = searched.replace(/\D/g, "");
    if (partyKind) {
      setParty({
        ...emptyParty(),
        phone: PHONE_PATTERN.test(digits) ? digits : "",
        name: /\d/.test(searched) ? "" : titleCase(searched.toLowerCase()).slice(0, 150),
        addresses: [emptyAddress(true)],
      });
      setFrom({ kind: "party" });
    } else {
      setFrom({ kind: "new", name: /\d/.test(searched) ? "" : searched.slice(0, 150) });
    }
    answered("from", [...PARTY_QS, "tds", "tdsRate"]);
  }

  // everything at once before saving; tap an answer above to change it
  function summary() {
    const fromName =
      from?.kind === "ledger"
        ? from.ledger.party
          ? partyLabel(from.ledger.party)
          : nameOf(from.ledger)
        : from?.kind === "new"
          ? titleCase(from.name)
          : party.name;
    const rows: [string, React.ReactNode][] = [
      [
        t("sum.amount"),
        <span key="a" className="font-heading text-xl font-bold">
          {rupees(value)}
        </span>,
      ],
      [t("sum.for"), kind ? tk(kind) : ""],
      [t("sum.from"), fromName],
      ...(tdsAmount > 0
        ? ([[t("sum.tds"), `${tdsRate}% · ${rupees(tdsAmount)}`]] as [string, string][])
        : []),
      ...(kind === loanKind
        ? ([
            [t("sum.interest"), `${loanRate}% ${t("aYear")} · ${frequency ? tf(frequency) : ""}`],
          ] as [string, string][])
        : []),
      ...(kind === "loanRepaid" && interestValue > 0
        ? ([
            [t("sum.interest"), rupees(interestValue)],
            [t("sum.principal"), rupees(value - interestValue)],
          ] as [string, string][])
        : []),
      [
        t("sum.into"),
        into === "cash" ? t("cash") : bank ? `${titleCase(bank.bankName)} ••${bank.last4}` : "",
      ],
      ...(reference ? ([[t("sum.reference"), reference]] as [string, string][]) : []),
      [t("sum.date"), answerText("date")],
      ...(remarks ? ([[t("sum.remarks"), remarks]] as [string, string][]) : []),
    ];
    return (
      <div className="on-ivory flex flex-col gap-3 rounded-2xl bg-ivory p-4 text-chestnut">
        <dl className="flex flex-col divide-y divide-chestnut/10">
          {rows.map(([label, v]) => (
            <div key={label} className="flex items-baseline justify-between gap-3 py-1.5">
              <dt className="text-sm">{label}</dt>
              <dd className="text-right font-medium">{v}</dd>
            </div>
          ))}
        </dl>
        {saveError && (
          <p role="alert" className="text-sm font-medium text-danger">
            {saveError}
          </p>
        )}
        <button
          type="button"
          onClick={() => void save()}
          disabled={create.isPending}
          aria-busy={create.isPending}
          className="flex min-h-12 items-center justify-center gap-2 rounded-control bg-chestnut font-heading text-lg font-bold text-ivory aria-busy:opacity-80"
        >
          {create.isPending && <Spinner className="size-5" />}
          {t("save")}
        </button>
      </div>
    );
  }

  // the box at the bottom: a number, a phone, a date or words as the open question needs; voice beside it
  function composer() {
    const numeric = active === "amount" || active === "tdsRate" || active === "loanRate" || active === "interest";
    // a phone (10 digits) or PIN (6) is listened for until it's whole, its digits adding up across pauses
    const digitsNeeded = active === "phone" ? 10 : active === "pin" ? 6 : 0;
    const digitsSoFar = typed.length >= digitsNeeded ? "" : typed;
    const takesText =
      numeric ||
      [
        "from",
        "ledgerName",
        "phone",
        "name",
        "pin",
        "line1",
        "city",
        "district",
        "state",
        "reference",
        "remarks",
        "date",
      ].includes(active);
    const sayInto = (said: string) => {
      if (numeric) {
        const n = wordsToNumber(said);
        if (n !== null) setTyped(String(n));
      } else if (digitsNeeded) setTyped((digitsSoFar + spokenDigits(said)).slice(0, digitsNeeded));
      else setTyped((v) => (v.trim() ? `${v.trim()} ${said}` : said));
    };
    // what's typed reads big and bold; the hint stays light
    const box =
      "min-w-0 flex-1 bg-transparent text-xl font-bold text-chestnut outline-none placeholder:text-base placeholder:font-normal placeholder:text-chestnut/60";

    return (
      <form
        onSubmit={(e) => {
          e.preventDefault();
          void send();
        }}
        className="shrink-0 pb-50"
      >
        <div>
          <div>
            <div
              className={cn(
                "on-ivory relative flex min-h-14 items-center gap-2 rounded-full bg-ivory px-4 text-chestnut shadow-lg",
                !takesText && "opacity-60",
              )}
            >
              {active === "from" && !typing && fromDropdown()}
              {active === "state" && !typing && stateDropdown()}
              {numeric ? (
                <NumberInput
                  key={active}
                  autoFocus
                  value={typed}
                  onChange={setTyped}
                  decimals={2}
                  maxDigits={13}
                  placeholder={t(`hints.${active}`)}
                  className={box}
                />
              ) : active === "date" ? (
                <input
                  key={active}
                  ref={dateBox}
                  autoFocus
                  type="date"
                  value={typed || day}
                  onChange={(e) => setTyped(e.target.value)}
                  className={cn(box, "[&::-webkit-calendar-picker-indicator]:hidden")}
                />
              ) : (
                <input
                  key={active}
                  autoFocus={takesText}
                  disabled={!takesText}
                  value={typed}
                  inputMode={active === "phone" || active === "pin" ? "numeric" : undefined}
                  maxLength={
                    active === "phone"
                      ? 10
                      : active === "pin"
                        ? 6
                        : active === "reference"
                          ? REFERENCE_MAX
                          : active === "remarks"
                            ? REMARKS_MAX
                            : 150
                  }
                  onChange={(e) =>
                    setTyped(
                      active === "phone" || active === "pin"
                        ? e.target.value.replace(/\D/g, "")
                        : e.target.value,
                    )
                  }
                  placeholder={
                    active === "state"
                      ? t("searchState")
                      : takesText
                        ? t(`hints.${active}`)
                        : t("hints.pick")
                  }
                  className={box}
                />
              )}
              {takesText && (
                <MicButton
                  above
                  throughPauses={numeric}
                  onText={sayInto}
                  until={
                    active === "phone"
                      ? (heard) => wholePhone(heard, digitsSoFar)
                      : active === "pin"
                        ? (heard) => (digitsSoFar + spokenDigits(heard)).length >= 6
                        : undefined
                  }
                />
              )}
              {takesText && active !== "from" && (
                <button
                  type="submit"
                  aria-label={t("send")}
                  className="grid size-10 shrink-0 place-items-center rounded-full bg-chestnut text-ivory"
                >
                  <SendHorizontal className="size-4" aria-hidden />
                </button>
              )}
            </div>
          </div>
        </div>
      </form>
    );
  }
}
