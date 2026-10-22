import { z } from "zod";

// names are stored lowercase; the app capitalises them for display
const nameModel = z.string().trim().min(1).max(50).transform((v) => v.toLowerCase());

const idModel = z.string().uuid();

export const subCategoryModel = z.object({
  id: idModel,
  categoryId: idModel,
  name: z.string(),
  isActive: z.boolean(),
  activeProducts: z.number().int(),
});

export type SubCategoryModel = z.infer<typeof subCategoryModel>;

export const categoryModel = z.object({
  id: idModel,
  name: z.string(),
  isActive: z.boolean(),
  activeProducts: z.number().int(),
  subCategories: z.array(subCategoryModel),
});

export type CategoryModel = z.infer<typeof categoryModel>;

export const listCategoriesInputModel = z
  .object({ includeInactive: z.boolean().default(false) })
  .default({ includeInactive: false });

export type ListCategoriesInputModel = z.infer<typeof listCategoriesInputModel>;

export const createCategoryInputModel = z.object({ name: nameModel });

export type CreateCategoryInputModel = z.infer<typeof createCategoryInputModel>;

export const renameInputModel = z.object({ id: idModel, name: nameModel });

export type RenameInputModel = z.infer<typeof renameInputModel>;

export const setActiveInputModel = z.object({ id: idModel, isActive: z.boolean() });

export type SetActiveInputModel = z.infer<typeof setActiveInputModel>;

export const deleteCategoryInputModel = z.object({ id: idModel });

export type DeleteCategoryInputModel = z.infer<typeof deleteCategoryInputModel>;

export const createSubCategoryInputModel = z.object({ categoryId: idModel, name: nameModel });

export type CreateSubCategoryInputModel = z.infer<typeof createSubCategoryInputModel>;

export const deleteSubCategoryInputModel = z.object({ id: idModel });

export type DeleteSubCategoryInputModel = z.infer<typeof deleteSubCategoryInputModel>;

