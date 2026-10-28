"use client";

import { ArrowLeft, Check } from "lucide-react";
import { useTranslations } from "next-intl";
import { useRouter } from "next/navigation";
import { useState } from "react";

import { fieldClass, SubmitButton } from "~/components/ui/card-form";
import { FieldMessage } from "~/components/ui/field-message";
import { NumberInput } from "~/components/ui/number-input";
import { wordsToNumber } from "~/lib/number-words";
import { MicField } from "~/components/ui/mic-button";
import { RequiredMark } from "~/components/ui/required-mark";
import { PickMenu } from "~/components/stock/pick-menu";
import { rupees, titleCase } from "~/lib/format";
import { cn } from "~/lib/utils";
import { trpc } from "~/trpc/client";

import { indiaDay } from "../account/balance";
import { useLedgerName } from "../account/ledger-name";
import { draftInput as partyInput, draftOk as partyOk, emptyDraft as emptyParty, PartyFields, type PartyDraft } from "../account/party/party-fields";
import { type LedgerChoice, LedgerPicker, type Pickable, type ReceiptKind } from "./ledger-picker";
import { emptyLoan, type LoanDraft, loanInput, loanProblems, LoanTerms } from "./loan-terms";
import { PartyPick, PhoneMatches, useNameMatches, usePhoneMatches } from "./party-finder";

type Step = "what" | "party" | "loan" | "where";

const REFERENCE_MAX = 30;
const REMARKS_MAX = 100;

const input = (bad: boolean) => `min-h-11 w-full min-w-0 px-3 text-base placeholder:text-chestnut/60 ${fieldClass(bad)}`;
// a part of the form that belongs together (the source, where it went, the day): a faint frame around it
const group = "flex flex-col gap-3 rounded-control border border-chestnut/20 p-3 sm:gap-4 sm:p-4";
const toggle = (on: boolean) => cn("min-h-11 flex-1 rounded-control border px-3 text-sm font-semibold", on ? "border-chestnut bg-chestnut text-ivory" : "border-chestnut/50");

// what the money came in for, in the order people reach for them; the ones that can add someone on the way: a party
// (a payment or a loan) or a plain ledger (a refund or an income source); Capital is built in
const KINDS: ReceiptKind[] = ["customer", "loanTaken", "loanReturned", "capital", "refund", "otherIncome"];
const CAN_ADD: ReceiptKind[] = ["customer", "loanTaken", "loanReturned", "refund", "otherIncome"];

// a ledger of a customer or supplier: only they deduct TDS
const isParty = (l: Pickable) => l.masterKey === "debtors" || l.masterKey === "creditors" || l.masterKey === "debtorCreditors" || l.masterKey === "parties";

// the TDS a party deducted, on what it owed (as the server works it out): owed = received ÷ (1 − rate)
const tdsOn = (received: number, rate: number) => Math.round((received / (1 - rate / 100) - received) * 100) / 100;

// a spoken amount ("twenty five thousand") into a number field; anything that isn't a number is left alone
const saidAmount = (said: string, set: (raw: string) => void) => {
  const n = wordsToNumber(said);
  if (n !== null) set(String(n));
};

// a day as the moment it's saved at: now for today, noon (India) for any other day
const momentOf = (day: string) => (day === indiaDay(new Date()) ? new Date() : new Date(`${day}T12:00:00+05:30`));

// what a failed save means
function errorKey(err: unknown) {
  const data = (err as { data?: { code?: string } })?.data;
  if (!data) return "network";
  if (data.code === "CONFLICT") return "taken";
  if (data.code === "BAD_REQUEST") return "check";
  return "failed";
}

