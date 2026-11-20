"use client";

import { Pencil, Plus, SquarePen } from "lucide-react";
import { useTranslations } from "next-intl";
import { useState } from "react";
import type { RouterOutputs } from "@repo/trpc/client";

import { addSquare } from "~/components/ui/page-styles";
import { initials, packLabel, rupees, titleCase } from "~/lib/format";
import { cn } from "~/lib/utils";

import { PackChips } from "./pack-chips";

export type ProductGroup = RouterOutputs["inventory"]["product"]["list"][number];
export type Pack = ProductGroup["packs"][number];

// the product's name as shown: the brand, then the optional name ("India Gate Classic")
export const productTitle = (group: Pick<ProductGroup, "brand" | "name">) =>
  titleCase([group.brand, group.name].filter(Boolean).join(" "));

// the photo for one pack size: only its own, never another pack size's; none until the admin adds one
export const packImage = (group: ProductGroup, pack: ProductGroup["packs"][number]) =>
  pack.imageUrl;

// a product photo, whole: a wide or tall one keeps its shape inside the tinted square (never cropped); until one is
// uploaded, its brand's initials
export function ProductImage({
  group,
  imageUrl,
  className,
}: {
  group: Pick<ProductGroup, "brand">;
  imageUrl: string | null;
  className?: string;
}) {
  return (
    <div
      className={cn(
        // a soft fill behind the initials only; a photo sits on the card itself
        "grid aspect-square place-items-center overflow-hidden rounded-control",
        !imageUrl && "bg-current/6",
        className,
      )}
    >
      {imageUrl ? (
        // eslint-disable-next-line @next/next/no-img-element -- photos come from R2, sized by the tile
        <img src={imageUrl} alt="" className="size-full object-contain" />
      ) : (
        <span aria-hidden className="font-heading text-4xl font-bold opacity-70">
          {initials(group.brand)}
        </span>
      )}
    </div>
  );
}

// the card's top half: pack sizes on top, then the name and sub-category, then the photo; shared by the tile and
// the zoomed price card (`short`: a shorter photo box, the photo kept whole inside it)
export function TileTop({
  group,
  pack,
  onPack,
  onChestnut = false,
  short = false,
  phoneShort = false,
  photoButton,
  onAdd,
}: {
  // the + after the pack sizes (the product's card): opens Add product for this product
  onAdd?: () => void;
  group: ProductGroup;
  pack: Pack;
  onPack: (productId: string) => void;
  onChestnut?: boolean;
  short?: boolean;
  // a shorter photo on a phone only, so a whole row of tiles fits on the screen
  phoneShort?: boolean;
  // a button floating on the photo's top-right corner
  photoButton?: React.ReactNode;
}) {
  const t = useTranslations("products.items");
  return (
    <>
      {/* pack sizes, always on top */}
      <PackChips
        packs={group.packs}
        selected={pack.productId}
        onSelect={onPack}
        label={t("packSizes")}
        onChestnut={onChestnut}
        // the + that adds a pack size stays put at the end while the chips scroll
        end={
          onAdd && (
            <button type="button" aria-label={t("addPack")} title={t("addPack")} onClick={onAdd} className={"p-2 rounded-control hover:bg-chestnut/8"}>
              <Plus className="size-5" aria-hidden />
            </button>
          )
        }
      />

      {/* the name, and the sub-category so two brands' packs are told apart */}
      <div className="min-w-0">
        <p
          className="truncate font-heading text-base font-bold leading-6"
          title={productTitle(group)}
        >
          {productTitle(group)}
        </p>
        <p
          className="truncate text-xs opacity-70"
          title={`${titleCase(group.categoryName)} | ${titleCase(group.subCategoryName)}`}
        >
          {titleCase(group.categoryName)} | {titleCase(group.subCategoryName)}
        </p>
      </div>

      {/* the photo, with its button over the corner */}
      <div className="relative">
        <ProductImage
          group={group}
          imageUrl={packImage(group, pack)}
          // short: the box's own height wins over the square, and the photo fills its height (kept whole)
          className={cn(
            "w-full",
            short && "h-[110px] grid-rows-[100%] aspect-auto!",
            phoneShort && "max-sm:h-24 max-sm:grid-rows-[100%] max-sm:aspect-auto!",
          )}
        />
        {photoButton}
      </div>
    </>
  );
}

