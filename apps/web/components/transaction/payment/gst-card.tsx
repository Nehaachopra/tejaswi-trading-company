"use client";

import { Reveal } from "~/components/ui/reveal";
import { DateInput } from "~/components/ui/date-input";
import { RequiredMark } from "~/components/ui/required-mark";
import { PlacePicker } from "../shared/place-picker";
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
        {/* GSTIN, then the bill's number and date side by side, then its rate as an accordion */}
        <div className="flex flex-col gap-3 sm:max-w-xl">
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
          <div className="grid grid-cols-2 gap-3">
            <label className="flex min-w-0 flex-col gap-2.5 text-xs font-semibold">
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
            <label className="flex min-w-0 flex-col gap-2.5 text-xs font-semibold">
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
          </div>
          {/* the rate: every rate open as a row until one is picked, then collapsed to it with ▾ */}
          <div className="flex flex-col gap-2.5 text-xs font-semibold">
            <span>
              {t("gstRate")}
              <RequiredMark />
            </span>
            <PlacePicker
              label={t("gstRate")}
              places={BILL_RATES.map((r) => ({ id: String(r), name: `${r}%`, disabled: false }))}
              value={billRate === null ? null : String(billRate)}
              onPick={(id) => setBillRate(Number(id) as (typeof BILL_RATES)[number])}
              invalid={tried && billRate === null}
            />
          </div>
        </div>
      </Reveal>
    </>
  );
}
