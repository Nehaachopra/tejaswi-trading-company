"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { ArrowLeft } from "lucide-react";

import { Button } from "~/components/ui/button";
import { FieldError } from "~/components/ui/field";
import { Input } from "~/components/ui/input";
import { InputOTP, InputOTPGroup, InputOTPSlot } from "~/components/ui/input-otp";
import { Label } from "~/components/ui/label";
import { Spinner } from "~/components/ui/spinner";
import { trpc } from "~/trpc/client";

const COUNTRY_CODE = "+91";

type ErrorKey = "invalidPhone" | "notRegistered" | "tooMany" | "wrongCode" | "network";

// server messages are English; the code picks the translated message instead
function errorKey(error: { data?: { code?: string } | null } | null, step: "phone" | "otp"): ErrorKey {
  switch (error?.data?.code) {
    case "FORBIDDEN":
      return "notRegistered";
    case "TOO_MANY_REQUESTS":
      return "tooMany";
    case "UNAUTHORIZED":
      return "wrongCode";
    case "BAD_REQUEST":
      return step === "phone" ? "invalidPhone" : "wrongCode";
    default:
      return "network";
  }
}

function formatPhone(phone: string) {
  return `${COUNTRY_CODE} ${phone.slice(0, 5)} ${phone.slice(5)}`;
}

export function LoginFlow() {
  const t = useTranslations("login");
  const router = useRouter();

  const [step, setStep] = useState<"phone" | "otp">("phone");
  const [phone, setPhone] = useState("");
  const [code, setCode] = useState("");
  const [error, setError] = useState<ErrorKey | null>(null);
  const [resendAt, setResendAt] = useState(0);
  const [now, setNow] = useState(() => Date.now());

  const requestOtp = trpc.auth.requestOtp.useMutation();
  const verifyOtp = trpc.auth.verifyOtp.useMutation();

  // ticks the resend countdown once a second while it is running
  useEffect(() => {
    if (resendAt <= now) return;
    const timer = setTimeout(() => setNow(Date.now()), 1000);
    return () => clearTimeout(timer);
  }, [resendAt, now]);

  const secondsLeft = Math.max(0, Math.ceil((resendAt - now) / 1000));

  function sendCode() {
    if (!/^\d{10}$/.test(phone)) {
      setError("invalidPhone");
      return;
    }
    setError(null);
    requestOtp.mutate(
      { countryCode: COUNTRY_CODE, phone },
      {
        onSuccess: ({ resendAfterSeconds }) => {
          setStep("otp");
          setCode("");
          setNow(Date.now());
          setResendAt(Date.now() + resendAfterSeconds * 1000);
        },
        onError: (e) => setError(errorKey(e, "phone")),
      },
    );
  }

  function verify(value: string) {
    if (value.length !== 6 || verifyOtp.isPending) return;
    setError(null);
    verifyOtp.mutate(
      { countryCode: COUNTRY_CODE, phone, code: value },
      {
        onSuccess: () => {
          router.replace("/");
          router.refresh();
        },
        onError: (e) => {
          setError(errorKey(e, "otp"));
          setCode("");
        },
      },
    );
  }

  if (step === "phone") {
    return (
      <form
        className="flex flex-col gap-6"
        onSubmit={(event) => {
          event.preventDefault();
          sendCode();
        }}
      >
        <div className="flex flex-col gap-1.5">
          <h1 className="font-heading text-2xl font-bold">{t("title")}</h1>
          <p className="text-muted-foreground">{t("subtitle")}</p>
        </div>

        <div className="flex flex-col gap-2">
          <Label htmlFor="phone">{t("phoneLabel")}</Label>
          <div className="flex gap-2">
            <span className="flex h-12 items-center rounded-4xl bg-input/50 px-4 text-base font-medium text-muted-foreground">
              {COUNTRY_CODE}
            </span>
            <Input
              id="phone"
              type="tel"
              inputMode="numeric"
              autoComplete="tel-national"
              autoFocus
              maxLength={10}
              placeholder="98765 43210"
              className="h-12 flex-1 text-base tracking-wide"
              aria-invalid={error === "invalidPhone" || error === "notRegistered" || undefined}
              aria-describedby="phone-hint"
              value={phone}
              onChange={(event) => {
                setPhone(event.target.value.replace(/\D/g, "").slice(0, 10));
                setError(null);
              }}
            />
          </div>
          {error ? (
            <FieldError>{t(`errors.${error}`)}</FieldError>
          ) : (
            <p id="phone-hint" className="text-sm text-muted-foreground">
              {t("phoneHint")}
            </p>
          )}
        </div>

        <Button type="submit" size="lg" className="h-12 w-full text-base" disabled={requestOtp.isPending}>
          {requestOtp.isPending && <Spinner data-icon="inline-start" />}
          {t("continue")}
        </Button>
      </form>
    );
  }

  return (
    <form
      className="flex flex-col gap-6"
      onSubmit={(event) => {
        event.preventDefault();
        verify(code);
      }}
    >
      <Button
        type="button"
        variant="ghost"
        className="-ml-3 h-11 self-start"
        onClick={() => {
          setStep("phone");
          setError(null);
        }}
      >
        <ArrowLeft data-icon="inline-start" />
        {t("change")}
      </Button>

      <div className="flex flex-col gap-1.5">
        <h1 className="font-heading text-2xl font-bold">{t("otpTitle")}</h1>
        <p className="text-muted-foreground">{t("otpSubtitle", { phone: formatPhone(phone) })}</p>
      </div>

      <div className="flex flex-col gap-2">
        <InputOTP
          maxLength={6}
          autoFocus
          inputMode="numeric"
          autoComplete="one-time-code"
          value={code}
          onChange={(value) => {
            setCode(value);
            setError(null);
          }}
          onComplete={verify}
          disabled={verifyOtp.isPending}
          aria-invalid={error ? true : undefined}
        >
          <InputOTPGroup>
            {Array.from({ length: 6 }, (_, index) => (
              <InputOTPSlot key={index} index={index} className="size-12" />
            ))}
          </InputOTPGroup>
        </InputOTP>
        {error && <FieldError>{t(`errors.${error}`)}</FieldError>}
      </div>

      <Button
        type="submit"
        size="lg"
        className="h-12 w-full text-base"
        disabled={code.length !== 6 || verifyOtp.isPending}
      >
        {verifyOtp.isPending && <Spinner data-icon="inline-start" />}
        {t("verify")}
      </Button>

      <Button
        type="button"
        variant="link"
        className="h-11 self-center"
        disabled={secondsLeft > 0 || requestOtp.isPending}
        onClick={sendCode}
      >
        {secondsLeft > 0 ? t("resendIn", { seconds: secondsLeft }) : t("resend")}
      </Button>
    </form>
  );
}
