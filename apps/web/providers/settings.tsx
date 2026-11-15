"use client";

import type { RouterOutputs } from "@repo/trpc/client";
import { trpc } from "~/trpc/client";

type Page = RouterOutputs["settings"]["page"];

// the site settings (tax audit, TDS on purchases)
export function useSettings(enabled = true) {
  return trpc.settings.page.useQuery(undefined, { enabled });
}

// the settings page with its two switches. A switch shows flipped at once (turning tax audit off turns TDS on
// purchases off; turning that on turns tax audit on), goes back if the save fails, and ends as the server saved it
export function useSettingsBoard() {
  const utils = trpc.useUtils();
  const page = trpc.settings.page.useQuery();

  const flip = (patch: Partial<Page>) => {
    const before = utils.settings.page.getData();
    if (before) utils.settings.page.setData(undefined, { ...before, ...patch });
    return { before };
  };
  const undo = (_e: unknown, _v: unknown, ctx?: { before?: Page }) => ctx?.before && utils.settings.page.setData(undefined, ctx.before);
  const keep = (saved: Page) => utils.settings.page.setData(undefined, saved);
  const setAudit = trpc.settings.setTaxAudit.useMutation({ onMutate: ({ on }) => flip({ taxAudit: on, ...(on ? {} : { tds194q: false }) }), onError: undo, onSuccess: keep });
  const setTds = trpc.settings.setTds194q.useMutation({ onMutate: ({ on }) => flip({ tds194q: on, ...(on ? { taxAudit: true } : {}) }), onError: undo, onSuccess: keep });

  return { page, setAudit, setTds };
}