// the card's top half: pack sizes on top, then the name and sub-category, then the photo; shared by the tile and
// the zoomed price card (`short`: a shorter photo box, the photo kept whole inside it)
export function TileTopForPrice({
  group,
  pack,
  short = false,
  photoButton,
}: {
  group: ProductGroup;
  pack: Pack;
  onPack: (productId: string) => void;
  onChestnut?: boolean;
  short?: boolean;
  // a button floating on the photo's top-right corner
  photoButton?: React.ReactNode;
}) {
  const t = useTranslations("products.items");
  return (
    <>
      {/* the name, and the sub-category so two brands' packs are told apart */}
      <div className="min-w-0">
        <p
          className="truncate font-heading text-base font-bold leading-6"
          title={productTitle(group)}
        >
          {productTitle(group)}
        </p>
        <p
          className="truncate text-xs opacity-70"
          title={`${titleCase(group.categoryName)} | ${titleCase(group.subCategoryName)}`}
        >
          {titleCase(group.categoryName)} | {titleCase(group.subCategoryName)}
        </p>
      </div>

      {/* the photo, with its button over the corner */}
      <div className="relative">
        <ProductImage
          group={group}
          imageUrl={packImage(group, pack)}
          // short: the box's own height wins over the square, and the photo fills its height (kept whole)
          className={cn("w-full", short && "h-[110px] grid-rows-[100%] aspect-auto!")}
        />
        {photoButton}
      </div>
    </>
  );
}

// one product: its pack sizes (a + fixed at the end opens Add product for it), name, photo (its pen-in-a-box opens
// Details) and the selected pack's price with a pencil beside it (opens the price card)
export function ProductTile({
  group,
  onDetails,
  onPrice,
  onAdd,
}: {
  // the + after its pack sizes
  onAdd: () => void;
  group: ProductGroup;
  onDetails: (productId: string) => void;
  onPrice: (productId: string) => void;
}) {
  const t = useTranslations("products.items");
  const [selected, setSelected] = useState(group.packs[0]!.productId);
  const pack = group.packs.find((p) => p.productId === selected) ?? group.packs[0]!;
  // the whole product is inactive when every pack size is
  const active = group.packs.some((p) => p.isActive);
  const name = `${productTitle(group)} ${packLabel(pack.packSize, pack.packSizeCode, pack.packCount)}`;

  return (
    // active: ivory; inactive: no fill, an ivory border and ivory ink (like an inactive category)
    <li
      className={cn(
        "flex min-w-0 flex-col gap-2 rounded-control border border-ivory p-2.5",
        active ? "on-ivory bg-ivory text-chestnut" : "text-ivory",
      )}
    >
      <TileTop
        group={group}
        pack={pack}
        onPack={setSelected}
        onChestnut={!active}
        onAdd={onAdd}
        photoButton={
          <button
            type="button"
            onClick={() => onDetails(pack.productId)}
            aria-haspopup="dialog"
            aria-label={`${t("details")}: ${name}`}
            title={t("details")}
            className="absolute right-1.5 top-1.5 grid size-[34px] place-items-center rounded-full bg-ivory text-chestnut shadow-[0_1px_2px_rgba(60,25,10,0.08),0_3px_10px_rgba(60,25,10,0.1)] hover:bg-chestnut/8"
          >
            <SquarePen className="size-4" aria-hidden />
          </button>
        }
      />

      {/* the price (GST included) and the pencil that opens the price card */}
      <div className="flex items-center justify-center gap-2">
        <div className="flex flex-1 justify-center bg-chestnut rounded-lg py-1 tabular truncate font-heading text-xl font-semibold text-ivory">
          {pack.priceAfterGst == null ? "–" : rupees(pack.priceAfterGst)}
        </div>

        <button
          type="button"
          onClick={() => onPrice(pack.productId)}
          aria-haspopup="dialog"
          aria-label={`${t("editPrice")}: ${name}`}
          title={t("editPrice")}
          className="grid place-items-center rounded-control hover:bg-chestnut/8 p-2"
        >
          <Pencil className="size-4" aria-hidden />
        </button>
      </div>
    </li>
  );
}
