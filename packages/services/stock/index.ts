import { TRPCError } from "@trpc/server";
import { aliasedTable, and, asc, db, desc, eq, gt, lt, or } from "@repo/database";
import {
  categoriesTable,
  godownsTable,
  productGodownsTable,
  productsTable,
  stockCountGodownsTable,
  stockMovesTable,
  subCategoriesTable,
} from "@repo/database/schema";

import StockEngine from "./engine";
import {
  type ActorModel,
  type GodownStockModel,
  type ListMovesInputModel,
  type MoveStockInputModel,
  moveStockInputModel,
  type ProductStockInputModel,
  type ProductStockModel,
  type StockMoveModel,
} from "./model";

const UNIT = { KGS: "kg", ML: "ml", BOX: "box", PCS: "pcs" } as const;

// "rice sona masoori india gate 25 kg", as stock_moves keeps it (200 characters at most)
const productNameSnapshot = (p: {
  categoryName: string;
  subCategoryName: string;
  brand: string;
  name: string | null;
  packSize: number;
  packSizeCode: keyof typeof UNIT;
}) => [p.categoryName, p.subCategoryName, p.brand, p.name, `${p.packSize} ${UNIT[p.packSizeCode]}`].filter(Boolean).join(" ").slice(0, 200);

// what's in each godown, one pack size across godowns, and moving stock between godowns;
// every change goes through the stock engine
export default class StockService {
  constructor(private readonly engine = new StockEngine()) {}

  // /stock: one card per active godown with the products it holds, grouped like the product cards
  // (sub-category, brand, name), each pack size with its quantity in that godown
  async byGodown(): Promise<GodownStockModel[]> {
    const [godowns, rows, counting] = await Promise.all([
      db.select().from(godownsTable).where(eq(godownsTable.isActive, true)).orderBy(asc(godownsTable.godownName)),
      db
        .select({
          godownId: productGodownsTable.godownId,
          quantity: productGodownsTable.quantity,
          product: productsTable,
          categoryName: categoriesTable.name,
          subCategoryName: subCategoriesTable.name,
        })
        .from(productGodownsTable)
        .innerJoin(productsTable, eq(productsTable.id, productGodownsTable.productId))
        .innerJoin(categoriesTable, eq(categoriesTable.id, productsTable.categoryId))
        .innerJoin(subCategoriesTable, eq(subCategoriesTable.id, productsTable.subCategoryId))
        .where(gt(productGodownsTable.quantity, 0))
        .orderBy(
          asc(categoriesTable.name),
          asc(subCategoriesTable.name),
          asc(productsTable.brand),
          asc(productsTable.name),
          asc(productsTable.packSizeCode),
          asc(productsTable.packSize),
        ),
      db.select({ godownId: stockCountGodownsTable.godownId }).from(stockCountGodownsTable).where(eq(stockCountGodownsTable.status, "counting")),
    ]);
    const locked = new Set(counting.map((c) => c.godownId));

    const cards = new Map<string, GodownStockModel>(
      godowns.map((g) => [g.id, { godownId: g.id, godownName: g.godownName, beingCounted: locked.has(g.id), productCount: 0, products: [] }]),
    );
    for (const { godownId, quantity, product: p, categoryName, subCategoryName } of rows) {
      const card = cards.get(godownId);
      if (!card) continue; // an inactive godown holds nothing, but skip it if it ever does
      const key = `${p.subCategoryId}|${p.brand}|${p.name ?? ""}`;
      let group = card.products.find((g) => g.key === key);
      if (!group) {
        group = { key, categoryName, subCategoryName, brand: p.brand, name: p.name, imageUrl: p.imageUrl, packs: [] };
        card.products.push(group);
      }
      group.imageUrl ??= p.imageUrl;
      group.packs.push({ productId: p.id, packSizeCode: p.packSizeCode, packSize: p.packSize, quantity, imageUrl: p.imageUrl });
      card.productCount++;
    }
    return [...cards.values()];
  }

