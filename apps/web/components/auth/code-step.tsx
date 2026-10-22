"use client";

import { ArrowLeft } from "lucide-react";
import { useTranslations } from "next-intl";
import { useEffect, useRef } from "react";

import { fieldClass, SubmitButton } from "~/components/ui/card-form";
import { FieldMessage } from "~/components/ui/field-message";
import { Spinner } from "~/components/ui/spinner";

import { CODE_LENGTH, useLogin } from "./login-provider";

const formatPhone = (digits: string) => `+91 ${digits.slice(0, 5)} ${digits.slice(5)}`;

// six boxes that take typing, paste and SMS autofill, and verify as soon as they're full
export function CodeStep() {
  const t = useTranslations("login");
  const { phone, code, setCode, error, clearError, resendIn, sending, verifying, sendCode, verify, backToPhone } = useLogin();
  const boxes = useRef<(HTMLInputElement | null)[]>([]);

  useEffect(() => {
    boxes.current[0]?.focus();
  }, []);

  async function submit(digits: string[]) {
    if (!(await verify(digits))) boxes.current[0]?.focus();
  }

  function typeDigits(from: number, raw: string) {
    const digits = raw.replace(/\D/g, "").slice(0, CODE_LENGTH - from).split("");
    if (digits.length === 0) return;
    const nextCode = [...code];
    digits.forEach((d, i) => (nextCode[from + i] = d));
    setCode(nextCode);
    boxes.current[Math.min(from + digits.length, CODE_LENGTH - 1)]?.focus();
    if (nextCode.every(Boolean)) void submit(nextCode);
  }

  return (
    <form
      className="mt-8 flex flex-col gap-6"
      onSubmit={(e) => {
        e.preventDefault();
        void submit(code);
      }}
    >
      <div>
        <button
          type="button"
          onClick={backToPhone}
          className="-ml-1 mb-3 flex min-h-11 items-center gap-1.5 rounded-control px-1 text-sm text-chestnut/80 hover:text-chestnut"
        >
          <ArrowLeft className="size-4" aria-hidden /> {t("change")}
        </button>
        <h1 className="font-heading text-3xl font-bold">{t("otpTitle")}</h1>
        <p className="tabular mt-1 text-sm text-chestnut/80">{t("otpSubtitle", { phone: formatPhone(phone) })}</p>
      </div>

      <fieldset>
        <legend className="sr-only">{t("otpTitle")}</legend>
        <div className="grid grid-cols-6 gap-2">
          {code.map((digit, i) => (
            <input
              key={i}
              ref={(el) => {
                boxes.current[i] = el;
              }}
              id={`login-code-${i}`}
              type="text"
              inputMode="numeric"
              autoComplete={i === 0 ? "one-time-code" : "off"}
              maxLength={i === 0 ? CODE_LENGTH : 1}
              aria-label={`Digit ${i + 1} of ${CODE_LENGTH}`}
              aria-invalid={error ? true : undefined}
              value={digit}
              onChange={(e) => {
                clearError();
                if (e.target.value === "") {
                  const nextCode = [...code];
                  nextCode[i] = "";
                  setCode(nextCode);
                } else {
                  typeDigits(i, e.target.value);
                }
              }}
              onKeyDown={(e) => {
                if (e.key === "Backspace" && !code[i] && i > 0) boxes.current[i - 1]?.focus();
              }}
              onPaste={(e) => {
                e.preventDefault();
                typeDigits(i, e.clipboardData.getData("text"));
              }}
              className={`tabular h-14 w-full text-center text-2xl font-semibold ${fieldClass(!!error)}`}
            />
          ))}
        </div>
      </fieldset>

      {error && <FieldMessage>{t(`errors.${error}`)}</FieldMessage>}

      <SubmitButton busy={verifying} disabled={code.some((d) => !d)}>
        {t("verify")}
      </SubmitButton>

      <p className="text-center text-sm">
        {resendIn > 0 ? (
          <span className="tabular text-chestnut/80">{t("resendIn", { seconds: resendIn })}</span>
        ) : (
          <button
            type="button"
            onClick={() => void sendCode()}
            disabled={sending}
            aria-busy={sending}
            className="inline-flex min-h-11 items-center gap-2 rounded-control px-3 font-medium underline underline-offset-4 disabled:not-aria-busy:opacity-40 aria-busy:opacity-80"
          >
            {sending && <Spinner />}
            {t("resend")}
          </button>
        )}
      </p>
    </form>
  );
}
