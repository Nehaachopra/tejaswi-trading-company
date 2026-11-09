import { cn } from "~/lib/utils";

import { type Balance, type Head, signed } from "./balance";

// a balance signed by its head (see `signed`). One that is the opposite of what the account normally does is
// highlighted: ivory on red. As a badge (beside a ledger's name) it is a chestnut pill, red when negative; on a chestnut
// surface (a head's header) an ivory pill instead
export function SignedAmount({
  balance,
  head,
  badge = false,
  onChestnut = false,
  className,
}: {
  balance: Balance;
  head: Head;
  badge?: boolean;
  onChestnut?: boolean;
  className?: string;
}) {
  const { text, negative } = signed(balance, head);
  return (
    <span
      className={cn(
        "tabular",
        badge
          ? cn("rounded-control px-2.5 py-0.5", negative ? "bg-danger text-ivory" : onChestnut ? "bg-ivory text-chestnut" : "bg-chestnut text-ivory")
          : negative && "rounded-control bg-danger px-1.5 text-ivory",
        className,
      )}
    >
      {text}
    </span>
  );
}
