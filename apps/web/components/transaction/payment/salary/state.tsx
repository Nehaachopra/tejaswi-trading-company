"use client";

import { useRouter } from "next/navigation";
import { useLocale, useTranslations } from "next-intl";
import { createContext, useContext, useEffect, useRef, useState } from "react";

import { type BankMode } from "@repo/trpc/client";
import { bankNameIn } from "~/lib/bank-names";
import { rupees, titleCase } from "~/lib/format";
import { useLeaveGuard } from "~/lib/use-leave-guard";
import { useSalary } from "~/providers/salary";
import { type EditSalaryIn, type SalaryForEdit } from "~/providers/salary-edit";

import { indiaDay } from "../../../account/balance";
import { type LedgerChoice } from "../../pickers/ledger-picker";
import { moveCard, useCardHistory } from "../../shared/card-steps";
import { type SummaryItem } from "../../shared/entry-frame";
import { refOkFor } from "../../shared/bank-mode";
import { momentOf } from "../../shared/form-basics";

// the cards, in order: what for and who (a salary: the table); how much and where it's paid from; then the
// reference, the remarks, the day and Save
// what it's for (Salary or Advance) on its own card, then who's paid: every employee owed (a salary) or the one taking
// an advance, then the amount and where from, then the details
export type SalaryStep = "for" | "pay" | "amount" | "details";
const STEPS: SalaryStep[] = ["for", "pay", "amount", "details"];

// what a payment's Salary or Advance to employee hands over: Salary or Advance, the amount, and where it's paid from
export type SalaryStart = {
  kind: "salary" | "advance" | null;
  amount: string;
  from: "cash" | "bank" | null;
  bankId: string | null;
};

const round2 = (n: number) => Math.round(n * 100) / 100;

// a salary row as changed: ticked, the months it pays, the advance taken back (toggled on)
type Row = { on: boolean; months: string; take: boolean };

// a salary or advance being edited (History, the admin's): the saved one, and the edit's own save in place of a new one's
export type SalaryEdit = {
  saved: SalaryForEdit;
  saving: boolean;
  done: boolean;
  save: (input: Omit<EditSalaryIn, "transactionId">) => Promise<void>;
};

// an edit's stages: who's paid (locked), the amount and where from, the details; what it was paid for stays
const EDIT_STEPS: SalaryStep[] = ["pay", "amount", "details"];

