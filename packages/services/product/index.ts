import { TRPCError } from "@trpc/server";
import { and, asc, db, desc, eq, gte, ilike, inArray, lt, or } from "@repo/database";
import {
  categoriesTable,
  productCostHistoryTable,
  productPriceHistoryTable,
  productPricesTable,
  productsTable,
  subCategoriesTable,
} from "@repo/database/schema";

import {
  type ActorModel,
  type CreateProductInputModel,
  createProductInputModel,
  type DeleteProductsInputModel,
  type ListProductsInputModel,
  type PriceHistoryInputModel,
  priceHistoryInputModel,
  type PriceHistoryModel,
  type ProductGroupModel,
  type SetProductsActiveInputModel,
  type UpdateDetailsInputModel,
  type UpdatePriceInputModel,
} from "./model";

type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0];

// numeric columns come back as strings
const num = (v: string | null) => (v == null ? null : Number(v));

const round2 = (v: number) => Math.round(v * 100) / 100;

// the selling price is entered GST included; before-GST and GST amount are worked out from it
function splitPrice(priceAfterGst: number, gstPercent: number) {
  const priceBeforeGst = round2(priceAfterGst / (1 + gstPercent / 100));
  return {
    priceAfterGst: priceAfterGst.toFixed(2),
    priceBeforeGst: priceBeforeGst.toFixed(2),
    gstAmount: round2(priceAfterGst - priceBeforeGst).toFixed(2),
    gstPercent: gstPercent.toFixed(2),
  };
}

// Postgres error codes, read from drizzle's wrapped error or the raw one
const pgCode = (error: unknown) => ((error as { cause?: { code?: string } })?.cause ?? (error as { code?: string }))?.code;

function isUniqueViolation(error: unknown) {
  return pgCode(error) === "23505";
}

// a row another table still points to (stock, orders, purchases, sales, stock counts restrict deletes)
function isStillReferenced(error: unknown) {
  return pgCode(error) === "23503";
}

// the financial year runs April to March
function rangeStart(range: "3m" | "fy" | "all", today = new Date()) {
  if (range === "all") return null;
  if (range === "fy") {
    const year = today.getMonth() >= 3 ? today.getFullYear() : today.getFullYear() - 1;
    return new Date(year, 3, 1);
  }
  const start = new Date(today);
  start.setMonth(start.getMonth() - 3);
  return start;
}

export default class ProductService {
  async list(input: ListProductsInputModel): Promise<ProductGroupModel[]> {
    const search = input.search ? `%${input.search.toLowerCase()}%` : null;

    const rows = await db
      .select({
        product: productsTable,
        categoryName: categoriesTable.name,
        subCategoryName: subCategoriesTable.name,
        price: productPricesTable,
      })
      .from(productsTable)
      .innerJoin(categoriesTable, eq(categoriesTable.id, productsTable.categoryId))
      .innerJoin(subCategoriesTable, eq(subCategoriesTable.id, productsTable.subCategoryId))
      .leftJoin(productPricesTable, eq(productPricesTable.productId, productsTable.id))
      .where(
        and(
          input.includeInactive ? undefined : eq(productsTable.isActive, true),
          input.categoryId ? eq(productsTable.categoryId, input.categoryId) : undefined,
          input.subCategoryId ? eq(productsTable.subCategoryId, input.subCategoryId) : undefined,
          search
            ? or(
                ilike(productsTable.brand, search),
                ilike(productsTable.name, search),
                ilike(categoriesTable.name, search),
                ilike(subCategoriesTable.name, search),
              )
            : undefined,
        ),
      )
      .orderBy(
        asc(categoriesTable.name),
        asc(subCategoriesTable.name),
        asc(productsTable.brand),
        asc(productsTable.name),
        asc(productsTable.packSizeCode),
        asc(productsTable.packSize),
      );

    // every pack size is its own product row; a card groups them by sub-category, brand and name
    const groups = new Map<string, ProductGroupModel>();
    for (const { product: p, categoryName, subCategoryName, price } of rows) {
      const key = `${p.subCategoryId}|${p.brand}|${p.name ?? ""}`;
      const group = groups.get(key) ?? {
        key,
        categoryId: p.categoryId,
        categoryName,
        subCategoryId: p.subCategoryId,
        subCategoryName,
        brand: p.brand,
        name: p.name,
        hsn4Digit: p.hsn4Digit,
        imageUrl: p.imageUrl,
        packs: [],
      };
      group.imageUrl ??= p.imageUrl;
      group.hsn4Digit ??= p.hsn4Digit;
      group.packs.push({
        productId: p.id,
        packSizeCode: p.packSizeCode,
        packSize: p.packSize,
        hsn8Digit: p.hsn8Digit,
        quantity: p.quantity,
        reservedQuantity: p.reservedQuantity,
        unreservedQuantity: p.unreservedQuantity,
        quantitySold: p.quantitySold,
        priceAfterGst: num(price?.priceAfterGst ?? null),
        priceBeforeGst: num(price?.priceBeforeGst ?? null),
        gstPercent: num(price?.gstPercent ?? null),
        weightedAverageCost: num(p.weightedAverageCost),
        imageUrl: p.imageUrl,
        isActive: p.isActive,
      });
      groups.set(key, group);
    }
    return [...groups.values()];
  }

