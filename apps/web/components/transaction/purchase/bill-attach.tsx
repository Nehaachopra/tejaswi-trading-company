"use client";

import { Camera, FileText, Trash2, Upload } from "lucide-react";
import { useTranslations } from "next-intl";
import { useRef, useState } from "react";

import { FieldMessage } from "~/components/ui/field-message";
import { Spinner } from "~/components/ui/icons/spinner";
import { cn } from "~/lib/utils";

import { shrink } from "../../product/products/photo-picker";

// a PDF goes as it is (10 MB at most, as the server takes it)
const PDF_MAX = 10 * 1024 * 1024;

// send it to the API, which stores it and answers with its link
async function upload(body: Blob): Promise<string> {
  const res = await fetch("/uploads/bill", { method: "POST", body, headers: { "Content-Type": body.type } });
  if (!res.ok) throw new Error(`upload ${res.status}`);
  return ((await res.json()) as { url: string }).url;
}

// the supplier's bill: Take photo (the phone's camera) and Upload (a photo or a PDF) side by side, full width on a
// phone; once attached, a row with Bill attached (opens it) and a bin to take it off. A photo is shrunk on the device
// first
export function BillAttach({ value, onChange, onBusy, removable = true }: { value: string | null; onChange: (url: string | null) => void; onBusy: (busy: boolean) => void; removable?: boolean }) {
  const t = useTranslations("transactions.purchase");
  const camera = useRef<HTMLInputElement>(null);
  const file = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [failed, setFailed] = useState<string | null>(null);

  // a photo or PDF picked: shrink a photo, upload it, keep its link
  async function pick(f: File | undefined) {
    if (!f) return;
    if (f.type === "application/pdf" && f.size > PDF_MAX) return setFailed(t("billTooBig"));
    setBusy(true);
    onBusy(true);
    setFailed(null);
    try {
      onChange(await upload(f.type === "application/pdf" ? f : await shrink(f)));
    } catch {
      setFailed(t("billFailed"));
    } finally {
      setBusy(false);
      onBusy(false);
      if (camera.current) camera.current.value = "";
      if (file.current) file.current.value = "";
    }
  }

  const button = "flex min-h-11 w-full items-center justify-center gap-2 rounded-control border border-chestnut/50 px-4 text-sm font-semibold hover:bg-chestnut/[0.06] disabled:opacity-50 sm:w-auto";
  return (
    <div className="flex flex-col gap-2">
      <input ref={camera} type="file" accept="image/*" capture="environment" className="hidden" onChange={(e) => void pick(e.target.files?.[0])} />
      <input ref={file} type="file" accept="image/*,application/pdf" className="hidden" onChange={(e) => void pick(e.target.files?.[0])} />
      {busy ? (
        <p className="flex min-h-11 items-center gap-2 text-sm">
          <Spinner className="size-4" /> {t("billUploading")}
        </p>
      ) : value ? (
        // attached: a preview, a bill's shape (the photo; a PDF as its icon), that opens it, and the bin always over its
        // corner
        <div className="relative h-44 w-36 overflow-hidden rounded-control border border-chestnut/25 bg-ivory">
          <a href={value} target="_blank" rel="noreferrer" aria-label={t("billAttached")} className="grid size-full place-items-center">
            {value.endsWith(".pdf") ? (
              <span className="flex flex-col items-center gap-1 text-xs font-semibold">
                <FileText className="size-8" aria-hidden /> PDF
              </span>
            ) : (
              // eslint-disable-next-line @next/next/no-img-element -- a stored upload, already shrunk on the device
              <img src={value} alt="" className="size-full object-cover" />
            )}
          </a>
          {removable && (
            <button
              type="button"
              onClick={() => onChange(null)}
              aria-label={t("billRemove")}
              className="absolute right-1 top-1 grid size-8 place-items-center rounded-control bg-ivory/90 text-danger shadow-sm hover:bg-ivory"
            >
              <Trash2 className="size-4" aria-hidden />
            </button>
          )}
        </div>
      ) : (
        <div className={cn("flex flex-col gap-2 sm:flex-row")}>
          {/* the camera: a phone or tablet only (a laptop's file chooser has none) */}
          <button type="button" onClick={() => camera.current?.click()} className={cn(button, "hidden pointer-coarse:flex")}>
            <Camera className="size-4" aria-hidden /> {t("takePhoto")}
          </button>
          <button type="button" onClick={() => file.current?.click()} className={button}>
            <Upload className="size-4" aria-hidden /> {t("upload")}
          </button>
        </div>
      )}
      {failed && <FieldMessage className="mt-0">{failed}</FieldMessage>}
    </div>
  );
}
