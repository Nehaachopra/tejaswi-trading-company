"use client";

import { QrCode } from "lucide-react";
import { cn } from "~/lib/utils";
import { UpiQr } from "./upi-qr";

// one QR to show: whose UPI IDs, the name it shows, how much, a note, and which account it's for
export type QrItem = {
  key: string;
  title: string;
  upiIds: string[];
  payee: string;
  amount: number;
  note?: string;
};

// the Amount card's QR spot (right of the amount on wider screens): the QR picked (with more than one by UPI, the
// last account with an amount unless Show QR code picked another), under the account it's for
export function QrSpot({ item, centered = false }: { item: QrItem | null; centered?: boolean }) {
  // nothing to scan yet: an empty box holding the spot, as tall as the column beside it (wider screens only)
  if (!item)
    return (
      <div
        aria-hidden
        className="hidden h-full min-h-48 place-items-center rounded-control shadow-[0_0_5px_0] shadow-chestnut/25 sm:grid"
      >
        <QrCode className="size-16 text-chestnut/20" />
      </div>
    );
  return (
    <div className="flex min-w-0 flex-col gap-2 rounded-control p-3 shadow-[0_0_5px_0] shadow-chestnut/25 sm:sticky sm:top-24">
      <h3 className={cn("text-sm font-semibold", centered && "text-center")}>{item.title}</h3>
      <UpiQr
        key={`${item.key}|${item.upiIds.join()}`}
        upiIds={item.upiIds}
        payee={item.payee}
        amount={item.amount}
        note={item.note}
      />
    </div>
  );
}
