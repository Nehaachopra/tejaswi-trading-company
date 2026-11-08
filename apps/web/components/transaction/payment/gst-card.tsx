"use client";

import { Reveal } from "~/components/ui/reveal";
import { DateInput } from "~/components/ui/date-input";
import { RequiredMark } from "~/components/ui/required-mark";
import { GstMode, BILL_RATES, BILL_NUMBER_MAX, input, chip } from "./shared";
import { usePaymentEntry } from "./state";

// an expense's GST: none, or on the bill (its GSTIN, number, date and rate)
export function GstCard() {
  const {
    t,
    gstMode,
    setGstMode,
    gstin,
    setGstin,
    billNumber,
    setBillNumber,
    billDate,
    setBillDate,
    billRate,
    setBillRate,
    day,
    tried,
    rent,
    landlord,
    gstinOk,
    complete,
  } = usePaymentEntry();
  const modes: GstMode[] = ["none", "bill"];
  return (
    <>
      <div role="radiogroup" aria-label={t("steps.gst")} className="flex flex-wrap gap-2">
        {modes.map((m) => (
          <button
            key={m}
            type="button"
            role="radio"
            aria-checked={gstMode === m}
            onClick={() => {
              setGstMode(m);
              setGstin(rent ? (landlord?.gstin ?? "") : "");
            }}
            className={chip(gstMode === m)}
          >
            {t(`gstModes.${m}`)}
          </button>
        ))}
      </div>
      <Reveal show={gstMode === "bill"}>
        <div className="grid gap-x-6 gap-y-3 sm:grid-cols-2">
          <label className="flex flex-col gap-2.5 text-xs font-semibold">
            <span>
              GSTIN
              <RequiredMark />
            </span>
            <input
              value={gstin}
              maxLength={15}
              onChange={(e) => setGstin(e.target.value.replace(/[^0-9a-z]/gi, "").toUpperCase())}
              aria-invalid={(gstin !== "" && !gstinOk) || (tried && gstin === "") || undefined}
              className={input(
                (gstin.length === 15 && !gstinOk) || (tried && !complete.gst && !gstinOk),
              )}
            />
          </label>
          <label className="flex flex-col gap-2.5 text-xs font-semibold">
            <span>
              {t("billNumber")}
              <RequiredMark />
            </span>
            <input
              value={billNumber}
              maxLength={BILL_NUMBER_MAX}
              onChange={(e) => setBillNumber(e.target.value.toUpperCase())}
              aria-invalid={(tried && billNumber === "") || undefined}
              className={input(tried && billNumber === "")}
            />
          </label>
          <label className="flex flex-col gap-2.5 text-xs font-semibold">
            <span>
              {t("billDate")}
              <RequiredMark />
            </span>
            <DateInput
              value={billDate}
              max={day}
              onChange={setBillDate}
              calendarLabel={t("billDate")}
              aria-invalid={(tried && billDate === "") || undefined}
              className={input(tried && billDate === "")}
            />
          </label>
          <div
            role="radiogroup"
            aria-label={t("gstRate")}
            className="flex flex-col gap-2.5 text-xs font-semibold"
          >
            <span>
              {t("gstRate")}
              <RequiredMark />
            </span>
            <div className="flex flex-wrap gap-2">
              {BILL_RATES.map((r) => (
                <button
                  key={r}
                  type="button"
                  role="radio"
                  aria-checked={billRate === r}
                  onClick={() => setBillRate(r)}
                  className={chip(billRate === r)}
                >
                  {r}%
                </button>
              ))}
            </div>
          </div>
        </div>
      </Reveal>
    </>
  );
}