// everything the salary form holds and works out: what's typed, what the server says, and the moves between cards.
// Made once in SalaryEntry; every card reads it with useSalaryEntry()
export function useSalaryEntryState({
  start,
  onDiscard,
  onBackToPayment,
  edit,
}: {
  start?: SalaryStart;
  onDiscard: () => void;
  // opened from a payment's Paid for: its For card is that Paid for, so going to it goes back there
  onBackToPayment?: () => void;
  // editing a saved one: the form opens on it, its employee locked
  edit?: SalaryEdit;
}) {
  const t = useTranslations("transactions.salary");
  const tc = useTranslations("transactions.chat");
  const tpf = useTranslations("transactions.payment.form");
  const locale = useLocale();
  const router = useRouter();
  const {
    employees: employeesNow,
    banks,
    sources: sourcesNow,
    loading,
    loadFailed,
    retryLoad,
    savePay,
    savePayAll,
    refreshEmployees,
    saving: newSaving,
    saved: newSaved,
  } = useSalary();
  // editing: the saved one; its employee alone, as they were before it; cash and each account with what it took out of
  // them back in; the edit's own save
  const ed = edit?.saved;
  const isEdit = !!edit;
  const employees = ed ? [ed.row] : employeesNow;
  const sources =
    ed && sourcesNow
      ? {
          ...sourcesNow,
          cash: sourcesNow.cash === null ? null : round2(sourcesNow.cash + ed.cashAmount),
          banks: sourcesNow.banks.map((b) => {
            const own = ed.banks.filter((x) => x.bankDetailsId === b.id).reduce((sum, x) => sum + x.amount, 0);
            return { ...b, available: b.available === null ? null : round2(b.available + own) };
          }),
        }
      : sourcesNow;
  const creating = edit ? edit.saving : newSaving;
  const saved = edit ? edit.done : newSaved;

  // the answers: what for (on top); a salary: the table of employees owed (each ticked, with its months); an advance:
  // who (their ledger, found as a payment finds a party) and how much; then where from
  const [kind, setKind] = useState<"salary" | "advance" | null>(ed?.kind ?? start?.kind ?? null);
  // a salary: each row changed from how it starts (ticked, all the months owed, no advance taken back); an edit's own
  // row as saved
  const [rows, setRows] = useState<Record<string, Row>>(() =>
    ed?.kind === "salary" ? { [ed.row.employeeId]: { on: true, months: String(ed.months), take: ed.takesAdvance } } : {},
  );
  // a salary: the employee whose details are being changed right here
  const [editingId, setEditingId] = useState<string | null>(null);
  const [choice, setChoice] = useState<LedgerChoice>(ed ? { kind: "ledger", ledger: ed.ledger } : null);
  // an advance: the picked employee's details being changed right here
  const [editing, setEditing] = useState(false);
  // an advance: the amount
  const [amount, setAmount] = useState(ed?.kind === "advance" ? String(ed.amount) : start?.kind === "advance" ? start.amount : "");
  const [from, setFrom] = useState<"cash" | "bank" | null>(start?.from ?? null);
  const [bankId, setBankId] = useState<string | null>(start?.bankId ?? null);
  const [reference, setReference] = useState(ed?.referenceNumber ?? "");
  // from a bank: how each account paid and its UTR or cheque no. (a salary: per account used; an advance: its one)
  const [bankModes, setBankModes] = useState<Record<string, BankMode | null>>(() =>
    Object.fromEntries((ed?.banks ?? []).map((b) => [b.bankDetailsId, b.mode])),
  );
  const [bankRefs, setBankRefs] = useState<Record<string, string>>(() =>
    Object.fromEntries((ed?.banks ?? []).filter((b) => b.referenceNumber).map((b) => [b.bankDetailsId, b.referenceNumber!])),
  );
  const [remarks, setRemarks] = useState(ed?.remarks ?? "");
  const [day, setDay] = useState(() => indiaDay(ed ? new Date(ed.dateTime) : new Date()));
  // made when the form opens: a second save with it (a retry after the connection dropped) gets the first one's result
  const [saveKey] = useState(() => crypto.randomUUID());
  // an advance was cut at the most it can be: the warning under it
  const [capped, setCapped] = useState<number | null>(null);
  const [saveError, setSaveError] = useState<string | null>(null);
  // Next or Save was tapped with something missing: what's missing shows in red
  const [tried, setTried] = useState(false);
  useEffect(() => setTried(false), [kind, choice, rows, amount, from, bankId, bankModes]);

  // an advance: the employee behind the ledger picked
  const ledgerPicked = choice?.kind === "ledger" ? choice.ledger : null;
  const employee = ledgerPicked
    ? employees?.find((e) => e.partyId === ledgerPicked.referenceId)
    : undefined;

  // a salary: every employee owed a month, a row each: ticked or not, the months it pays (oldest owed first, never
  // more than are owed), what they come to, the advance taken back (only when toggled on: all they owe back, up to
  // what the months come to), and the cash paid: the months less the advance
  const cashHeld = sources?.cash ?? null;
  const bankHeld = (id: string) => sources?.banks.find((b) => b.id === id)?.available ?? null;
  // ticked to start with only while what cash and the bank accounts hold together covers them, down the table; one
  // that doesn't fit starts unticked (a row ticked or unticked by hand stays as set)
  const available = [cashHeld, ...(banks ?? []).map((b) => bankHeld(b.id))].reduce<number>(
    (sum, h) => sum + (h ?? Infinity),
    0,
  );
  let running = 0;
  const table = (employees ?? [])
    .filter((e) => e.owed.length > 0)
    .map((e) => {
      const set = rows[e.employeeId];
      const months = set?.months ?? String(e.owed.length);
      const take = set?.take ?? false;
      const count = Math.min(Math.max(Number(months) || 0, 0), e.owed.length);
      const owed = round2(e.owed.slice(0, count).reduce((sum, m) => sum + m.left, 0));
      const advanceMax = round2(Math.min(e.advanceLeft, owed));
      const advance = take ? advanceMax : 0;
      const total = round2(owed - advance);
      const on = set?.on ?? round2(running + total) <= available;
      if (on) running = round2(running + total);
      return { employee: e, on, months, owed, take, advanceMax, advance, total };
    });
  const lines = table.filter((r) => r.on && r.total > 0);
  function setRow(employeeId: string, change: Partial<Row>) {
    setRows((all) => {
      const now = table.find((r) => r.employee.employeeId === employeeId);
      const was = all[employeeId] ?? {
        on: now?.on ?? true,
        months: now?.months ?? "1",
        take: now?.take ?? false,
      };
      return { ...all, [employeeId]: { ...was, ...change } };
    });
  }
  function setAll(on: boolean) {
    for (const r of table) setRow(r.employee.employeeId, { on });
  }

  const value =
    kind === "salary" ? round2(lines.reduce((sum, r) => sum + r.total, 0)) : Number(amount) || 0;

  // an advance: where it's paid from, and what it holds
  const bank = banks?.find((b) => b.id === bankId);
  // an advance is paid from one place (cash or one bank account): it can be at most what the place holding the most
  // holds (unknown to staff)
  const most =
    cashHeld === null ? null : Math.max(cashHeld, ...(banks ?? []).map((b) => bankHeld(b.id) ?? 0));

  // where it's paid from: cash, then each bank account, each with what it holds and how much goes from it, a card each
  // as a payment's (an advance: one card, one place). Auto (off to start with) fills them from what each holds, cash first, until the
  // total's covered; typing an amount turns Auto off, the others keeping what they had. The app then shares them over
  // the employees, in order
  const [typedSplit, setTypedSplit] = useState<Record<string, string> | null>(() =>
    ed
      ? {
          ...(ed.cashAmount > 0 ? { cash: String(ed.cashAmount) } : {}),
          ...Object.fromEntries(ed.banks.map((b) => [b.bankDetailsId, String(b.amount)])),
        }
      : {},
  );
  // the bank cards' reference boxes left (their mistakes show then)
  const [refLeft, setRefLeft] = useState<string[]>([]);
  const placeName = (id: string) => {
    const b = banks?.find((x) => x.id === id);
    return id === "cash" ? tc("cash") : b ? bankNameIn(b.bankName, locale) : "";
  };
  const placeList = [
    { id: "cash", held: cashHeld },
    ...(banks ?? []).map((b) => ({ id: b.id, held: bankHeld(b.id) })),
  ];
  const autoSplit = (() => {
    let need = value;
    return Object.fromEntries(
      placeList.map((p) => {
        const take = round2(Math.max(0, Math.min(p.held ?? Infinity, need)));
        need = round2(need - take);
        return [p.id, take > 0 ? String(take) : ""];
      }),
    );
  })();
  const split = typedSplit ?? autoSplit;
  const places = placeList.map((p) => ({
    id: p.id,
    name: placeName(p.id),
    sub: p.id === "cash" ? null : `••${banks?.find((b) => b.id === p.id)?.last4 ?? ""}`,
    held: p.held,
    text: split[p.id] ?? "",
    amount: Number(split[p.id]) || 0,
  }));
  const splitTotal = round2(places.reduce((sum, p) => sum + p.amount, 0));
  // the places used; an advance takes one
  const placesUsed = places.filter((p) => p.amount > 0);
  const splitOk =
    splitTotal === value &&
    places.every((p) => p.held === null || p.amount <= p.held) &&
    (kind !== "advance" || placesUsed.length <= 1);
  const splitAuto = typedSplit === null;
  function setSplit(id: string, text: string) {
    setTypedSplit((was) => ({ ...(was ?? autoSplit), [id]: text }));
  }
  // Auto switched off by hand empties every card, as a payment's
  function setSplitAuto(on: boolean) {
    setTypedSplit(on ? null : {});
  }

  // a salary's new total (employees or months changed) starts the Amount stage again: every card empty, Auto off, no
  // way paid or reference kept. An advance's amount is typed on that stage itself, so it's left alone
  const lastTotal = useRef(value);
  useEffect(() => {
    if (lastTotal.current === value) return;
    lastTotal.current = value;
    if (kind !== "salary") return;
    setTypedSplit({});
    setBankModes({});
    setBankRefs({});
    setRefLeft([]);
  }, [value]);

  // the accounts a bank payment goes through, each needing how it paid (a reference that fits, if typed)
  const bankIdsUsed = placesUsed.filter((p) => p.id !== "cash").map((p) => p.id);
  const banksOk = bankIdsUsed.every(
    (id) => !!bankModes[id] && refOkFor(bankModes[id]!, bankRefs[id] ?? ""),
  );
  // a cash voucher no. is asked only when cash is used
  const cashUsed = (places.find((p) => p.id === "cash")?.amount ?? 0) > 0;

  // another employee or kind starts the advance's amount again: only when one of them really changes, so the form
  // opening (an edit's amount, React running effects twice) never empties it
  const lastWho = useRef(`${employee?.employeeId ?? ""}|${kind ?? ""}`);
  useEffect(() => {
    const who = `${employee?.employeeId ?? ""}|${kind ?? ""}`;
    if (lastWho.current === who) return;
    // (the employee only now found, as the list arrives: nothing was typed for anyone else)
    const found = lastWho.current.startsWith("|");
    lastWho.current = who;
    setEditing(false);
    if (found) return;
    setAmount("");
    setCapped(null);
  }, [employee?.employeeId, kind]);
  // an advance more than the place holds: cut to it, with the warning
  useEffect(() => {
    if (kind !== "advance" || most === null || value <= most) return;
    setAmount(String(most));
    setCapped(most);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- only when the most changes
  }, [most]);
  useEffect(() => {
    if (from === "cash") setBankId(null);
  }, [from]);

  // when each card is filled in
  const complete: Record<SalaryStep, boolean> = {
    // a salary: never more than cash and the bank accounts hold together
    for: kind !== null,
    pay: kind !== null && (kind === "salary" ? lines.length > 0 && value <= available : !!employee),
    amount:
      value > 0 && banksOk && splitOk && (kind !== "advance" || most === null || value <= most),
    details: day !== "",
  };
  // opened for Salary or Advance (from a payment's Paid for), or an edit: straight to who's paid
  const steps = isEdit ? EDIT_STEPS : STEPS;
  const firstStep: SalaryStep = isEdit || start?.kind ? "pay" : "for";
  const [at, setAt] = useState<SalaryStep>(firstStep);
  const current = at;
  const index = steps.indexOf(current);
  const firstOpen = steps.findIndex((s) => !complete[s]);
  const ready = firstOpen === -1;
  // (a card not in this form, as an edit's Paid for, can't be gone back to)
  const reachable = (s: SalaryStep) => steps.includes(s) && steps.indexOf(s) <= (ready ? steps.length - 1 : firstOpen);
  // phones: the summary folded into a bar above the card
  const [summaryOpen, setSummaryOpen] = useState(false);

  // the phone's Back goes to the card before
  const remember = useCardHistory<SalaryStep>(firstStep, (card) => {
    // (back past the employees stage, onto the payment's Paid for: the payment again)
    if (onBackToPayment && (card === "for" || !STEPS.includes(card))) return onBackToPayment();
    if (!steps.includes(card)) return;
    moveCard(() => {
      setTried(false);
      setAt(card);
    }, true);
    window.scrollTo({ top: 0, behavior: "smooth" });
  });
  function show(step: SalaryStep) {
    if (step === "for" && onBackToPayment) return onBackToPayment();
    moveCard(
      () => {
        setTried(false);
        setAt(step);
      },
      steps.indexOf(step) < index,
    );
    remember(step);
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  // something missing: show it in red and put the cursor on its first field
  function guide() {
    setTried(true);
    setTimeout(
      () => document.querySelector<HTMLElement>('main section [aria-invalid="true"]')?.focus(),
      50,
    );
  }
  function next() {
    if (!complete[current]) return guide();
    show(steps[index + 1]!);
  }

  // who's paid: Employees for a salary, Employee for an advance
  const stepName = (s: SalaryStep) =>
    s === "pay" ? (kind === "advance" ? t("employee") : t("steps.employees")) : t(`steps.${s}`);
  const missingOf = () =>
    kind === "salary" && lines.length === 0
      ? t("missing.employees")
      : kind === "salary" && current === "pay" && value > available
        ? t("missing.overHeld", { amount: rupees(Math.round((value - available) * 100) / 100) })
        : value > 0 && !splitOk
          ? kind === "advance" && placesUsed.length > 1
            ? t("oneSource")
            : t("splitShort", { amount: rupees(Math.round((value - splitTotal) * 100) / 100) })
          : !banksOk
            ? tpf("pickMode")
            : t(
                kind === null
                  ? "missing.kind"
                  : kind === "advance" && !employee
                    ? "missing.employee"
                    : value === 0
                      ? "missing.amount"
                      : "missing.from",
              );

  // what's answered so far, a line each, for the summary
  const summary: SummaryItem<SalaryStep>[] = [
    // as a payment's: Paid for, and the head picked there (Salary, Advance to employee)
    { key: "for", step: "for", heading: tpf("steps.kind"), value: kind ? t(`heads.${kind}`) : null },
    {
      key: "employee",
      step: "pay",
      heading: t("employee"),
      value:
        // each employee paid, their name on the left and what they're paid on the right (an advance: once typed)
        kind === "salary"
          ? lines.length
            ? lines.map((r) => ({ name: r.employee.shortName ?? titleCase(r.employee.name.toLowerCase()), amount: rupees(r.total) }))
            : null
          : employee
            ? value > 0
              ? { name: employee.shortName ?? titleCase(employee.name.toLowerCase()), amount: rupees(value) }
              : (employee.shortName ?? titleCase(employee.name.toLowerCase()))
            : null,
    },
    {
      key: "from",
      step: "amount",
      heading: t("from"),
      value: ((l) => (l.length ? l : null))(
        placesUsed.map((p) => ({
          name: `${p.name}${p.sub ? ` ${p.sub}` : ""}`,
          amount: rupees(p.amount),
        })),
      ),
    },
    {
      key: "details",
      step: "details",
      heading: stepName("details"),
      value: ((l) => (l.length ? l : null))(
        [reference.trim(), remarks.trim()].filter((v) => v !== ""),
      ),
    },
  ];

  // leaving with something entered asks first (not after a save, which goes on to its own page); an edit asks only
  // once something differs from how it opened
  const editKey = JSON.stringify([rows, amount, typedSplit, bankModes, bankRefs, reference, remarks, day]);
  const openedKey = useRef(editKey);
  const { dialog: leaveDialog } = useLeaveGuard(
    !saved &&
      (isEdit
        ? editKey !== openedKey.current
        : choice !== null || Object.keys(rows).length > 0 || (kind === "advance" && value > 0) || remarks !== ""),
    onDiscard,
  );

  // Save tapped and still working: the button says so and can't be tapped again
  const [saving, setSaving] = useState(false);
  async function save() {
    if (!ready) {
      setAt(steps[firstOpen]!);
      return guide();
    }
    setSaving(true);
    setSaveError(null);
    try {
      // an edit saves over the saved one (and goes on to its own done page)
      if (edit) {
        await edit.save({
          dateTime: momentOf(day),
          amount: value,
          advance: kind === "salary" ? (lines[0]?.advance ?? 0) : 0,
          sources: placesUsed.map((p) =>
            p.id === "cash"
              ? { bankDetailsId: null, amount: p.amount, mode: null, referenceNumber: null }
              : { bankDetailsId: p.id, amount: p.amount, mode: bankModes[p.id]!, referenceNumber: bankRefs[p.id] || null },
          ),
          referenceNumber: cashUsed ? reference.trim() || null : null,
          remarks,
        });
        return;
      }
      if (kind === "salary") {
        // a transaction each; the first one's page, with the rest listed on it
        const list = await savePayAll({
          saveKey,
          dateTime: momentOf(day),
          lines: lines.map((r) => ({
            employeeId: r.employee.employeeId,
            amount: r.total,
            advance: r.advance,
          })),
          sources: places
            .filter((p) => p.amount > 0)
            .map((p) =>
              p.id === "cash"
                ? { bankDetailsId: null, amount: p.amount, mode: null, referenceNumber: null }
                : {
                    bankDetailsId: p.id,
                    amount: p.amount,
                    mode: bankModes[p.id]!,
                    referenceNumber: bankRefs[p.id] || null,
                  },
            ),
          referenceNumber: cashUsed ? reference.trim() || null : null,
          remarks,
        });
        const [first, ...rest] = list.map((x) => x.transactionId);
        router.replace(
          `/transaction/payment/salary/${first}${rest.length ? `?also=${rest.join(",")}` : ""}`,
        );
        return;
      }
      // an advance: the one place its card says
      const place = placesUsed[0]!;
      const byBank = place.id !== "cash";
      const s = await savePay({
        saveKey,
        dateTime: momentOf(day),
        employeeId: employee!.employeeId,
        kind: "advance",
        amount: value,
        settledIn: byBank ? "bank" : "cash",
        bankDetailsId: byBank ? place.id : null,
        bankMode: byBank ? bankModes[place.id]! : null,
        referenceNumber: byBank ? bankRefs[place.id] || null : reference.trim() || null,
        remarks,
      });
      // on to its own page; replace, so going back doesn't land on the filled form
      router.replace(`/transaction/payment/salary/${s.transactionId}`);
    } catch (err) {
      setSaving(false);
      const code = (err as { data?: { code?: string } })?.data?.code;
      setSaveError(
        code === undefined
          ? tc("saveErrors.network")
          : code === "TOO_MANY_REQUESTS"
            ? tc("saveErrors.busy")
            : code === "BAD_REQUEST" || code === "PRECONDITION_FAILED"
              ? tc("saveErrors.check")
              : t("errors.failed"),
      );
    }
  }

  return {
    t,
    tc,
    tpf,
    locale,
    loading,
    loadFailed,
    retryLoad,
    employees,
    banks,
    creating,
    saved,
    kind,
    setKind,
    table,
    lines,
    setRow,
    setAll,
    editingId,
    setEditingId,
    refreshEmployees,
    available,
    places,
    setSplit,
    splitAuto,
    setSplitAuto,
    refLeft,
    setRefLeft,
    splitTotal,
    splitOk,
    bankModes,
    setBankModes,
    bankRefs,
    setBankRefs,
    cashUsed,
    choice,
    setChoice,
    editing,
    setEditing,
    amount,
    setAmount,
    from,
    setFrom,
    bankId,
    setBankId,
    reference,
    setReference,
    remarks,
    setRemarks,
    day,
    setDay,
    capped,
    setCapped,
    capText: capped === null ? null : t("capOnly", { amount: rupees(capped) }),
    saveError,
    tried,
    employee,
    value,
    cashHeld,
    bankHeld,
    bank,
    most,
    complete,
    steps,
    // an edit (History): its employee locked, its day kept in its own month
    isEdit,
    // an edit: the days it can move to (its own month, never after today)
    dayMin: ed?.dayMin ?? null,
    dayMax: ed?.dayMax ?? null,
    current,
    index,
    reachable,
    summaryOpen,
    setSummaryOpen,
    stepName,
    missingOf,
    summary,
    leaveDialog,
    show,
    next,
    saving,
    save,
  };
}

export type SalaryEntryState = ReturnType<typeof useSalaryEntryState>;

const SalaryEntryContext = createContext<SalaryEntryState | null>(null);
export const SalaryEntryProvider = SalaryEntryContext.Provider;

export function useSalaryEntry() {
  const value = useContext(SalaryEntryContext);
  if (!value) throw new Error("useSalaryEntry is used outside SalaryEntryProvider");
  return value;
}
