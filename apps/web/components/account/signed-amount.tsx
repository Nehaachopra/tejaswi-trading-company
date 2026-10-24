import { cn } from "~/lib/utils";

import { type Balance, type Head, signed } from "./balance";

// a balance signed by its head (see `signed`). One that is the opposite of what the account normally does is
// highlighted: ivory on red. As a badge (beside a ledger's name) it is a chestnut pill, red when negative
export function SignedAmount({ balance, head, badge = false, className }: { balance: Balance; head: Head; badge?: boolean; className?: string }) {
  const { text, negative } = signed(balance, head);
  return (
    <span
      className={cn(
        "tabular",
        badge ? cn("rounded-control px-2.5 py-0.5 text-ivory", negative ? "bg-danger" : "bg-chestnut") : negative && "rounded-control bg-danger px-1.5 text-ivory",
        className,
      )}
    >
      {text}
    </span>
  );
}
