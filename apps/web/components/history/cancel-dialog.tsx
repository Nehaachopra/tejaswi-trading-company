"use client";

import { useTranslations } from "next-intl";
import { useState } from "react";

import { ConfirmDialog } from "~/components/ui/confirm-dialog";
import { FieldMessage } from "~/components/ui/field-message";
import { RequiredMark } from "~/components/ui/required-mark";
import { toast } from "~/components/ui/toast";
import { useCancelTransaction } from "~/providers/history";

import { input } from "../transaction/shared/form-basics";

// the longest reason kept (transactions.cancel_reason)
const REASON_MAX = 200;

// asks before cancelling: what happens, and why (required). Keep it has the focus, so Enter never cancels by accident
export function CancelDialog({
  open,
  id,
  number,
  onClose,
}: {
  open: boolean;
  id: string;
  number: string;
  onClose: () => void;
}) {
  const t = useTranslations("history");
  const cancel = useCancelTransaction();
  const [reason, setReason] = useState("");
  const [tried, setTried] = useState(false);
  const missing = reason.trim() === "";

  // closing starts it afresh next time
  const close = () => {
    setReason("");
    setTried(false);
    onClose();
  };

  return (
    <ConfirmDialog
      open={open}
      title={t("cancelTitle")}
      body={
        <div className="flex flex-col gap-3">
          <p>{t("cancelBody", { number })}</p>
          {/* why: required, as long as the column keeps */}
          <label className="flex flex-col gap-1.5 text-sm font-semibold text-chestnut">
            <span>
              {t("reason")}
              <RequiredMark />
            </span>
            <input
              value={reason}
              maxLength={REASON_MAX}
              onChange={(e) => setReason(e.target.value.slice(0, REASON_MAX))}
              aria-invalid={(tried && missing) || undefined}
              className={input(tried && missing)}
            />
          </label>
          {tried && missing && (
            <FieldMessage tone="error" className="mt-0">
              {t("reasonMissing")}
            </FieldMessage>
          )}
        </div>
      }
      confirmLabel={t("cancelSale")}
      cancelLabel={t("keep")}
      busy={cancel.isPending}
      onConfirm={() => {
        setTried(true);
        if (missing) return;
        cancel.mutate(
          { id, reason: reason.trim() },
          {
            onSuccess: () => {
              toast.success(t("cancelDone"));
              close();
            },
            onError: (err) => toast.error(err.message),
          },
        );
      }}
      onCancel={close}
    />
  );
}