// /transaction/receipt: money coming in, in steps. What and who (amount, source, who it came from, any TDS a
// customer deducted); someone new is found (phone, then name) or added; a loan received gives its terms; then where it
// went and the day. A save goes to the receipt's own page (its number, voucher and the balances it moved)
export function ReceiptForm({ isAdmin }: { isAdmin: boolean }) {
  const t = useTranslations("transactions.receipt");
  const utils = trpc.useUtils();
  const router = useRouter();
  const nameOf = useLedgerName();
  const banks = trpc.accounts.bank.pickable.useQuery();
  const create = trpc.transactions.receipt.create.useMutation();

  const [step, setStep] = useState<Step>("what");
  const [kind, setKind] = useState<ReceiptKind | null>(null);
  const [amount, setAmount] = useState("");
  const [from, setFrom] = useState<LedgerChoice>(null);
  // someone new, as typed on its details step
  const [newParty, setNewParty] = useState<PartyDraft>(() => emptyParty());
  const [loan, setLoan] = useState<LoanDraft>(emptyLoan);
  const [into, setInto] = useState<"cash" | "bank">("cash");
  const [bankId, setBankId] = useState<string | null>(null);
  const [reference, setReference] = useState("");
  const [tds, setTds] = useState(false);
  const [rate, setRate] = useState("");
  const [day, setDay] = useState(() => indiaDay(new Date()));
  const [remarks, setRemarks] = useState("");
  const [tried, setTried] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // a new party's phone someone already has: that party fills the step (the one match, or the one picked of several),
  // unless "Not them" was said for this phone
  const [picked, setPicked] = useState<Pickable | null>(null);
  const [notThem, setNotThem] = useState("");
  // the name suggestions, closed for the name they were closed on
  const [namesClosed, setNamesClosed] = useState("");

  // what's typed, worked out
  const value = Number(amount) || 0;
  // a customer's payment, from a party picked or new: only then is TDS deducted
  const party = kind === "customer" && ((from?.kind === "ledger" && isParty(from.ledger)) || from?.kind === "party");
  const rateValue = Number(rate) || 0;
  const tdsAmount = party && tds && rateValue > 0 && rateValue < 100 ? tdsOn(value, rateValue) : 0;
  const bank = banks.data?.find((b) => b.id === bankId);
  // someone new has a step to find or add them; a loan received has its terms
  const steps: Step[] = ["what", ...(from?.kind === "party" ? (["party"] as const) : []), ...(kind === "loanTaken" ? (["loan"] as const) : []), "where"];
  const at = steps.indexOf(step);
  // the parties already added with the new party's phone, and the one filling the step
  const phoneMatches = usePhoneMatches(newParty.phone, kind ?? "customer");
  const dismissed = notThem !== "" && notThem === newParty.phone;
  const matched = dismissed ? null : phoneMatches.length === 1 ? phoneMatches[0]! : (phoneMatches.find((l) => l.id === picked?.id) ?? null);
  const nameMatches = useNameMatches(newParty.name, kind ?? "customer");
  const showNames = !matched && phoneMatches.length === 0 && nameMatches.length > 0 && namesClosed !== newParty.name;

  // what's missing on each step
  const bad = {
    what: { amount: value <= 0, kind: kind === null, from: from === null, rate: party && tds && !(rateValue > 0 && rateValue < 100) },
    party: { details: !matched && !partyOk(newParty, true) },
    loan: { terms: Object.values(loanProblems(loan)).some(Boolean) },
    where: { bank: into === "bank" && !bank, day: day === "" },
  };
  const stepOk = (s: Step) => !Object.values(bad[s]).some(Boolean);

  // on to the next step, once this one is filled in
  function next() {
    setTried(true);
    setError(null);
    if (!stepOk(step)) return setError(t("errors.fill"));
    // the phone is someone already added: use them
    if (step === "party" && matched) return pickExisting(matched);
    setTried(false);
    setStep(steps[at + 1]!);
  }

  // someone already added, used in place of the new party
  function pickExisting(ledger: Pickable) {
    setFrom({ kind: "ledger", ledger });
    setError(null);
    setTried(false);
    setStep(kind === "loanTaken" ? "loan" : "where");
  }

  // back a step; nothing typed is lost
  function back() {
    setError(null);
    setTried(false);
    setStep(steps[at - 1]!);
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (at < steps.length - 1) return next();
    setTried(true);
    setError(null);
    if (!steps.every(stepOk)) return setError(t("errors.fill"));
    try {
      const r = await create.mutateAsync({
        dateTime: momentOf(day),
        receivedFor: kind!,
        receivedFromLedgerId: from!.kind === "ledger" ? from!.ledger.id : null,
        newLedger: from!.kind === "new" ? { name: from!.name } : null,
        newParty: from!.kind === "party" ? partyInput(newParty) : null,
        loan: kind === "loanTaken" ? loanInput(loan) : null,
        amount: value,
        settledIn: into,
        bankDetailsId: into === "bank" ? bankId : null,
        referenceNumber: into === "bank" ? reference : "",
        tdsRate: tdsAmount > 0 ? rateValue : null,
        remarks,
      });
      void utils.accounts.invalidate();
      // on to the receipt's own page, with what the save gave back already in hand (so its balances roll at once);
      // replace, so going back doesn't land on the filled form
      utils.transactions.receipt.get.setData({ transactionId: r.transactionId }, r);
      utils.transactions.receipt.balances.setData({ transactionId: r.transactionId }, r.balances);
      router.replace(`/transaction/receipt/${r.transactionId}`);
    } catch (err) {
      setError(t(`errors.${errorKey(err)}`));
    }
  }

  return (
    <main className="mx-auto max-w-xl px-4 pb-28 pt-6 sm:px-6">
      <h1 className="sr-only">{t("title")}</h1>

      <form onSubmit={submit} noValidate className="on-ivory flex flex-col gap-4 rounded-control bg-ivory p-4 text-chestnut sm:p-6">
        {/* where we are: numbered steps in a row, joined by a line; done ones show a tick, the ones reached are filled. It stays under the
            header while the step scrolls */}
        <ol
          className="sticky top-16 z-20 -mx-4 -mt-4 flex items-center justify-center rounded-t-control border-b border-chestnut/10 bg-ivory px-4 py-3 sm:-mx-6 sm:-mt-6 sm:px-6"
          aria-label={t("stepsLabel")}
        >
          {steps.map((s, i) => (
            <li key={s} aria-current={s === step ? "step" : undefined} className="flex items-center">
              {i > 0 && <span aria-hidden className={cn("mx-1.5 h-0.5 w-8 rounded-full", i <= at ? "bg-chestnut" : "bg-chestnut/20")} />}
              <span
                className={cn(
                  "grid size-9 shrink-0 place-items-center rounded-full border-2 font-heading text-base font-bold",
                  i <= at ? "border-chestnut bg-chestnut text-ivory" : "border-chestnut/30 text-chestnut/60",
                  s === step && "ring-2 ring-chestnut/30 ring-offset-2 ring-offset-ivory",
                )}
              >
                {i < at ? <Check className="size-5" strokeWidth={3} aria-hidden /> : i + 1}
                <span className="sr-only"> {t(`steps.${s}`)}</span>
              </span>
            </li>
          ))}
        </ol>

        {step === "what" && (
          <>
            {/* how much came in */}
            <label className="flex flex-col gap-1.5 text-sm font-medium">
              <span>
                {t("amount")}
                <RequiredMark />
              </span>
              <MicField onText={(said) => saidAmount(said, setAmount)}>
                <NumberInput
                  value={amount}
                  onChange={setAmount}
                  decimals={2}
                  maxDigits={13}
                  placeholder="0"
                  aria-invalid={(tried && bad.what.amount) || undefined}
                  className={cn(input(tried && bad.what.amount), "min-h-14 pr-11 font-heading text-2xl font-bold")}
                />
              </MicField>
            </label>

            {/* the source: what kind it is, then (once picked) who it came from, and any TDS a customer deducted */}
            <fieldset className={group}>
              <legend className="sr-only">{t("source")}</legend>
              <span className="text-sm font-medium">
                {t("source")}
                <RequiredMark />
              </span>
              <div role="radiogroup" aria-label={t("source")} className={cn("flex flex-wrap gap-2 rounded-control", tried && bad.what.kind && "outline-2 outline-offset-2 outline-danger")}>
                {KINDS.map((k) => (
                  <button
                    key={k}
                    type="button"
                    role="radio"
                    aria-checked={kind === k}
                    onClick={() => {
                      if (k === kind) return;
                      setKind(k);
                      setFrom(null);
                      setTds(false);
                    }}
                    className={cn("min-h-10 rounded-control border px-3 text-sm font-medium", kind === k ? "border-chestnut bg-chestnut text-ivory" : "border-chestnut/50")}
                  >
                    {t(`kinds.${k}`)}
                  </button>
                ))}
              </div>

              {kind && (
                <div className="flex flex-col gap-1.5 text-sm font-medium">
                  <span>
                    {t("from")}
                    <RequiredMark />
                  </span>
                  <LedgerPicker
                    purpose="receipt"
                    receiptKind={kind}
                    value={from}
                    onChange={(c) => {
                      setFrom(c);
                      if (c?.kind === "party") setNewParty(emptyParty());
                      if (kind !== "customer" || c === null || c.kind === "new") setTds(false);
                    }}
                    canAdd={isAdmin && CAN_ADD.includes(kind)}
                    addParty={kind === "customer" || kind === "loanTaken" || kind === "loanReturned"}
                    invalid={tried && bad.what.from}
                    placeholder={t("pickFrom")}
                  />
                </div>
              )}

              {party && (
                <>
                  <label className="flex min-h-11 items-center gap-3 text-sm font-medium">
                    <input type="checkbox" checked={tds} onChange={(e) => setTds(e.target.checked)} className="size-5 accent-chestnut" />
                    {t("tdsDeducted")}
                  </label>
                  {tds && (
                    <div className="flex items-end gap-3">
                      <label className="flex w-32 flex-col gap-1.5 text-sm font-medium">
                        <span>
                          {t("tdsRate")}
                          <RequiredMark />
                        </span>
                        <MicField onText={(said) => saidAmount(said, setRate)}>
                          <NumberInput value={rate} onChange={setRate} decimals={2} maxDigits={2} placeholder="2" aria-invalid={(tried && bad.what.rate) || undefined} className={cn(input(tried && bad.what.rate), "pr-11")} />
                        </MicField>
                      </label>
                      <p className="min-h-11 flex-1 content-center text-sm">
                        {t("tdsAmount")} <span className="tabular font-semibold">{rupees(tdsAmount)}</span>
                      </p>
                    </div>
                  )}
                </>
              )}
            </fieldset>
          </>
        )}

        {/* someone new: the party form with the phone first. A phone someone already has fills the step with them (read
            only; Next uses them); several with it are picked from; "Not them" brings the empty form back */}
        {step === "party" && kind && (
          <fieldset className={group}>
            <legend className="sr-only">{t("party")}</legend>
            <span className="text-sm font-medium">{t("party")}</span>
            <PartyFields
              draft={newParty}
              onChange={(patch) => setNewParty((d) => ({ ...d, ...patch }))}
              tried={tried}
              strict
              phoneFirst
              onlyPhone={!!matched}
              belowPhone={!matched && !dismissed && phoneMatches.length > 1 && <PhoneMatches matches={phoneMatches} onUse={setPicked} />}
              belowName={
                showNames && <PhoneMatches matches={nameMatches} onUse={pickExisting} title={t("finder.similar")} onClose={() => setNamesClosed(newParty.name)} />
              }
            />
            {matched?.party && (
              <div className="flex flex-col gap-3 rounded-control border border-chestnut/40 bg-chestnut/[0.04] p-3">
                <span className="text-xs font-semibold">{t("finder.already")}</span>
                <PartyPick ledger={matched} party={matched.party} />
                <button
                  type="button"
                  onClick={() => {
                    setNotThem(newParty.phone);
                    setPicked(null);
                  }}
                  className="self-start text-sm underline underline-offset-2"
                >
                  {t("finder.notThem")}
                </button>
              </div>
            )}
          </fieldset>
        )}

        {step === "loan" && (
          <>
            {/* the loan's terms */}
            <fieldset className={group}>
              <legend className="sr-only">{t("loanTerms")}</legend>
              <span className="text-sm font-medium">
                {t("loanTerms")}
                <span className="font-normal"> · {from?.kind === "ledger" ? nameOf(from.ledger) : newParty.name}</span>
              </span>
              <LoanTerms draft={loan} onChange={(patch) => setLoan((d) => ({ ...d, ...patch }))} tried={tried} />
            </fieldset>
          </>
        )}

        {step === "where" && (
          <>
            {/* where it went: cash, or one of the bank accounts with its reference */}
            <fieldset className={group}>
              <legend className="sr-only">{t("into")}</legend>
              <span className="text-sm font-medium">
                {t("into")}
                <RequiredMark />
              </span>
              <div className="flex gap-2">
                <button type="button" aria-pressed={into === "cash"} onClick={() => setInto("cash")} className={toggle(into === "cash")}>
                  {t("cash")}
                </button>
                <button type="button" aria-pressed={into === "bank"} onClick={() => setInto("bank")} className={toggle(into === "bank")}>
                  {t("bank")}
                </button>
              </div>
              {into === "bank" &&
                (banks.data?.length === 0 ? (
                  <p className="text-sm">{t("noBanks")}</p>
                ) : (
                  <>
                    <PickMenu
                      label={t("bank")}
                      current={bank ? `${titleCase(bank.bankName)} ••${bank.last4}` : t("pickBank")}
                      options={(banks.data ?? []).map((b) => ({ id: b.id, name: `${titleCase(b.bankName)} ••${b.last4}` }))}
                      picked={bankId}
                      onPick={setBankId}
                      invalid={tried && bad.where.bank}
                      className={fieldClass(tried && bad.where.bank)}
                      searchable={(banks.data?.length ?? 0) > 5}
                      searchLabel={t("searchBank")}
                      noMatch={t("noBankMatch")}
                    />
                    <label className="flex flex-col gap-1.5 text-sm font-medium">
                      {t("reference")}
                      <MicField onText={(said) => setReference((said.replace(/\s+/g, "").toUpperCase()).slice(0, REFERENCE_MAX))}>
                        <input value={reference} maxLength={REFERENCE_MAX} onChange={(e) => setReference(e.target.value)} className={cn(input(false), "pr-11")} />
                      </MicField>
                    </label>
                  </>
                ))}
            </fieldset>

            {/* the day, and any remarks */}
            <div className={cn(group, "sm:grid sm:grid-cols-[11rem_1fr]")}>
              <label className="flex flex-col gap-1.5 text-sm font-medium">
                <span>
                  {t("date")}
                  <RequiredMark />
                </span>
                <input type="date" value={day} onChange={(e) => setDay(e.target.value)} aria-invalid={(tried && bad.where.day) || undefined} className={input(tried && bad.where.day)} />
              </label>
              <label className="flex flex-col gap-1.5 text-sm font-medium">
                {t("remarks")}
                <MicField onText={(said) => setRemarks((v) => (v.trim() ? `${v.trim()} ${said}` : said).slice(0, REMARKS_MAX))}>
                  <input value={remarks} maxLength={REMARKS_MAX} onChange={(e) => setRemarks(e.target.value)} className={cn(input(false), "pr-11")} />
                </MicField>
              </label>
            </div>
          </>
        )}

        {error && <FieldMessage>{error}</FieldMessage>}

        {/* back, and next or save */}
        <div className="flex gap-3">
          {at > 0 && (
            <button type="button" onClick={back} className="flex min-h-12 items-center justify-center gap-2 rounded-control border border-chestnut/50 px-4 font-semibold">
              <ArrowLeft className="size-4" aria-hidden /> {t("back")}
            </button>
          )}
          <div className="flex-1 [&>button]:w-full">
            <SubmitButton busy={create.isPending}>{at < steps.length - 1 ? t("next") : t("save")}</SubmitButton>
          </div>
        </div>
      </form>
    </main>
  );
}
