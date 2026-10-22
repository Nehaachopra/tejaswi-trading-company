import { z } from "zod";

export const packSizeCodeModel = z.enum(["KGS", "ML", "BOX", "PCS"]);

// names are stored lowercase; the app capitalises them for display
const nameModel = z.string().trim().min(1).max(50).transform((v) => v.toLowerCase());

const rupeesModel = z.number().nonnegative().multipleOf(0.01);

const gstPercentModel = z.number().min(0).max(100).multipleOf(0.01);

export const packSizeModel = z.object({
  productId: z.string().uuid(),
  packSizeCode: packSizeCodeModel,
  packSize: z.number().int(),
  hsn8Digit: z.string().nullable(),
  quantity: z.number().int(),
  reservedQuantity: z.number().int(),
  unreservedQuantity: z.number().int(),
  // units sold so far, less sale returns
  quantitySold: z.number().int(),
  // null until the price is set
  priceAfterGst: z.number().nullable(),
  priceBeforeGst: z.number().nullable(),
  gstPercent: z.number().nullable(),
  // null until the first purchase
  weightedAverageCost: z.number().nullable(),
  // this pack size's own photo, if it has one
  imageUrl: z.string().nullable(),
  isActive: z.boolean(),
});

export type PackSizeModel = z.infer<typeof packSizeModel>;

// one card on /product: a brand (and optional name) within a sub-category, with its pack sizes
export const productGroupModel = z.object({
  key: z.string(),
  categoryId: z.string().uuid(),
  categoryName: z.string(),
  subCategoryId: z.string().uuid(),
  subCategoryName: z.string(),
  brand: z.string(),
  name: z.string().nullable(),
  // the 4-digit HSN shared by its pack sizes; each pack size may add its own 8-digit one
  hsn4Digit: z.string().nullable(),
  // the first photo among its pack sizes, shown for any pack size without its own
  imageUrl: z.string().nullable(),
  packs: z.array(packSizeModel),
});

export type ProductGroupModel = z.infer<typeof productGroupModel>;

export const listProductsInputModel = z
  .object({
    search: z.string().trim().max(50).optional(),
    categoryId: z.string().uuid().optional(),
    subCategoryId: z.string().uuid().optional(),
    includeInactive: z.boolean().default(false),
  })
  .default({ includeInactive: false });

export type ListProductsInputModel = z.infer<typeof listProductsInputModel>;

// the category and sub-category must already exist; they are managed on their own
// a product photo: one uploaded to this app's own /uploads for now, or a full https link (a CDN later)
export const imageUrlModel = z.string().max(500).regex(/^(https:\/\/|\/uploads\/)/, "Not an image link.");

export const createProductInputModel = z.object({
  categoryId: z.string().uuid(),
  subCategoryId: z.string().uuid(),
  brand: nameModel,
  name: nameModel.optional(),
  hsn4Digit: z.string().regex(/^\d{4}$/).optional(),
  hsn8Digit: z.string().regex(/^\d{8}$/).optional(),
  imageUrl: imageUrlModel.optional(),
  packs: z
    .array(
      z.object({
        packSizeCode: packSizeCodeModel,
        packSize: z.number().int().positive(),
        gstPercent: gstPercentModel,
        priceAfterGst: rupeesModel,
      }),
    )
    .min(1)
    .refine(
      (packs) => new Set(packs.map((p) => `${p.packSizeCode}:${p.packSize}`)).size === packs.length,
      "Each pack size can be listed once.",
    ),
});

export type CreateProductInputModel = z.input<typeof createProductInputModel>;

export const updatePriceInputModel = z.object({
  productId: z.string().uuid(),
  priceAfterGst: rupeesModel,
  // GST is set per pack size and may change with the price
  gstPercent: gstPercentModel.optional(),
});

export type UpdatePriceInputModel = z.infer<typeof updatePriceInputModel>;

export const historyRangeModel = z.enum(["3m", "fy", "all"]);

export const priceHistoryInputModel = z.object({
  productId: z.string().uuid(),
  range: historyRangeModel.default("fy"),
});

export type PriceHistoryInputModel = z.input<typeof priceHistoryInputModel>;

export const priceHistoryModel = z.object({
  // selling price steps, oldest first; the first point may predate the range so the line starts at its edge
  prices: z.array(
    z.object({
      // ISO strings: there is no transformer, so a Date would reach the browser as a string anyway
      at: z.string(),
      priceAfterGst: z.number(),
      gstPercent: z.number(),
      changedByName: z.string(),
    }),
  ),
  costs: z.array(z.object({ at: z.string(), weightedAverageCost: z.number() })),
});

export type PriceHistoryModel = z.infer<typeof priceHistoryModel>;

// a product is all the pack sizes of one brand (and name) in one sub-category; these change all of them,
// or just the pack sizes listed
const productIdsModel = z.array(z.string().uuid()).min(1);

// brand, name, where it sits and its HSN, for every pack size of the product
export const updateDetailsInputModel = z.object({
  productIds: productIdsModel,
  categoryId: z.string().uuid(),
  subCategoryId: z.string().uuid(),
  brand: nameModel,
  name: nameModel.nullable(),
  hsn4Digit: z.string().regex(/^\d{4}$/).nullable(),
  // one pack size's photo, changed along with the details; null removes it
  image: z.object({ productId: z.string().uuid(), imageUrl: imageUrlModel.nullable() }).optional(),
});

export type UpdateDetailsInputModel = z.infer<typeof updateDetailsInputModel>;

export const setProductsActiveInputModel = z.object({ productIds: productIdsModel, isActive: z.boolean() });

export type SetProductsActiveInputModel = z.infer<typeof setProductsActiveInputModel>;

// only pack sizes nothing refers to (no stock, order, purchase, sale or stock count) can be deleted
export const deleteProductsInputModel = z.object({ productIds: productIdsModel });

export type DeleteProductsInputModel = z.infer<typeof deleteProductsInputModel>;

// who is acting, for the price change log
export type ActorModel = { id: string; name: string };
