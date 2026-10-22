"use client";

import Image from "next/image";

import { CodeStep } from "./code-step";
import { LoginProvider, useLogin } from "./login-provider";
import { PhoneStep } from "./phone-step";

// phone number → 6-digit code → signed in; the whole flow sits on one ivory card
export function LoginFlow({ next }: { next: string }) {
  return (
    <LoginProvider next={next}>
      <section className="w-full max-w-sm rounded-control bg-ivory p-6 text-chestnut sm:p-8">
        <Image src="/logo-transparent.png" alt="Tejaswi Trading Company" width={1200} height={400} priority className="mx-auto h-auto w-56" />
        <CurrentStep />
      </section>
    </LoginProvider>
  );
}

function CurrentStep() {
  const { step } = useLogin();
  return step === "phone" ? <PhoneStep /> : <CodeStep />;
}