  // both must exist and be active, and the sub-category must belong to the category
  private async assertActiveSubCategory(tx: Tx, categoryId: string, subCategoryId: string) {
    const [row] = await tx
      .select({ categoryActive: categoriesTable.isActive, subActive: subCategoriesTable.isActive })
      .from(subCategoriesTable)
      .innerJoin(categoriesTable, eq(categoriesTable.id, subCategoriesTable.categoryId))
      .where(and(eq(subCategoriesTable.id, subCategoryId), eq(subCategoriesTable.categoryId, categoryId)));
    if (!row) throw new TRPCError({ code: "NOT_FOUND", message: "Sub-category not found in this category." });
    if (!row.categoryActive || !row.subActive) {
      throw new TRPCError({ code: "PRECONDITION_FAILED", message: "This category or sub-category is inactive." });
    }
  }

  // a product with all its pack sizes and each pack size's first price, all or nothing;
  // quantity and cost come later from purchases
  async create(rawInput: CreateProductInputModel, actor: ActorModel): Promise<ProductGroupModel> {
    const input = createProductInputModel.parse(rawInput);

    try {
      const { subCategoryId, brand, name } = await db.transaction(async (tx) => {
        const { categoryId, subCategoryId } = input;
        await this.assertActiveSubCategory(tx, categoryId, subCategoryId);

        for (const pack of input.packs) {
          const [product] = await tx
            .insert(productsTable)
            .values({
              categoryId,
              subCategoryId,
              brand: input.brand,
              name: input.name ?? null,
              packSizeCode: pack.packSizeCode,
              packSize: pack.packSize,
              hsn4Digit: input.hsn4Digit,
              hsn8Digit: input.hsn8Digit,
              imageUrl: input.imageUrl,
            })
            .returning({ id: productsTable.id });

          const price = splitPrice(pack.priceAfterGst, pack.gstPercent);
          await tx.insert(productPricesTable).values({ productId: product!.id, ...price });
          await tx.insert(productPriceHistoryTable).values({
            productId: product!.id,
            ...price,
            changedById: actor.id,
            changedByName: actor.name,
          });
        }
        return { subCategoryId, brand: input.brand, name: input.name ?? null };
      });

      const groups = await this.list({ includeInactive: true });
      return groups.find((g) => g.key === `${subCategoryId}|${brand}|${name ?? ""}`)!;
    } catch (error) {
      if (isUniqueViolation(error)) {
        throw new TRPCError({ code: "CONFLICT", message: "One of these pack sizes already exists for this product." });
      }
      throw error;
    }
  }

  // the new price applies to new sales only; each change is logged and becomes a step on the graph
  async updatePrice(input: UpdatePriceInputModel, actor: ActorModel) {
    return db.transaction(async (tx) => {
      const [current] = await tx
        .select({ id: productsTable.id, gstPercent: productPricesTable.gstPercent })
        .from(productsTable)
        .leftJoin(productPricesTable, eq(productPricesTable.productId, productsTable.id))
        .where(eq(productsTable.id, input.productId));
      if (!current) throw new TRPCError({ code: "NOT_FOUND", message: "Product not found." });

      const gstPercent = input.gstPercent ?? num(current.gstPercent);
      if (gstPercent == null) {
        throw new TRPCError({ code: "BAD_REQUEST", message: "Set the GST % for this pack size." });
      }

      const price = splitPrice(input.priceAfterGst, gstPercent);
      await tx
        .insert(productPricesTable)
        .values({ productId: input.productId, ...price })
        .onConflictDoUpdate({ target: productPricesTable.productId, set: { ...price, updatedAt: new Date() } });

      await tx.insert(productPriceHistoryTable).values({
        productId: input.productId,
        ...price,
        changedById: actor.id,
        changedByName: actor.name,
      });

      return {
        productId: input.productId,
        priceAfterGst: Number(price.priceAfterGst),
        priceBeforeGst: Number(price.priceBeforeGst),
        gstPercent: Number(price.gstPercent),
      };
    });
  }

