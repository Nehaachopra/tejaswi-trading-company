"use client";

import { ArrowRightLeft, ChevronDown, Ellipsis, Pencil, Power } from "lucide-react";
import { useTranslations } from "next-intl";
import { useState } from "react";

import { Menu, MenuItem } from "~/components/ui/menu";
import { titleCase } from "~/lib/format";
import { cn } from "~/lib/utils";
import type { RouterOutputs } from "@repo/trpc/client";

import { PackChips } from "../../product/products/pack-chips";
import { ProductImage, productTitle } from "../../product/products/product-tile";

type GodownStock = RouterOutputs["inventory"]["stock"]["byGodown"][number];
type GodownProduct = GodownStock["products"][number];

// one product inside a godown: its pack sizes on top (scrolling sideways when they overflow) with Move beside
// them, then the image, name and category | sub-category on the left and the picked pack size's quantity here on the right
function GodownProductCard({ group, canMove, onMove }: { group: GodownProduct; canMove: boolean; onMove: (productId: string) => void }) {
  const t = useTranslations("stock.godowns");
  const [selected, setSelected] = useState(group.packs[0]!.productId);
  const pack = group.packs.find((p) => p.productId === selected) ?? group.packs[0]!;

  return (
    <li className="flex min-w-0 flex-col gap-2.5 rounded-control border border-chestnut/20 p-2.5">
      {/* pack sizes, and Move for the picked one */}
      <div className="flex items-center gap-2">
        <div className="min-w-0 flex-1">
          <PackChips packs={group.packs.map((p) => ({ ...p, isActive: true }))} selected={pack.productId} onSelect={setSelected} label={t("packSizes")} />
        </div>
        {canMove && (
          <button
            type="button"
            onClick={() => onMove(pack.productId)}
            className="flex min-h-8 shrink-0 items-center gap-1.5 rounded-control border border-chestnut/50 px-2.5 text-xs font-medium hover:border-chestnut"
          >
            <ArrowRightLeft className="size-3.5" aria-hidden /> {t("moveThis")}
          </button>
        )}
      </div>

      {/* the product on the left, the quantity here on the right */}
      <div className="flex min-w-0 items-center gap-2.5">
        <ProductImage group={group} imageUrl={pack.imageUrl ?? group.imageUrl} className="size-14 shrink-0 [&_span]:text-lg" />
        <div className="min-w-0 flex-1">
          <p className="truncate font-heading text-base font-bold leading-6" title={productTitle(group)}>
            {productTitle(group)}
          </p>
          <p className="truncate text-xs text-chestnut/70" title={`${titleCase(group.categoryName)} | ${titleCase(group.subCategoryName)}`}>
            {titleCase(group.categoryName)} | {titleCase(group.subCategoryName)}
          </p>
        </div>
        <p className="flex shrink-0 flex-col items-end">
          <span className="tabular font-heading text-2xl font-bold leading-8">{pack.quantity.toLocaleString("en-IN")}</span>
          <span className="text-xs text-chestnut/70">{t("inGodown")}</span>
        </p>
      </div>
    </li>
  );
}

// one godown: a header (name, how many pack sizes, its tags, the admin's ⋯ menu) that opens and closes
// the products it holds
export function GodownCard({
  godown,
  isActive,
  isAdmin,
  onEdit,
  onToggleActive,
  onMove,
}: {
  godown: GodownStock;
  isActive: boolean;
  isAdmin: boolean;
  onEdit: () => void;
  onToggleActive: () => void;
  onMove: (productId: string) => void;
}) {
  const t = useTranslations("stock.godowns");
  const [open, setOpen] = useState(true);
  const bodyId = `godown-${godown.godownId}`;
  // a godown holding stock, or being counted, can't be made inactive; the menu says why
  const blocked = isActive && (godown.productCount > 0 || godown.beingCounted);

  return (
    <section
      className={cn(
        "rounded-control border",
        isActive ? "on-ivory border-ivory bg-ivory text-chestnut" : "border-dashed border-ivory/60 text-ivory",
      )}
    >
      {/* the header: tap to open or close; the ⋯ menu beside it */}
      <header className="flex items-center gap-2 p-2 pl-4">
        <button
          type="button"
          aria-expanded={open}
          aria-controls={bodyId}
          onClick={() => setOpen((v) => !v)}
          disabled={!isActive}
          className="flex min-h-11 min-w-0 flex-1 items-center gap-3 text-left"
        >
          <h2 className="truncate font-heading text-xl font-bold leading-7">{godown.godownName}</h2>
          <span className="tabular shrink-0 text-sm opacity-70">{t("products", { count: godown.productCount })}</span>
          {godown.beingCounted && <span className="shrink-0 rounded-control bg-chestnut px-2 py-0.5 text-xs font-medium text-ivory">{t("beingCounted")}</span>}
          {!isActive && <span className="shrink-0 rounded-control border border-current px-2 py-0.5 text-xs">{t("inactive")}</span>}
          {isActive && <ChevronDown className={cn("ml-auto size-5 shrink-0 transition-transform", open && "rotate-180")} aria-hidden />}
        </button>
        {isAdmin && (
          <Menu plain
            label={t("menu")}
            surface={isActive ? "ivory" : "chestnut"}
            triggerClassName="size-11 shrink-0"
            trigger={<Ellipsis className="size-5" aria-hidden />}
          >
            {(close) => (
              <>
                {isActive && (
                  <MenuItem
                    onClick={() => {
                      close();
                      onEdit();
                    }}
                  >
                    <Pencil className="size-4" aria-hidden /> {t("edit")}
                  </MenuItem>
                )}
                <MenuItem
                  disabled={blocked}
                  onClick={() => {
                    close();
                    onToggleActive();
                  }}
                  className="flex-wrap"
                >
                  <Power className="size-4" aria-hidden /> {isActive ? t("deactivate") : t("reactivate")}
                  {blocked && (
                    <span className="w-full pl-6 text-xs">{godown.beingCounted ? t("countingNow") : t("holdsStock")}</span>
                  )}
                </MenuItem>
              </>
            )}
          </Menu>
        )}
      </header>

      {/* the products it holds */}
      {isActive && open && (
        <div id={bodyId} className="border-t border-chestnut/15 p-3">
          {godown.products.length === 0 ? (
            <p className="py-4 text-center text-sm text-chestnut/70">{t("emptyGodown")}</p>
          ) : (
            <ul className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-3">
              {godown.products.map((group) => (
                <GodownProductCard key={group.key} group={group} canMove={!godown.beingCounted} onMove={onMove} />
              ))}
            </ul>
          )}
        </div>
      )}
    </section>
  );
}
