"use client";

import { appOfUpi, UPI_HANDLES, type UpiApp } from "@repo/trpc/client";
import { useTranslations } from "next-intl";

import { PickMenu } from "~/components/stock/pick-menu";
import { FieldMessage } from "~/components/ui/field-message";
import { RequiredMark } from "~/components/ui/required-mark";
import { Reveal } from "~/components/ui/reveal";
import { cn } from "~/lib/utils";

import { input } from "./shared";
import { useReceiptEntry } from "./state";

// the UPI apps, as the bank account form lists them
const APPS = Object.keys(UPI_HANDLES) as UpiApp[];

// by UPI into an account: what goes between Received by and its QR. An account with a UPI ID of ours needs nothing
// here (its QR shows it). With none, the admin types one (added to the account with the receipt); staff are told to
// ask the admin or pick another way
export function OurUpiPart({ accountId }: { accountId: string }) {
  const { t, isAdmin, banks } = useReceiptEntry();
  const acc = banks?.find((b) => b.id === accountId);
  if (!acc || acc.upiIds.length > 0) return null;
  return isAdmin ? (
    <OurUpiField accountId={accountId} />
  ) : (
    <FieldMessage className="mt-0">{t("noUpiStaff")}</FieldMessage>
  );
}

// whether an account's typed UPI ID is kept: fine, Saved (or left), and not being changed. Kept, its box goes and the
// ID shows above the QR with a pen
export function useOurUpiKept() {
  const { ourUpis, ourUpisLeft, ourUpiEditing, ourUpiProblem } = useReceiptEntry();
  return (accountId: string) =>
    ourUpiEditing !== accountId &&
    (ourUpis[accountId] ?? "").trim() !== "" &&
    ourUpiProblem(accountId) === null &&
    ourUpisLeft.includes(accountId);
}

// an account's UPI ID, where it has none: the app it's in (picked by itself from a known handle, @ybl → PhonePe),
// then the ID with Save beside it, as the bank account form asks them; its mistakes show once it's left (or Next is
// pressed). Gone once it's kept
function OurUpiField({ accountId }: { accountId: string }) {
  const {
    t,
    tpf,
    tried,
    ourUpis,
    setOurUpis,
    ourUpiApps,
    setOurUpiApps,
    setOurUpisLeft,
    ourUpisLeft,
    ourUpiEditing,
    setOurUpiEditing,
    ourUpiProblem,
  } = useReceiptEntry();
  const tb = useTranslations("accounts.bank.form");
  const kept = useOurUpiKept()(accountId);
  const value = ourUpis[accountId] ?? "";
  const app = ourUpiApps[accountId] ?? null;
  const problem = ourUpiProblem(accountId);
  const shown = tried || ourUpisLeft.includes(accountId);
  // the app is marked once the ID is there and none is picked
  const appBad = shown && value.trim() !== "" && app === null;
  const bad = (tried && value.trim() === "") || (shown && problem !== null && problem !== "app");
  const leave = () => setOurUpisLeft((l) => (l.includes(accountId) ? l : [...l, accountId]));
  return (
    <Reveal follow show={!kept} gap="0px">
      <div className="flex flex-col gap-3 text-xs font-semibold">
        {/* the app it's in */}
        <div className="flex flex-col gap-2">
          <span>
            {tb("provider")}
            <RequiredMark />
          </span>
          <div className="w-40">
            <PickMenu
              label={tb("provider")}
              current={app ? tb(`providers.${app}`) : tb("pickApp")}
              options={APPS.map((a) => ({ id: a, name: tb(`providers.${a}`) }))}
              picked={app ?? "phonepe"}
              onPick={(a) => setOurUpiApps((all) => ({ ...all, [accountId]: a }))}
              invalid={appBad}
              matchWidth
              inFlow
            />
          </div>
          {appBad && <FieldMessage className="mt-0">{tb("upiPickApp")}</FieldMessage>}
        </div>
        <label className="flex flex-col gap-2">
          <span>
            {t("ourUpi")}
            <RequiredMark />
          </span>
          <span className="flex min-w-0 items-center gap-2">
            <input
              autoFocus={ourUpiEditing === accountId}
              type="text"
              inputMode="email"
              autoCapitalize="none"
              autoCorrect="off"
              spellCheck={false}
              value={value}
              maxLength={255}
              onChange={(e) => {
                setOurUpisLeft((l) => l.filter((id) => id !== accountId));
                setOurUpiEditing(accountId);
                const next = e.target.value.toLowerCase().replace(/[^a-z0-9.@_-]/g, "");
                setOurUpis((u) => ({ ...u, [accountId]: next }));
                // a known handle picks its app by itself
                const known = appOfUpi(next);
                if (known) setOurUpiApps((all) => ({ ...all, [accountId]: known }));
              }}
              // its mistakes show once it's left
              onBlur={leave}
              placeholder="name@bank"
              aria-invalid={bad || undefined}
              className={cn(input(bad), "min-w-0 flex-1")}
            />
            {/* Save keeps it (a tap keeps the box from losing focus first) */}
            <button
              type="button"
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => {
                leave();
                if (problem === null && value.trim() !== "") setOurUpiEditing(null);
              }}
              disabled={value.trim() === ""}
              className="flex min-h-11 shrink-0 items-center justify-center rounded-control bg-chestnut px-4 text-sm font-semibold text-ivory disabled:opacity-40"
            >
              {tpf("saveUpi")}
            </button>
          </span>
          {bad && (
            <FieldMessage className="mt-0">
              {problem === "handle"
                ? t("ourUpiHandle", { handle: `@${value.trim().split("@")[1]}` })
                : problem === "wrongApp" && app
                  ? tb("upiWrongHandle", { app: tb(`providers.${app}`) })
                  : problem === "taken"
                    ? t("ourUpiTaken")
                    : t("ourUpiBad")}
            </FieldMessage>
          )}
        </label>
      </div>
    </Reveal>
  );
}