  // brand, name, category, sub-category and HSN of a product, for all its pack sizes at once;
  // it can only move into an active category and sub-category
  async updateDetails(input: UpdateDetailsInputModel) {
    try {
      await db.transaction(async (tx) => {
        await this.assertActiveSubCategory(tx, input.categoryId, input.subCategoryId);
        const updated = await tx
          .update(productsTable)
          .set({
            categoryId: input.categoryId,
            subCategoryId: input.subCategoryId,
            brand: input.brand,
            name: input.name,
            hsn4Digit: input.hsn4Digit,
          })
          .where(inArray(productsTable.id, input.productIds))
          .returning({ id: productsTable.id });
        if (updated.length !== input.productIds.length) {
          throw new TRPCError({ code: "NOT_FOUND", message: "Product not found." });
        }
        // the photo belongs to one pack size
        if (input.image) {
          if (!input.productIds.includes(input.image.productId)) {
            throw new TRPCError({ code: "BAD_REQUEST", message: "That pack size isn't part of this product." });
          }
          await tx.update(productsTable).set({ imageUrl: input.image.imageUrl }).where(eq(productsTable.id, input.image.productId));
        }
      });
    } catch (error) {
      if (isUniqueViolation(error)) {
        throw new TRPCError({ code: "CONFLICT", message: "That sub-category already has this product with one of these pack sizes." });
      }
      throw error;
    }
    return { success: true as const };
  }

  // an inactive pack size leaves the pickers but stays on old records
  async setActive(input: SetProductsActiveInputModel) {
    const updated = await db
      .update(productsTable)
      .set({ isActive: input.isActive })
      .where(inArray(productsTable.id, input.productIds))
      .returning({ id: productsTable.id });
    if (updated.length !== input.productIds.length) throw new TRPCError({ code: "NOT_FOUND", message: "Product not found." });
    return { success: true as const };
  }

  // safe delete: its own price and cost history go with it, but the database refuses (and nothing changes)
  // while anything else refers to it: stock in a godown, an order, a purchase, a sale, a stock count
  async delete(input: DeleteProductsInputModel) {
    try {
      await db.transaction(async (tx) => {
        const ids = inArray(productPricesTable.productId, input.productIds);
        await tx.delete(productPricesTable).where(ids);
        await tx.delete(productPriceHistoryTable).where(inArray(productPriceHistoryTable.productId, input.productIds));
        await tx.delete(productCostHistoryTable).where(inArray(productCostHistoryTable.productId, input.productIds));
        const deleted = await tx
          .delete(productsTable)
          .where(inArray(productsTable.id, input.productIds))
          .returning({ id: productsTable.id });
        if (deleted.length !== input.productIds.length) {
          throw new TRPCError({ code: "NOT_FOUND", message: "Product not found." });
        }
      });
    } catch (error) {
      if (isStillReferenced(error)) {
        throw new TRPCError({
          code: "PRECONDITION_FAILED",
          message: "This product has been used (stock, orders, purchases or sales); deactivate it instead.",
        });
      }
      throw error;
    }
    return { success: true as const };
  }

  async priceHistory(rawInput: PriceHistoryInputModel): Promise<PriceHistoryModel> {
    const input = priceHistoryInputModel.parse(rawInput);
    const start = rangeStart(input.range);

    const priceColumns = {
      at: productPriceHistoryTable.createdAt,
      priceAfterGst: productPriceHistoryTable.priceAfterGst,
      gstPercent: productPriceHistoryTable.gstPercent,
      changedByName: productPriceHistoryTable.changedByName,
    };
    const costColumns = { at: productCostHistoryTable.createdAt, cost: productCostHistoryTable.weightedAverageCost };

    const samePrice = eq(productPriceHistoryTable.productId, input.productId);
    const sameCost = eq(productCostHistoryTable.productId, input.productId);

    const [prices, costs, priceBefore, costBefore] = await Promise.all([
      db.select(priceColumns).from(productPriceHistoryTable)
        .where(and(samePrice, start ? gte(productPriceHistoryTable.createdAt, start) : undefined))
        .orderBy(asc(productPriceHistoryTable.createdAt)),
      db.select(costColumns).from(productCostHistoryTable)
        .where(and(sameCost, start ? gte(productCostHistoryTable.createdAt, start) : undefined))
        .orderBy(asc(productCostHistoryTable.createdAt)),
      // the value in force when the range starts, so the line begins at its left edge
      start
        ? db.select(priceColumns).from(productPriceHistoryTable)
            .where(and(samePrice, lt(productPriceHistoryTable.createdAt, start)))
            .orderBy(desc(productPriceHistoryTable.createdAt)).limit(1)
        : Promise.resolve([]),
      start
        ? db.select(costColumns).from(productCostHistoryTable)
            .where(and(sameCost, lt(productCostHistoryTable.createdAt, start)))
            .orderBy(desc(productCostHistoryTable.createdAt)).limit(1)
        : Promise.resolve([]),
    ]);

    const edge = <T extends { at: Date }>(rows: T[]) => rows.map((r) => ({ ...r, at: start! }));

    return {
      prices: [...edge(priceBefore), ...prices].map((p) => ({
        at: p.at.toISOString(),
        priceAfterGst: Number(p.priceAfterGst),
        gstPercent: Number(p.gstPercent),
        changedByName: p.changedByName,
      })),
      costs: [...edge(costBefore), ...costs].map((c) => ({ at: c.at.toISOString(), weightedAverageCost: Number(c.cost) })),
    };
  }
}
