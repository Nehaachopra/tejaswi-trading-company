import { TRPCError } from "@trpc/server";
import { and, asc, db, desc, eq, gte, ilike, inArray, isNull, lt, or, sql } from "@repo/database";
import {
  categoriesTable,
  productCostHistoryTable,
  productPriceHistoryTable,
  productPricesTable,
  productsTable,
  purchaseOrderProductsTable,
  purchaseOrdersTable,
  purchaseProductsTable,
  purchasesTable,
  saleOrderProductsTable,
  saleOrdersTable,
  subCategoriesTable,
  transactionsTable,
  deletedProductsTable,
} from "@repo/database/schema";

import {
  type ActorModel,
  type CostHistoryInputModel,
  costHistoryInputModel,
  type CostHistoryModel,
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
  // 23503 for a plain foreign key, 23001 for one set to RESTRICT
  const code = pgCode(error);
  return code === "23503" || code === "23001";
}

// the financial year runs April to March
function rangeStart(range: "3m" | "fy" | "all" | "recent", today = new Date()) {
  if (range === "all" || range === "recent") return null;
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
          // deleted pack sizes never show, not even with Show inactive
          isNull(productsTable.deletedAt),
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
        asc(productsTable.packCount),
      );

    // every pack size is its own product row; a card groups them by sub-category, brand, name and unit
    const groups = new Map<string, ProductGroupModel>();
    for (const { product: p, categoryName, subCategoryName, price } of rows) {
      const key = `${p.subCategoryId}|${p.brand}|${p.name ?? ""}|${p.packSizeCode}`;
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
        packCount: p.packCount,
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

  // inside a save (a product of its own, or one added while recording a purchase): the product's pack sizes, each
  // with its first price; gives back each pack size's id, in the order given. A pack size that already exists fails
  // the whole save (a unique violation, for the caller to word)
  async createIn(tx: Tx, rawInput: CreateProductInputModel, actor: ActorModel): Promise<string[]> {
    const input = createProductInputModel.parse(rawInput);
    const { categoryId, subCategoryId } = input;
    await this.assertActiveSubCategory(tx, categoryId, subCategoryId);
    const ids: string[] = [];
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
          packCount: pack.packCount,
          hsn4Digit: input.hsn4Digit,
          hsn8Digit: input.hsn8Digit,
          imageUrl: input.imageUrl,
        })
        .returning({ id: productsTable.id });

      // from a purchase order with no selling price yet: only its GST %, and nothing logged until a price is set
      if (pack.priceAfterGst === undefined) {
        await tx.insert(productPricesTable).values({ productId: product!.id, gstPercent: String(pack.gstPercent), fromPurchase: true });
        ids.push(product!.id);
        continue;
      }
      const price = splitPrice(pack.priceAfterGst, pack.gstPercent);
      await tx.insert(productPricesTable).values({ productId: product!.id, ...price, fromPurchase: input.fromPurchase });
      await tx.insert(productPriceHistoryTable).values({
        productId: product!.id,
        ...price,
        changedById: actor.id,
        changedByName: actor.name,
      });
      ids.push(product!.id);
    }
    return ids;
  }

  // a product with all its pack sizes and each pack size's first price, all or nothing;
  // quantity and cost come later from purchases
  async create(rawInput: CreateProductInputModel, actor: ActorModel): Promise<ProductGroupModel> {
    const input = createProductInputModel.parse(rawInput);

    try {
      const { subCategoryId, brand, name } = await db.transaction(async (tx) => {
        await this.createIn(tx, input, actor);
        return { subCategoryId: input.subCategoryId, brand: input.brand, name: input.name ?? null };
      });

      const groups = await this.list({ includeInactive: true });
      return groups.find((g) => g.key === `${subCategoryId}|${brand}|${name ?? ""}|${input.packs[0]!.packSizeCode}`)!;
    } catch (error) {
      if (isUniqueViolation(error)) {
        throw new TRPCError({ code: "CONFLICT", message: "One of these pack sizes already exists for this product." });
      }
      throw error;
    }
  }

  // saves a pack size's selling price (GST included) inside a running transaction, and logs it as a step on the graph;
  // the price card's change and a sale of a pack size with no price yet both come here
  async setPriceIn(tx: Tx, productId: string, priceAfterGst: number, gstPercent: number, actor: ActorModel) {
    const price = splitPrice(priceAfterGst, gstPercent);
    await tx
      .insert(productPricesTable)
      .values({ productId, ...price })
      .onConflictDoUpdate({ target: productPricesTable.productId, set: { ...price, updatedAt: new Date() } });
    await tx.insert(productPriceHistoryTable).values({ productId, ...price, changedById: actor.id, changedByName: actor.name });
    return price;
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

      const price = await this.setPriceIn(tx, input.productId, input.priceAfterGst, gstPercent, actor);

      return {
        productId: input.productId,
        priceAfterGst: Number(price.priceAfterGst),
        priceBeforeGst: Number(price.priceBeforeGst),
        gstPercent: Number(price.gstPercent),
      };
    });
  }

  // brand, name, category, sub-category and HSN of a product, for all its pack sizes at once, with one pack
  // size's size, own HSN, GST % and active switch; all or nothing. It can only move into an active
  // category and sub-category
  async updateDetails(input: UpdateDetailsInputModel, actor: ActorModel) {
    const { pack } = input;
    if (!input.productIds.includes(pack.productId)) {
      throw new TRPCError({ code: "BAD_REQUEST", message: "That pack size isn't part of this product." });
    }
    const hsn4Digit = input.hsn ? input.hsn.slice(0, 4) : null;
    try {
      await db.transaction(async (tx) => {
        await this.assertActiveSubCategory(tx, input.categoryId, input.subCategoryId);

        // the shared details, on every pack size
        const updated = await tx
          .update(productsTable)
          .set({
            categoryId: input.categoryId,
            subCategoryId: input.subCategoryId,
            brand: input.brand,
            name: input.name,
            hsn4Digit,
          })
          .where(inArray(productsTable.id, input.productIds))
          .returning({ id: productsTable.id });
        if (updated.length !== input.productIds.length) {
          throw new TRPCError({ code: "NOT_FOUND", message: "Product not found." });
        }

        // this pack size's own: size, active, and its 8-digit HSN (if 8 were typed); the unit, set when the product
        // was made, is never changed
        await tx
          .update(productsTable)
          .set({
            packSize: pack.packSize,
            packCount: pack.packCount,
            isActive: pack.isActive,
            hsn8Digit: input.hsn?.length === 8 ? input.hsn : null,
          })
          .where(eq(productsTable.id, pack.productId));

        // the other pack sizes keep an 8-digit HSN only while it still starts with the shared 4
        const others = input.productIds.filter((id) => id !== pack.productId);
        if (others.length > 0) {
          await tx
            .update(productsTable)
            .set({ hsn8Digit: null })
            .where(
              and(
                inArray(productsTable.id, others),
                hsn4Digit ? sql`left(${productsTable.hsn8Digit}, 4) <> ${hsn4Digit}` : undefined,
              ),
            );
        }

        // a new GST %: the price with GST stays, before-GST and GST are worked out again and logged
        const [current] = await tx
          .select({ priceAfterGst: productPricesTable.priceAfterGst, gstPercent: productPricesTable.gstPercent })
          .from(productPricesTable)
          .where(eq(productPricesTable.productId, pack.productId));
        if (!current) throw new TRPCError({ code: "BAD_REQUEST", message: "Set the price for this pack size first." });
        // no selling price yet (added from a purchase order): only the GST % changes
        if (current.priceAfterGst == null) {
          if (Number(current.gstPercent) !== pack.gstPercent) {
            await tx
              .update(productPricesTable)
              .set({ gstPercent: String(pack.gstPercent), updatedAt: new Date() })
              .where(eq(productPricesTable.productId, pack.productId));
          }
        } else if (Number(current.gstPercent) !== pack.gstPercent) {
          const price = splitPrice(Number(current.priceAfterGst), pack.gstPercent);
          await tx
            .update(productPricesTable)
            .set({ ...price, updatedAt: new Date() })
            .where(eq(productPricesTable.productId, pack.productId));
          await tx.insert(productPriceHistoryTable).values({
            productId: pack.productId,
            ...price,
            changedById: actor.id,
            changedByName: actor.name,
          });
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
      .where(and(inArray(productsTable.id, input.productIds), isNull(productsTable.deletedAt)))
      .returning({ id: productsTable.id });
    if (updated.length !== input.productIds.length) throw new TRPCError({ code: "NOT_FOUND", message: "Product not found." });
    return { success: true as const };
  }

  // delete pack sizes with no quantity left and no open order waiting on them. One never used anywhere is removed
  // with its own price and cost history; one that old purchases, sales or orders still name is kept for them, marked
  // deleted (and inactive) so it leaves every list and picker
  async delete(input: DeleteProductsInputModel) {
    await db.transaction(async (tx) => {
      const products = await tx
        .select({
          id: productsTable.id,
          quantity: productsTable.quantity,
          reserved: productsTable.reservedQuantity,
          subCategoryId: productsTable.subCategoryId,
          categoryId: productsTable.categoryId,
        })
        .from(productsTable)
        .where(and(inArray(productsTable.id, input.productIds), isNull(productsTable.deletedAt)))
        .for("update");
      if (products.length !== input.productIds.length) throw new TRPCError({ code: "NOT_FOUND", message: "Product not found." });
      if (products.some((p) => p.quantity > 0 || p.reserved > 0)) {
        throw new TRPCError({ code: "PRECONDITION_FAILED", message: "Only a pack size with no quantity left can be deleted." });
      }

      // an order still pending would lose its pack size
      const [purchaseOrder] = await tx
        .select({ id: purchaseOrdersTable.id })
        .from(purchaseOrderProductsTable)
        .innerJoin(purchaseOrdersTable, eq(purchaseOrdersTable.id, purchaseOrderProductsTable.purchaseOrderId))
        .where(and(inArray(purchaseOrderProductsTable.productId, input.productIds), eq(purchaseOrdersTable.status, "pending")))
        .limit(1);
      const [saleOrder] = await tx
        .select({ id: saleOrdersTable.id })
        .from(saleOrderProductsTable)
        .innerJoin(saleOrdersTable, eq(saleOrdersTable.id, saleOrderProductsTable.saleOrderId))
        .where(and(inArray(saleOrderProductsTable.productId, input.productIds), eq(saleOrdersTable.status, "pending")))
        .limit(1);
      if (purchaseOrder || saleOrder) {
        throw new TRPCError({ code: "PRECONDITION_FAILED", message: "An open order still has this pack size. Complete or cancel it first." });
      }

      // moved, not kept: each row goes to deleted_products (same id, its category and sub-category as names), and its
      // current price goes. What names it (old orders, purchases, sales, stock moves and counts, price and cost
      // history, its godown rows) keeps pointing to that id, now found in deleted_products
      const rows = await tx
        .select({ p: productsTable, categoryName: categoriesTable.name, subCategoryName: subCategoriesTable.name })
        .from(productsTable)
        .innerJoin(categoriesTable, eq(categoriesTable.id, productsTable.categoryId))
        .innerJoin(subCategoriesTable, eq(subCategoriesTable.id, productsTable.subCategoryId))
        .where(inArray(productsTable.id, input.productIds));
      await tx.insert(deletedProductsTable).values(
        rows.map(({ p, categoryName, subCategoryName }) => ({
          id: p.id,
          categoryId: p.categoryId,
          categoryName,
          subCategoryId: p.subCategoryId,
          subCategoryName,
          brand: p.brand,
          name: p.name,
          packSizeCode: p.packSizeCode,
          packSize: p.packSize,
          packCount: p.packCount,
          hsn4Digit: p.hsn4Digit,
          hsn8Digit: p.hsn8Digit,
          imageUrl: p.imageUrl,
          quantitySold: p.quantitySold,
          weightedAverageCost: p.weightedAverageCost,
          createdAt: p.createdAt,
          updatedAt: p.updatedAt,
        })),
      );
      await tx.delete(productPricesTable).where(inArray(productPricesTable.productId, input.productIds));
      await tx.delete(productsTable).where(inArray(productsTable.id, input.productIds));

      // its sub-category and category no longer listed once no other product (active or not) is in them
      await this.dropUnused(tx, products);
    });
    return { success: true as const };
  }

  // a sub-category, then a category, that no product uses any more: deleted, or, while a deleted pack size kept for
  // old records still names it, made inactive, so neither shows in any list. One that still has a product stays
  private async dropUnused(tx: Tx, gone: { subCategoryId: string; categoryId: string }[]) {
    const unused = async (column: typeof productsTable.subCategoryId | typeof productsTable.categoryId, id: string) => {
      const [left] = await tx
        .select({ id: productsTable.id })
        .from(productsTable)
        .where(and(eq(column, id), isNull(productsTable.deletedAt)))
        .limit(1);
      return !left;
    };

    for (const subId of new Set(gone.map((g) => g.subCategoryId))) {
      if (!(await unused(productsTable.subCategoryId, subId))) continue;
      try {
        await tx.transaction((sp) => sp.delete(subCategoriesTable).where(eq(subCategoriesTable.id, subId)));
      } catch (error) {
        if (!isStillReferenced(error)) throw error;
        await tx.update(subCategoriesTable).set({ isActive: false }).where(eq(subCategoriesTable.id, subId));
      }
    }

    for (const categoryId of new Set(gone.map((g) => g.categoryId))) {
      if (!(await unused(productsTable.categoryId, categoryId))) continue;
      // its other sub-categories, empty too, go with it
      try {
        await tx.transaction(async (sp) => {
          await sp.delete(subCategoriesTable).where(eq(subCategoriesTable.categoryId, categoryId));
          await sp.delete(categoriesTable).where(eq(categoriesTable.id, categoryId));
        });
      } catch (error) {
        if (!isStillReferenced(error)) throw error;
        await tx.update(categoriesTable).set({ isActive: false }).where(eq(categoriesTable.id, categoryId));
      }
    }
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

    // the last 5 price changes, oldest first; no cost line
    if (input.range === "recent") {
      const recent = await db.select(priceColumns).from(productPriceHistoryTable)
        .where(samePrice)
        .orderBy(desc(productPriceHistoryTable.createdAt))
        .limit(5);
      return {
        prices: recent.reverse().map((p) => ({
          at: p.at.toISOString(),
          priceAfterGst: Number(p.priceAfterGst),
          gstPercent: Number(p.gstPercent),
          changedByName: p.changedByName,
        })),
        costs: [],
      };
    }

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

  // one pack size's last 5 purchases (active ones only), oldest first: each one's cost a pack with GST, after its
  // discount, dated by the supplier's invoice
  async costHistory(rawInput: CostHistoryInputModel): Promise<CostHistoryModel> {
    const input = costHistoryInputModel.parse(rawInput);
    const rows = await db
      .select({
        at: purchasesTable.invoiceDate,
        gross: purchaseProductsTable.grossProductPrice,
        off: purchaseProductsTable.discountAmount,
        gst: purchaseProductsTable.gstAmount,
        quantity: purchaseProductsTable.quantity,
      })
      .from(purchaseProductsTable)
      .innerJoin(purchasesTable, eq(purchasesTable.id, purchaseProductsTable.purchaseId))
      .innerJoin(transactionsTable, eq(transactionsTable.id, purchasesTable.transactionId))
      .where(and(eq(purchaseProductsTable.productId, input.productId), eq(transactionsTable.status, "active")))
      .orderBy(desc(purchasesTable.invoiceDate), desc(purchaseProductsTable.createdAt))
      .limit(5);
    return {
      costs: rows.reverse().map((r) => ({
        at: new Date(`${r.at}T00:00:00+05:30`).toISOString(),
        costAfterGst: round2((Number(r.gross) - Number(r.off) + Number(r.gst)) / r.quantity),
      })),
    };
  }
}
