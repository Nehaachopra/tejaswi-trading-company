"use client";

import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { useCallback, useEffect, useRef, useState } from "react";

import { ConfirmDialog } from "~/components/ui/confirm-dialog";

// a transaction half filled in: leaving it asks first. A tap on any link in the app (the sidebar, the phone bar, the
// header), or on a menu marked data-asks-first (More, Accounts, profile), stops and asks to keep entering or discard
// what's typed; closing or reloading the tab gets the browser's own question. `leave(href)` asks the same before a
// button of the form's own goes elsewhere. A menu opens after Discard, on a form cleared by `onDiscard`
export function useLeaveGuard(dirty: boolean, onDiscard?: () => void) {
  const t = useTranslations("common.leave");
  const router = useRouter();
  // where the tap was going: a page, or a menu to open
  const [target, setTarget] = useState<string | HTMLElement | null>(null);
  // once Discard is pressed nothing asks again on the way out
  const leaving = useRef(false);
  const guarded = dirty && !leaving.current;

  // closing or reloading the tab
  useEffect(() => {
    if (!guarded) return;
    const ask = (e: BeforeUnloadEvent) => e.preventDefault();
    window.addEventListener("beforeunload", ask);
    return () => window.removeEventListener("beforeunload", ask);
  }, [guarded]);

  // a menu, or a link to another page of the app (not one opening a new tab, nor this same page)
  useEffect(() => {
    if (!guarded) return;
    const onClick = (e: MouseEvent) => {
      if (leaving.current || e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
      const menu = (e.target as Element | null)?.closest?.("[data-asks-first]");
      if (menu instanceof HTMLElement) {
        e.preventDefault();
        e.stopPropagation();
        setTarget(menu);
        return;
      }
      const link = (e.target as Element | null)?.closest?.("a[href]");
      if (!(link instanceof HTMLAnchorElement) || link.target === "_blank" || link.hasAttribute("download")) return;
      const url = new URL(link.href, location.href);
      if (url.origin !== location.origin || url.pathname + url.search === location.pathname + location.search) return;
      e.preventDefault();
      e.stopPropagation();
      setTarget(url.pathname + url.search + url.hash);
    };
    document.addEventListener("click", onClick, true);
    return () => document.removeEventListener("click", onClick, true);
  }, [guarded]);

  const leave = useCallback((href: string) => (guarded ? setTarget(href) : router.push(href)), [guarded, router]);

  const dialog = (
    <ConfirmDialog
      open={target !== null}
      title={t("title")}
      body={t("body")}
      cancelLabel={t("stay")}
      confirmLabel={t("discard")}
      busy={false}
      onCancel={() => setTarget(null)}
      onConfirm={() => {
        leaving.current = true;
        const asked = target!;
        setTarget(null);
        if (typeof asked === "string") return router.push(asked);
        // the menu tapped opens now, over an emptied form
        asked.click();
        onDiscard?.();
      }}
    />
  );

  return { dialog, leave };
}
