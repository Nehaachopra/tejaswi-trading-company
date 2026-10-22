import { TRPCError } from "@trpc/server";
import { and, asc, count, db, eq } from "@repo/database";
import { categoriesTable, productsTable, subCategoriesTable } from "@repo/database/schema";

import type {
  CategoryModel,
  CreateCategoryInputModel,
  CreateSubCategoryInputModel,
  DeleteCategoryInputModel,
  DeleteSubCategoryInputModel,
  ListCategoriesInputModel,
  RenameInputModel,
  SetActiveInputModel,
  SubCategoryModel,
} from "./model";

// Postgres error codes, read from drizzle's wrapped error or the raw one
const pgCode = (error: unknown) => ((error as { cause?: { code?: string } })?.cause ?? (error as { code?: string }))?.code;

function isUniqueViolation(error: unknown) {
  return pgCode(error) === "23505";
}

// a row another table still points to (the foreign keys restrict deletes)
function isStillReferenced(error: unknown) {
  return pgCode(error) === "23503";
}

const notEmpty = () =>
  new TRPCError({
    code: "PRECONDITION_FAILED",
    message: "Only an empty category can be deleted. It still has sub-categories or products; deactivate it instead.",
  });

const taken = (message: string) => new TRPCError({ code: "CONFLICT", message });

const subNotEmpty = () =>
  new TRPCError({
    code: "PRECONDITION_FAILED",
    message: "Only a sub-category without products can be deleted; deactivate it instead.",
  });

// products and past sales point to categories and sub-categories, so those are renamed or
// marked inactive; only a category nothing points to (no sub-categories, no products) can be deleted
export default class CategoryService {
  async list(input: ListCategoriesInputModel): Promise<CategoryModel[]> {
    const [categories, subCategories, products] = await Promise.all([
      db.select().from(categoriesTable).orderBy(asc(categoriesTable.name)),
      db.select().from(subCategoriesTable).orderBy(asc(subCategoriesTable.name)),
      db
        .select({ subCategoryId: productsTable.subCategoryId, active: count() })
        .from(productsTable)
        .where(eq(productsTable.isActive, true))
        .groupBy(productsTable.subCategoryId),
    ]);

    const activeBySub = new Map(products.map((p) => [p.subCategoryId, p.active]));
    const keep = (row: { isActive: boolean }) => input.includeInactive || row.isActive;

    return categories.filter(keep).map((c) => {
      const subs: SubCategoryModel[] = subCategories
        .filter((s) => s.categoryId === c.id && keep(s))
        .map((s) => ({
          id: s.id,
          categoryId: s.categoryId,
          name: s.name,
          isActive: s.isActive,
          activeProducts: activeBySub.get(s.id) ?? 0,
        }));
      const activeProducts = subCategories
        .filter((s) => s.categoryId === c.id)
        .reduce((n, s) => n + (activeBySub.get(s.id) ?? 0), 0);
      return { id: c.id, name: c.name, isActive: c.isActive, activeProducts, subCategories: subs };
    });
  }

  private async category(id: string) {
    const [row] = await db.select().from(categoriesTable).where(eq(categoriesTable.id, id));
    if (!row) throw new TRPCError({ code: "NOT_FOUND", message: "Category not found." });
    return row;
  }

  private async subCategory(id: string) {
    const [row] = await db.select().from(subCategoriesTable).where(eq(subCategoriesTable.id, id));
    if (!row) throw new TRPCError({ code: "NOT_FOUND", message: "Sub-category not found." });
    return row;
  }

  private async activeProducts(where: ReturnType<typeof eq>) {
    const [row] = await db
      .select({ n: count() })
      .from(productsTable)
      .where(and(where, eq(productsTable.isActive, true)));
    return row?.n ?? 0;
  }

  async createCategory(input: CreateCategoryInputModel) {
    try {
      const [row] = await db.insert(categoriesTable).values({ name: input.name }).returning();
      return row!;
    } catch (error) {
      if (isUniqueViolation(error)) throw taken("A category with this name already exists.");
      throw error;
    }
  }

