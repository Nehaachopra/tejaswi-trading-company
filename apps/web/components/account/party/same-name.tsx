"use client";

import { useTranslations } from "next-intl";
import { useState } from "react";

import { ConfirmDialog } from "~/components/ui/confirm-dialog";
import { titleCase } from "~/lib/format";
import { trpc } from "~/trpc/client";

import type { PartyDraft } from "./party-fields";

// before a party is saved: a party with the same name in the same town may be the same one again, so it asks first;
// the same name in another town is saved without asking. `confirm` resolves true to go on, false to go back
export function useSameNameConfirm() {
  const t = useTranslations("accounts.party.form.sameName");
  const utils = trpc.useUtils();
  const [asking, setAsking] = useState<{ body: string; answer: (go: boolean) => void } | null>(null);

  async function confirm(d: PartyDraft, exceptId: string | null = null) {
    const address = d.addresses.find((a) => a.isDefault) ?? d.addresses[0];
    const name = d.name.trim();
    const city = address?.city.trim() ?? "";
    if (!name || !city) return true;
    // asked fresh each time (a party just added counts)
    const found = await utils.client.accounts.party.nameCheck.query({ name, city, exceptId }).catch(() => null);
    if (!found || found.sameInTown.length === 0) return true;
    return new Promise<boolean>((answer) => setAsking({ body: t("body", { name: titleCase(name), city: titleCase(city) }), answer }));
  }

  const answer = (go: boolean) => {
    asking?.answer(go);
    setAsking(null);
  };
  const dialog = (
    <ConfirmDialog
      open={asking !== null}
      title={t("title")}
      body={asking?.body ?? ""}
      confirmLabel={t("add")}
      cancelLabel={t("back")}
      busy={false}
      onConfirm={() => answer(true)}
      onCancel={() => answer(false)}
    />
  );
  return { confirm, dialog };
}
