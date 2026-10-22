"use client";

import { useRouter } from "next/navigation";
import { createContext, useContext, useEffect, useState } from "react";

import { trpc } from "~/trpc/client";

export type Step = "phone" | "code";
export type LoginError = "invalidPhone" | "notRegistered" | "tooMany" | "wrongCode" | "network";

export const CODE_LENGTH = 6;
const emptyCode = () => Array<string>(CODE_LENGTH).fill("");

// the server's reason, turned into one of the translated messages. No data.code means the
// request never got an answer from the API
function errorKey(error: unknown, step: Step): LoginError {
  const code = (error as { data?: { code?: string } } | null)?.data?.code;
  switch (code) {
    case "NOT_FOUND":
    case "FORBIDDEN":
      return "notRegistered";
    case "TOO_MANY_REQUESTS":
      return "tooMany";
    case "BAD_REQUEST":
      return step === "phone" ? "invalidPhone" : "wrongCode";
    default:
      return "network";
  }
}

function useLoginState(next: string) {
  const router = useRouter();

  const [step, setStep] = useState<Step>("phone");
  const [phone, setPhone] = useState("");
  const [code, setCode] = useState<string[]>(emptyCode);
  const [error, setError] = useState<LoginError | null>(null);
  const [resendIn, setResendIn] = useState(0);
  // stays true after a correct code while the next page loads, so the spinner doesn't stop early
  const [signingIn, setSigningIn] = useState(false);

  const requestOtp = trpc.auth.requestOtp.useMutation();
  const verifyOtp = trpc.auth.verifyOtp.useMutation();

  useEffect(() => {
    if (resendIn <= 0) return;
    const timer = setTimeout(() => setResendIn((s) => s - 1), 1000);
    return () => clearTimeout(timer);
  }, [resendIn]);

  const phoneValid = /^\d{10}$/.test(phone);

  async function sendCode() {
    if (!phoneValid) {
      setError("invalidPhone");
      return;
    }
    setError(null);
    try {
      const result = await requestOtp.mutateAsync({ countryCode: "+91", phone });
      setResendIn(result.resendInSeconds);
      setCode(emptyCode());
      setStep("code");
    } catch (e) {
      setError(errorKey(e, "phone"));
    }
  }

  // false when the code was refused, so the boxes can take focus again
  async function verify(digits: string[]) {
    const value = digits.join("");
    if (value.length !== CODE_LENGTH || verifyOtp.isPending) return true;
    setError(null);
    try {
      await verifyOtp.mutateAsync({ countryCode: "+91", phone, code: value });
      setSigningIn(true);
      router.replace(next);
      router.refresh();
      return true;
    } catch (e) {
      setError(errorKey(e, "code"));
      setCode(emptyCode());
      return false;
    }
  }

  function changePhone(value: string) {
    setPhone(value.replace(/\D/g, "").slice(0, 10));
    setError(null);
  }

  function backToPhone() {
    setStep("phone");
    setError(null);
  }

  return {
    step,
    phone,
    code,
    setCode,
    error,
    clearError: () => setError(null),
    resendIn,
    sending: requestOtp.isPending,
    verifying: verifyOtp.isPending || signingIn,
    sendCode,
    verify,
    changePhone,
    backToPhone,
  };
}

const LoginContext = createContext<ReturnType<typeof useLoginState> | null>(null);

// phone number → 6-digit code → signed in; the steps read this instead of passing props around
export function LoginProvider({ next, children }: { next: string; children: React.ReactNode }) {
  return <LoginContext.Provider value={useLoginState(next)}>{children}</LoginContext.Provider>;
}

export function useLogin() {
  const login = useContext(LoginContext);
  if (!login) throw new Error("useLogin must be used inside <LoginProvider>");
  return login;
}
