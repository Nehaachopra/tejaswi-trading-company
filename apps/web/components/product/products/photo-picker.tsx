"use client";

import { Camera, Trash2 } from "lucide-react";
import { useTranslations } from "next-intl";
import { useRef, useState } from "react";

import { FieldMessage } from "~/components/ui/field-message";
import { Spinner } from "~/components/ui/spinner";
import { cn } from "~/lib/utils";

// photos are shrunk on the device first: at most this many pixels on the long side, as WebP
const MAX_SIDE = 1200;
const QUALITY = 0.85;

// draw the picked photo onto a canvas no bigger than MAX_SIDE and export it as WebP
async function shrink(file: File): Promise<Blob> {
  const bitmap = await createImageBitmap(file);
  const scale = Math.min(1, MAX_SIDE / Math.max(bitmap.width, bitmap.height));
  const canvas = document.createElement("canvas");
  canvas.width = Math.round(bitmap.width * scale);
  canvas.height = Math.round(bitmap.height * scale);
  canvas.getContext("2d")!.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  bitmap.close();
  return new Promise((resolve, reject) =>
    canvas.toBlob((blob) => (blob ? resolve(blob) : reject(new Error("encode"))), "image/webp", QUALITY),
  );
}

// send it to the API, which stores it and answers with its link
async function upload(blob: Blob): Promise<string> {
  const res = await fetch("/uploads/product-image", { method: "POST", body: blob, headers: { "Content-Type": blob.type } });
  if (!res.ok) throw new Error(`upload ${res.status}`);
  return ((await res.json()) as { url: string }).url;
}

// the product photo: a square preview with Add / Change photo (camera or gallery on phones) and Remove beside it
// ("row", the new-product form), or just the square, tapped to change, with Remove under it ("square", inline)
export function PhotoPicker({
  value,
  onChange,
  onBusy,
  variant = "row",
  className,
}: {
  value: string | null;
  onChange: (url: string | null) => void;
  onBusy: (busy: boolean) => void;
  variant?: "row" | "square";
  className?: string;
}) {
  const t = useTranslations("products.items.form");
  const input = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [failed, setFailed] = useState(false);

  // a photo was picked: shrink it, upload it, and keep its link
  async function pick(file: File | undefined) {
    if (!file) return;
    setBusy(true);
    onBusy(true);
    setFailed(false);
    try {
      onChange(await upload(await shrink(file)));
    } catch {
      setFailed(true);
    } finally {
      setBusy(false);
      onBusy(false);
      if (input.current) input.current.value = "";
    }
  }

  // the preview, or an empty square; either opens the picker
  const square = (
    <button
      type="button"
      onClick={() => input.current?.click()}
      disabled={busy}
      aria-label={value ? t("changePhoto") : t("addPhoto")}
      className={cn(
        "relative grid aspect-square shrink-0 place-items-center overflow-hidden rounded-control border border-dashed border-chestnut/50 bg-chestnut/6 hover:border-chestnut",
        variant === "row" ? "size-24" : "w-full",
      )}
    >
      {busy ? (
        <Spinner />
      ) : value ? (
        // eslint-disable-next-line @next/next/no-img-element -- stored photos, already shrunk
        <img src={value} alt="" className="size-full object-cover" />
      ) : (
        <Camera className="size-6 text-chestnut/70" aria-hidden />
      )}
      {/* inline, a camera badge says the photo can be changed */}
      {variant === "square" && value && !busy && (
        <span aria-hidden className="absolute bottom-1.5 right-1.5 grid size-8 place-items-center rounded-full bg-ivory/90 text-chestnut">
          <Camera className="size-4" />
        </span>
      )}
    </button>
  );
  const removeButton = value && (
    <button
      type="button"
      onClick={() => onChange(null)}
      disabled={busy}
      className="flex min-h-11 items-center justify-center gap-1.5 rounded-control px-3 text-sm text-danger hover:bg-chestnut/6 disabled:opacity-40"
    >
      <Trash2 className="size-4" aria-hidden /> {t("removePhoto")}
    </button>
  );
  const picker = <input ref={input} type="file" accept="image/*" hidden onChange={(e) => void pick(e.target.files?.[0])} />;
  const error = failed && <FieldMessage>{t("errors.upload")}</FieldMessage>;

  if (variant === "square") {
    return (
      <div className={cn("flex flex-col gap-1", className)}>
        {square}
        {removeButton}
        {picker}
        {error}
      </div>
    );
  }

  return (
    <div className={cn("flex flex-col gap-2", className)}>
      <span className="text-sm">{t("photo")}</span>
      <div className="flex items-center gap-3">
        {square}
        {/* Add / Change photo, and Remove once there is one */}
        <div className="flex flex-col gap-2">
          <button
            type="button"
            onClick={() => input.current?.click()}
            disabled={busy}
            className="flex min-h-11 items-center gap-1.5 rounded-control border border-chestnut/50 px-3 text-sm font-medium hover:border-chestnut disabled:opacity-40"
          >
            <Camera className="size-4" aria-hidden /> {value ? t("changePhoto") : t("addPhoto")}
          </button>
          {removeButton}
        </div>
      </div>
      {picker}
      {error}
    </div>
  );
}
