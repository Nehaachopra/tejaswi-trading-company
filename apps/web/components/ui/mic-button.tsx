"use client";

import { Mic, MicOff } from "lucide-react";
import { useTranslations } from "next-intl";

import { type SpeechOptions, useSpeech } from "~/lib/speech";
import { cn } from "~/lib/utils";

// a mic inside a field: tap and speak, and what was said goes to `onText` (an amount field turns it into a number);
// tap again to stop early. While Chrome gets ready it's amber ("Getting ready…"); once it's really listening it pulses
// red and shows what it's hearing under the field (`above` it, for a box at the foot of the screen); when it can't,
// it says why. Hidden where the browser can't listen
export function MicButton({ onText, className, until, throughPauses, above = false }: { onText: (text: string) => void; className?: string; above?: boolean } & SpeechOptions) {
  const t = useTranslations("common.speech");
  const { supported, state, heard, listen, stop } = useSpeech(onText, { until, throughPauses });
  if (!supported) return null;
  const listening = state === "listening";
  const starting = state === "starting";
  const busy = listening || starting;

  return (
    <>
      <button
        type="button"
        // starts as the finger lands (a moment sooner than on release); a tap while busy stops it
        onPointerDown={(e) => {
          if (busy || e.button !== 0) return;
          e.preventDefault();
          listen();
        }}
        onClick={(e) => {
          // a keyboard press (no pointer) starts it here; a pointer already started it on pointerdown
          if (busy) stop();
          else if (e.detail === 0) listen();
        }}
        aria-label={t(busy ? "stop" : "speak")}
        aria-pressed={busy}
        className={cn(
          "grid size-9 shrink-0 place-items-center rounded-full transition-colors",
          listening ? "animate-pulse bg-danger text-ivory" : starting ? "bg-[#d08a2c] text-ivory" : state === "denied" ? "text-chestnut/50" : "text-chestnut hover:bg-chestnut/10",
          className,
        )}
      >
        {state === "denied" ? <MicOff className="size-4" aria-hidden /> : <Mic className="size-4" aria-hidden />}
      </button>
      {/* what it's hearing, and why it can't: under the field, or above it (a box at the foot of the screen) */}
      {state !== "idle" && (
        <span
          role="status"
          className={cn(
            "absolute inset-x-0 z-20 rounded-control px-3 py-1.5 text-xs",
            above ? "bottom-full mb-2" : "top-full mt-1",
            busy ? "bg-chestnut text-ivory" : "bg-danger text-ivory",
          )}
        >
          {starting ? t("starting") : listening ? heard || t("listening") : t(`problems.${state}`)}
        </span>
      )}
    </>
  );
}

// a field with a mic at its right edge (give the field room: pr-11)
export function MicField({ onText, children, until, throughPauses }: { onText: (text: string) => void; children: React.ReactNode } & SpeechOptions) {
  return (
    <div className="relative">
      {children}
      <MicButton onText={onText} until={until} throughPauses={throughPauses} className="absolute right-1 top-1/2 -translate-y-1/2" />
    </div>
  );
}
