"use client";

import { useTranslations } from "next-intl";
import { useState } from "react";

import { SaleDataProvider, useSaleData } from "~/providers/sale";
import { useSaleForEdit, useSaveSaleEdit } from "~/providers/sale-edit";

import { EntryNote } from "../../shared/entry-frame";
import { SaleEntry } from "../form";
import { seedOf } from "./seed";

// /history/[id]/edit, from Edit sale on the sale's page (the admin's): the sale form started from the sale as it was
// saved: its items kept (quantities only up; fewer is a sale return), its customer fixed, what was paid towards it
// known. Saved over it and back to it in History. Discarding starts it again from the saved sale
export function SaleEditForm({ id }: { id: string }) {
  const [round, setRound] = useState(0);
  return (
    <SaleDataProvider>
      <EditEntry key={round} id={id} onDiscard={() => setRound((r) => r + 1)} />
    </SaleDataProvider>
  );
}

// waits for the sale and what the form reads (the products, to price its items), then opens the form with them
function EditEntry({ id, onDiscard }: { id: string; onDiscard: () => void }) {
  const t = useTranslations("transactions.sale");
  const data = useSaleData();
  const read = useSaleForEdit(id);
  const { saveEdit, saving, saved } = useSaveSaleEdit();
  const title = t("edit.title");

  if (data.loading || read.loading)
    return (
      <EntryNote title={title} loading>
        {t("loading")}
      </EntryNote>
    );
  if (data.loadFailed || read.loadFailed || !read.sale || !data.products)
    return (
      <EntryNote
        title={title}
        failed
        onRetry={() => {
          data.retryLoad();
          read.retry();
        }}
      >
        {t("loadFailed")}
      </EntryNote>
    );
  return (
    <SaleEntry
      isAdmin
      onDiscard={onDiscard}
      edit={{ sale: read.sale, seed: seedOf(read.sale, read.ledger, data.products), saveEdit, saving, saved }}
    />
  );
}
