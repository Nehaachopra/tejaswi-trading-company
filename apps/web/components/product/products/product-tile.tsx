"use client";

import { ChevronRight } from "lucide-react";
import { useTranslations } from "next-intl";
import { useState } from "react";
import type { RouterOutputs } from "@repo/trpc/client";

import { initials, packLabel, rupees, titleCase } from "~/lib/format";
import { cn } from "~/lib/utils";

import { PackChips } from "./pack-chips";

export type ProductGroup = RouterOutputs["inventory"]["product"]["list"][number];

// the product's name as shown: the brand, then the optional name ("India Gate Classic")
export const productTitle = (group: Pick<ProductGroup, "brand" | "name">) =>
  titleCase([group.brand, group.name].filter(Boolean).join(" "));

// the photo for one pack size: its own, else the product's first photo
export const packImage = (group: ProductGroup, pack: ProductGroup["packs"][number]) => pack.imageUrl ?? group.imageUrl;

// a product photo, or until one is uploaded its brand's initials on a tinted square
export function ProductImage({ group, imageUrl, className }: { group: ProductGroup; imageUrl: string | null; className?: string }) {
  return (
    <div
      className={cn(
        "grid aspect-square place-items-center overflow-hidden rounded-control bg-current/6",
        className,
      )}
    >
      {imageUrl ? (
        // eslint-disable-next-line @next/next/no-img-element -- photos come from R2, sized by the tile
        <img src={imageUrl} alt="" className="size-full object-cover" />
      ) : (
        <span aria-hidden className="font-heading text-4xl font-bold opacity-70">
          {initials(group.brand)}
        </span>
      )}
    </div>
  );
}

// one product: its name and sub-category, its pack sizes, then the image and the selected pack's price,
// which together open Details
export function ProductTile({
  group,
  onDetails,
}: {
  group: ProductGroup;
  onDetails: (productId: string) => void;
}) {
  const t = useTranslations("products.items");
  const [selected, setSelected] = useState(group.packs[0]!.productId);
  const pack = group.packs.find((p) => p.productId === selected) ?? group.packs[0]!;
  // the whole product is inactive when every pack size is
  const active = group.packs.some((p) => p.isActive);

  return (
    // active: ivory; inactive: no fill, an ivory border and ivory ink (like an inactive category)
    <li
      className={cn(
        "flex min-w-0 flex-col gap-2 rounded-control border border-ivory p-2.5",
        active ? "on-ivory bg-ivory text-chestnut" : "text-ivory",
      )}
    >
      {/* the name, and the sub-category so two brands' packs are told apart */}
      <div className="min-w-0">
        <p className="truncate font-heading text-base font-bold leading-6" title={productTitle(group)}>
          {productTitle(group)}
        </p>
        <p className="truncate text-xs opacity-70">{titleCase(group.categoryName)} | {titleCase(group.subCategoryName)}</p>
      </div>

      {/* pack sizes */}
      <PackChips
        packs={group.packs}
        selected={pack.productId}
        onSelect={setSelected}
        label={t("packSizes")}
        onChestnut={!active}
      />

      {/* the image and the price (GST included) for the selected pack: one button that opens Details on it */}
      <button
        type="button"
        onClick={() => onDetails(pack.productId)}
        aria-haspopup="dialog"
        aria-label={`${t("details")}: ${productTitle(group)} ${packLabel(pack.packSize, pack.packSizeCode)}`}
        className="group flex flex-col gap-2 text-left"
      >
        <ProductImage group={group} imageUrl={packImage(group, pack)} className="w-full transition-opacity group-hover:opacity-90" />
        <span className="flex w-full items-center justify-between gap-2">
          <span className="tabular truncate font-heading text-2xl font-bold leading-8 sm:text-2xl sm:leading-9">
            {pack.priceAfterGst == null ? "–" : rupees(pack.priceAfterGst)}
          </span>
          <ChevronRight className="size-5 shrink-0 opacity-70 transition-transform group-hover:translate-x-0.5" aria-hidden />
        </span>
      </button>
    </li>
  );
}
