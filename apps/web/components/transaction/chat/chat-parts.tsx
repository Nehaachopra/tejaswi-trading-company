"use client";

import { CircleAlert, Pencil } from "lucide-react";
import { useTranslations } from "next-intl";

import { cn } from "~/lib/utils";

// the helper's face: the app's own icon (the wheat grain), on top of her first bubble of a turn
function Avatar() {
  return (
    <span aria-hidden className="grid size-9 shrink-0 place-items-center rounded-full bg-ivory p-1.5">
      {/* eslint-disable-next-line @next/next/no-img-element -- a tiny SVG served as is */}
      <img src="/icon.svg" alt="" width={24} height={24} className="size-full" />
    </span>
  );
}

// the helper's side of the chat: a label on ivory, her avatar on top of the first of a turn; it rises into place
export function HelperBubble({ children, first = false }: { children: React.ReactNode; first?: boolean }) {
  const t = useTranslations("transactions.chat");
  return (
    <div className="chat-rise flex flex-col items-start gap-1.5">
      {first && <Avatar />}
      <div className={cn("on-ivory max-w-[85%] rounded-2xl rounded-bl-sm bg-ivory px-4 py-2.5 text-[0.95rem] text-chestnut", first && "rounded-tl-md")}>
        {first && <span className="sr-only">{t("helper")}: </span>}
        {children}
      </div>
    </div>
  );
}

// the person's answer, on the right, with what it answers as a small label on top; tapping it opens the question again
export function AnswerBubble({
  children,
  label,
  onEdit,
  editing = false,
}: {
  children: React.ReactNode;
  label: string;
  onEdit: () => void;
  editing?: boolean;
}) {
  const t = useTranslations("transactions.chat");
  return (
    <div className="chat-pop flex justify-end">
      <button
        type="button"
        onClick={onEdit}
        aria-label={t("change")}
        className={cn(
          "group flex max-w-[85%] items-center gap-2 rounded-2xl rounded-br-md border px-4 py-2.5 text-left text-[0.95rem] text-ivory",
          editing ? "border-ivory bg-ivory/25" : "border-ivory/30 bg-ivory/10 hover:bg-ivory/20",
        )}
      >
        <span className="flex min-w-0 flex-col">
          <span className="text-xs text-ivory/65">{label}</span>
          <span>{children}</span>
        </span>
        <Pencil className="size-3.5 shrink-0 opacity-60 group-hover:opacity-100" aria-hidden />
      </button>
    </div>
  );
}

// the choices for a question, as chips under it
export function Chips({ children }: { children: React.ReactNode }) {
  return <div className="chat-follow flex flex-wrap gap-2">{children}</div>;
}

export function Chip({ children, onClick, on = false, strong = false }: { children: React.ReactNode; onClick: () => void; on?: boolean; strong?: boolean }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={on}
      className={cn(
        "min-h-10 rounded-full border px-4 text-sm font-medium transition-colors",
        on || strong ? "border-ivory bg-ivory text-chestnut" : "border-ivory/50 text-ivory hover:border-ivory hover:bg-ivory/10",
      )}
    >
      {children}
    </button>
  );
}

// a list of cards (parties, ledgers, bank accounts) under a question
export function Cards({ children }: { children: React.ReactNode }) {
  return <div className="chat-follow flex flex-col gap-2">{children}</div>;
}

export function Card({ children, onClick }: { children: React.ReactNode; onClick: () => void }) {
  return (
    <button type="button" onClick={onClick} className="on-ivory flex w-full items-center gap-2 rounded-xl bg-ivory px-3 py-2.5 text-left text-chestnut hover:ring-2 hover:ring-ivory/60">
      {children}
    </button>
  );
}

// the helper typing: three dots bouncing in turn, before her next question
export function TypingBubble() {
  const t = useTranslations("transactions.chat");
  return (
    <div className="chat-rise flex flex-col items-start gap-1.5" role="status" aria-label={t("typing")}>
      <Avatar />
      <div className="on-ivory flex h-10 items-center gap-1 rounded-2xl rounded-tl-md bg-ivory px-4">
        {[0, 1, 2].map((i) => (
          <span key={i} aria-hidden className="chat-dot size-1.5 rounded-full bg-chestnut" style={{ animationDelay: `${i * 0.15}s` }} />
        ))}
      </div>
    </div>
  );
}

// a short note from the helper under a question (a problem with the answer, or a hint)
export function Note({ children, tone = "hint" }: { children: React.ReactNode; tone?: "hint" | "error" }) {
  return (
    <p
      role={tone === "error" ? "alert" : undefined}
      // an error sits on ivory in red, so it stands out on the chestnut page
      className={cn("text-sm", tone === "error" ? "flex w-fit items-start gap-1.5 rounded-xl bg-ivory px-3 py-1.5 font-medium text-danger" : "text-ivory/75")}
    >
      {tone === "error" && <CircleAlert aria-hidden className="mt-0.5 size-4 shrink-0" />}
      {children}
    </p>
  );
}
