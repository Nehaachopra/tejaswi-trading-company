"use client";

import { useTranslations } from "next-intl";

import { fieldClass, SubmitButton } from "~/components/ui/card-form";
import { FieldMessage } from "~/components/ui/field-message";

import { useLogin } from "./login-provider";

export function PhoneStep() {
  const t = useTranslations("login");
  const { phone, changePhone, error, sending, sendCode } = useLogin();

  return (
    <form
      className="mt-8 flex flex-col gap-6"
      onSubmit={(e) => {
        e.preventDefault();
        void sendCode();
      }}
    >
      <div>
        <h1 className="font-heading text-3xl font-bold">{t("title")}</h1>
        <p className="mt-1 text-sm text-chestnut/80">{t("subtitle")}</p>
      </div>

      <label className="flex flex-col gap-1.5">
        <span className="text-sm">{t("phoneLabel")}</span>
        <span className={`flex min-h-12 items-center gap-2 px-3 focus-within:border-chestnut ${fieldClass(!!error)}`}>
          <span className="text-chestnut/80 tabular">+91</span>
          <input
            id="login-phone"
            type="tel"
            inputMode="numeric"
            autoComplete="tel-national"
            autoFocus
            maxLength={10}
            value={phone}
            onChange={(e) => changePhone(e.target.value)}
            placeholder="98765 43210"
            aria-invalid={error ? true : undefined}
            aria-describedby="login-phone-hint"
            className="tabular min-w-0 flex-1 bg-transparent text-lg tracking-wide outline-none placeholder:text-chestnut/50"
          />
        </span>
        <span id="login-phone-hint" className="text-xs text-chestnut/80">
          {t("phoneHint")}
        </span>
      </label>

      {error && <FieldMessage>{t(`errors.${error}`)}</FieldMessage>}

      <SubmitButton busy={sending}>{t("continue")}</SubmitButton>
    </form>
  );
}