  // one pack size: its total, reserved and free quantities, and how much each godown holds
  async product(input: ProductStockInputModel): Promise<ProductStockModel> {
    const [product] = await db.select().from(productsTable).where(eq(productsTable.id, input.productId));
    if (!product) throw new TRPCError({ code: "NOT_FOUND", message: "Product not found." });
    const godowns = await db
      .select({ godownId: productGodownsTable.godownId, godownName: godownsTable.godownName, quantity: productGodownsTable.quantity })
      .from(productGodownsTable)
      .innerJoin(godownsTable, eq(godownsTable.id, productGodownsTable.godownId))
      .where(and(eq(productGodownsTable.productId, input.productId), gt(productGodownsTable.quantity, 0)))
      .orderBy(asc(godownsTable.godownName));
    return {
      productId: product.id,
      quantity: product.quantity,
      reservedQuantity: product.reservedQuantity,
      unreservedQuantity: product.unreservedQuantity,
      godowns,
    };
  }

  // move stock from one godown to another: same business and GSTIN, so no GST and no ledger entry;
  // only the two godowns change, and the move is logged with who did it
  async move(rawInput: MoveStockInputModel, actor: ActorModel): Promise<StockMoveModel> {
    const input = moveStockInputModel.parse(rawInput);

    const [product] = await db
      .select({
        packSize: productsTable.packSize,
        packSizeCode: productsTable.packSizeCode,
        brand: productsTable.brand,
        name: productsTable.name,
        categoryName: categoriesTable.name,
        subCategoryName: subCategoriesTable.name,
      })
      .from(productsTable)
      .innerJoin(categoriesTable, eq(categoriesTable.id, productsTable.categoryId))
      .innerJoin(subCategoriesTable, eq(subCategoriesTable.id, productsTable.subCategoryId))
      .where(eq(productsTable.id, input.productId));
    if (!product) throw new TRPCError({ code: "NOT_FOUND", message: "Product not found." });

    const id = await db.transaction(async (tx) => {
      await this.engine.apply(tx, [
        { productId: input.productId, godownId: input.fromGodownId, delta: -input.quantity },
        { productId: input.productId, godownId: input.toGodownId, delta: input.quantity },
      ]);
      const [move] = await tx
        .insert(stockMovesTable)
        .values({
          productId: input.productId,
          productNameSnapshot: productNameSnapshot(product),
          fromGodownId: input.fromGodownId,
          toGodownId: input.toGodownId,
          quantity: input.quantity,
          vehicleNumber: input.vehicleNumber,
          remarks: input.remarks,
          movedById: actor.id,
          movedByName: actor.name.slice(0, 30),
        })
        .returning({ id: stockMovesTable.id });
      return move!.id;
    });

    const [saved] = await this.moves({ limit: 1 }, id);
    return saved!;
  }

  // the move history, newest first (or one move by its id)
  async moves(input: ListMovesInputModel, id?: string): Promise<StockMoveModel[]> {
    const from = aliasedTable(godownsTable, "from_godown");
    const to = aliasedTable(godownsTable, "to_godown");
    const rows = await db
      .select({ move: stockMovesTable, fromGodownName: from.godownName, toGodownName: to.godownName })
      .from(stockMovesTable)
      .innerJoin(from, eq(from.id, stockMovesTable.fromGodownId))
      .innerJoin(to, eq(to.id, stockMovesTable.toGodownId))
      .where(
        and(
          id ? eq(stockMovesTable.id, id) : undefined,
          input.productId ? eq(stockMovesTable.productId, input.productId) : undefined,
          input.godownId ? or(eq(stockMovesTable.fromGodownId, input.godownId), eq(stockMovesTable.toGodownId, input.godownId)) : undefined,
          input.before ? lt(stockMovesTable.createdAt, input.before) : undefined,
        ),
      )
      .orderBy(desc(stockMovesTable.createdAt))
      .limit(input.limit);

    return rows.map(({ move: m, fromGodownName, toGodownName }) => ({
      id: m.id,
      productId: m.productId,
      productName: m.productNameSnapshot,
      fromGodownId: m.fromGodownId,
      fromGodownName,
      toGodownId: m.toGodownId,
      toGodownName,
      quantity: m.quantity,
      vehicleNumber: m.vehicleNumber,
      remarks: m.remarks,
      movedByName: m.movedByName,
      movedAt: m.createdAt,
    }));
  }
}