  async renameCategory(input: RenameInputModel) {
    await this.category(input.id);
    try {
      const [row] = await db
        .update(categoriesTable)
        .set({ name: input.name })
        .where(eq(categoriesTable.id, input.id))
        .returning();
      return row!;
    } catch (error) {
      if (isUniqueViolation(error)) throw taken("A category with this name already exists.");
      throw error;
    }
  }

  // an inactive category leaves the pickers but stays on old records
  async setCategoryActive(input: SetActiveInputModel) {
    await this.category(input.id);
    if (!input.isActive && (await this.activeProducts(eq(productsTable.categoryId, input.id))) > 0) {
      throw new TRPCError({
        code: "PRECONDITION_FAILED",
        message: "This category still has active products. Make them inactive first.",
      });
    }
    const [row] = await db
      .update(categoriesTable)
      .set({ isActive: input.isActive })
      .where(eq(categoriesTable.id, input.id))
      .returning();
    return row!;
  }

  // safe delete: refused while any sub-category or product (active or not) belongs to it;
  // the foreign keys refuse it too, should one be added between the check and the delete
  async deleteCategory(input: DeleteCategoryInputModel) {
    await this.category(input.id);

    const [subs] = await db.select({ n: count() }).from(subCategoriesTable).where(eq(subCategoriesTable.categoryId, input.id));
    const [products] = await db.select({ n: count() }).from(productsTable).where(eq(productsTable.categoryId, input.id));
    if ((subs?.n ?? 0) > 0 || (products?.n ?? 0) > 0) throw notEmpty();

    try {
      await db.delete(categoriesTable).where(eq(categoriesTable.id, input.id));
    } catch (error) {
      if (isStillReferenced(error)) throw notEmpty();
      throw error;
    }
    return { success: true as const };
  }

  async createSubCategory(input: CreateSubCategoryInputModel) {
    const category = await this.category(input.categoryId);
    if (!category.isActive) {
      throw new TRPCError({ code: "PRECONDITION_FAILED", message: "This category is inactive." });
    }
    try {
      const [row] = await db
        .insert(subCategoriesTable)
        .values({ categoryId: input.categoryId, name: input.name })
        .returning();
      return row!;
    } catch (error) {
      if (isUniqueViolation(error)) throw taken("This category already has a sub-category with this name.");
      throw error;
    }
  }

  async renameSubCategory(input: RenameInputModel) {
    await this.subCategory(input.id);
    try {
      const [row] = await db
        .update(subCategoriesTable)
        .set({ name: input.name })
        .where(eq(subCategoriesTable.id, input.id))
        .returning();
      return row!;
    } catch (error) {
      if (isUniqueViolation(error)) throw taken("This category already has a sub-category with this name.");
      throw error;
    }
  }

  async setSubCategoryActive(input: SetActiveInputModel) {
    await this.subCategory(input.id);
    if (!input.isActive && (await this.activeProducts(eq(productsTable.subCategoryId, input.id))) > 0) {
      throw new TRPCError({
        code: "PRECONDITION_FAILED",
        message: "This sub-category still has active products. Make them inactive first.",
      });
    }
    const [row] = await db
      .update(subCategoriesTable)
      .set({ isActive: input.isActive })
      .where(eq(subCategoriesTable.id, input.id))
      .returning();
    return row!;
  }

  // safe delete: refused while any product (active or not) belongs to it; the foreign key refuses it too
  async deleteSubCategory(input: DeleteSubCategoryInputModel) {
    await this.subCategory(input.id);

    const [products] = await db.select({ n: count() }).from(productsTable).where(eq(productsTable.subCategoryId, input.id));
    if ((products?.n ?? 0) > 0) throw subNotEmpty();

    try {
      await db.delete(subCategoriesTable).where(eq(subCategoriesTable.id, input.id));
    } catch (error) {
      if (isStillReferenced(error)) throw subNotEmpty();
      throw error;
    }
    return { success: true as const };
  }
}
