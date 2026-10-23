import { TRPCError } from "@trpc/server";
import { and, asc, count, db, eq, gt, inArray, ne, sql } from "@repo/database";
import { godownsTable, productGodownsTable, productsTable, stockCountGodownsTable } from "@repo/database/schema";

import StockEngine from "../stock/engine";

import {
  type CreateGodownInputModel,
  createGodownInputModel,
  type GodownIdInputModel,
  type GodownModel,
  type GodownSummaryModel,
  type ListGodownsInputModel,
  type SetGodownActiveInputModel,
  type UpdateGodownInputModel,
  updateGodownInputModel,
} from "./model";

// numeric columns come back as strings
const num = (v: string | null) => (v == null ? null : Number(v));

const notFound = () => new TRPCError({ code: "NOT_FOUND", message: "Godown not found." });

const nameTaken = () => new TRPCError({ code: "CONFLICT", message: "Another godown already has this name." });

// the database's unique name index caught two saves racing for the same name
const isUniqueViolation = (error: unknown) =>
  ((error as { cause?: { code?: string } })?.cause ?? (error as { code?: string }))?.code === "23505";

// godowns hold the stock; one is made inactive only once it is empty, and never while it is being counted
export default class GodownService {
  constructor(private readonly engine = new StockEngine()) {}

  // every godown with how many pack sizes it holds and whether a count has it locked
  private async summaries(where?: ReturnType<typeof eq>) {
    const [godowns, held, counting] = await Promise.all([
      db.select().from(godownsTable).where(where).orderBy(asc(godownsTable.godownName)),
      db
        .select({ godownId: productGodownsTable.godownId, products: count() })
        .from(productGodownsTable)
        .where(gt(productGodownsTable.quantity, 0))
        .groupBy(productGodownsTable.godownId),
      db
        .select({ godownId: stockCountGodownsTable.godownId })
        .from(stockCountGodownsTable)
        .where(eq(stockCountGodownsTable.status, "counting")),
    ]);
    const heldBy = new Map(held.map((h) => [h.godownId, h.products]));
    const locked = new Set(counting.map((c) => c.godownId));

    return godowns.map((g) => ({
      row: g,
      summary: {
        id: g.id,
        godownName: g.godownName,
        address: g.address,
        isActive: g.isActive,
        productCount: heldBy.get(g.id) ?? 0,
        beingCounted: locked.has(g.id),
      } satisfies GodownSummaryModel,
    }));
  }

  private full({ row, summary }: Awaited<ReturnType<GodownService["summaries"]>>[number]): GodownModel {
    return {
      ...summary,
      ownership: row.ownership,
      rent: num(row.rent),
      rentTimingInMonths: row.rentTimingInMonths,
      usedFrom: row.usedFrom,
      landlordName: row.landlordName,
      landlordCountryCode: row.landlordCountryCode,
      landlordNumber: row.landlordNumber,
    };
  }

  // the list everyone sees: names and what they hold, no rent or landlord
  async list(input: ListGodownsInputModel): Promise<GodownSummaryModel[]> {
    const rows = await this.summaries(input.includeInactive ? undefined : eq(godownsTable.isActive, true));
    return rows.map((r) => r.summary);
  }

  // one godown with its rental details, for the admin
  async get(input: GodownIdInputModel): Promise<GodownModel> {
    const [row] = await this.summaries(eq(godownsTable.id, input.id));
    if (!row) throw notFound();
    return this.full(row);
  }

  // two godowns can't share a name (compared without case or outer spaces)
  private async assertNameFree(name: string, exceptId?: string) {
    const [clash] = await db
      .select({ id: godownsTable.id })
      .from(godownsTable)
      .where(and(eq(sql`lower(${godownsTable.godownName})`, name.toLowerCase()), exceptId ? ne(godownsTable.id, exceptId) : undefined));
    if (clash) throw nameTaken();
  }

  private values(details: ReturnType<typeof createGodownInputModel.parse>["details"]) {
    return { ...details, rent: details.rent == null ? null : details.rent.toFixed(2) };
  }

  // a new godown, with the stock already in it; both are saved together or not at all
  async create(rawInput: CreateGodownInputModel): Promise<GodownModel> {
    const { details, openingStock } = createGodownInputModel.parse(rawInput);
    await this.assertNameFree(details.godownName);

    // opening stock only for active pack sizes that exist
    if (openingStock.length > 0) {
      const ids = openingStock.map((l) => l.productId);
      const found = await db
        .select({ id: productsTable.id, isActive: productsTable.isActive })
        .from(productsTable)
        .where(inArray(productsTable.id, ids));
      if (found.length !== ids.length) throw new TRPCError({ code: "NOT_FOUND", message: "Product not found." });
      if (found.some((p) => !p.isActive)) {
        throw new TRPCError({ code: "PRECONDITION_FAILED", message: "Opening stock can't include an inactive pack size." });
      }
    }

    try {
      const id = await db.transaction(async (tx) => {
        const [created] = await tx.insert(godownsTable).values(this.values(details)).returning({ id: godownsTable.id });
        await this.engine.apply(
          tx,
          openingStock.map((l) => ({ productId: l.productId, godownId: created!.id, delta: l.quantity })),
        );
        return created!.id;
      });
      return this.get({ id });
    } catch (error) {
      if (isUniqueViolation(error)) throw nameTaken();
      throw error;
    }
  }

  async update(rawInput: UpdateGodownInputModel): Promise<GodownModel> {
    const { id, details } = updateGodownInputModel.parse(rawInput);
    await this.assertNameFree(details.godownName, id);
    try {
      const updated = await db.update(godownsTable).set(this.values(details)).where(eq(godownsTable.id, id)).returning({ id: godownsTable.id });
      if (updated.length === 0) throw notFound();
    } catch (error) {
      if (isUniqueViolation(error)) throw nameTaken();
      throw error;
    }
    return this.get({ id });
  }

  // inactive only once it holds nothing and no count is under way; reactivating is always allowed.
  // The godown row is locked first, so a move into it at the same moment either lands before the
  // check (and blocks this) or waits and then finds it inactive
  async setActive(input: SetGodownActiveInputModel): Promise<GodownModel> {
    await db.transaction(async (tx) => {
      const [godown] = await tx.select({ id: godownsTable.id }).from(godownsTable).where(eq(godownsTable.id, input.id)).for("update");
      if (!godown) throw notFound();
      if (!input.isActive) {
        const [held] = await tx
          .select({ products: count() })
          .from(productGodownsTable)
          .where(and(eq(productGodownsTable.godownId, input.id), gt(productGodownsTable.quantity, 0)));
        if ((held?.products ?? 0) > 0) {
          throw new TRPCError({ code: "PRECONDITION_FAILED", message: "This godown still holds stock. Move it out first." });
        }
        const [counting] = await tx
          .select({ id: stockCountGodownsTable.id })
          .from(stockCountGodownsTable)
          .where(and(eq(stockCountGodownsTable.godownId, input.id), eq(stockCountGodownsTable.status, "counting")));
        if (counting) throw new TRPCError({ code: "CONFLICT", message: "This godown is being counted. Try again once its count is submitted." });
      }
      await tx.update(godownsTable).set({ isActive: input.isActive }).where(eq(godownsTable.id, input.id));
    });
    return this.get({ id: input.id });
  }
}
