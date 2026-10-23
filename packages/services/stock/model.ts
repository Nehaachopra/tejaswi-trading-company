import { z } from "zod";

const idModel = z.string().uuid();

const packSizeCodeModel = z.enum(["KGS", "ML", "BOX", "PCS"]);

// one pack size inside a godown: its quantity there only (the godown view shows no reserved split)
export const godownPackModel = z.object({
  productId: idModel,
  packSizeCode: packSizeCodeModel,
  packSize: z.number().int(),
  quantity: z.number().int(),
  imageUrl: z.string().nullable(),
});

// a product card inside a godown card: image, category, sub-category, brand, then its pack sizes
export const godownProductModel = z.object({
  key: z.string(),
  categoryName: z.string(),
  subCategoryName: z.string(),
  brand: z.string(),
  name: z.string().nullable(),
  imageUrl: z.string().nullable(),
  packs: z.array(godownPackModel),
});

// one godown card on /stock
export const godownStockModel = z.object({
  godownId: idModel,
  godownName: z.string(),
  beingCounted: z.boolean(),
  productCount: z.number().int(),
  products: z.array(godownProductModel),
});

export type GodownStockModel = z.infer<typeof godownStockModel>;

// one pack size across godowns: the total, what orders reserve, what's free, and each godown's share
export const productStockModel = z.object({
  productId: idModel,
  quantity: z.number().int(),
  reservedQuantity: z.number().int(),
  unreservedQuantity: z.number().int(),
  godowns: z.array(z.object({ godownId: idModel, godownName: z.string(), quantity: z.number().int() })),
});

export type ProductStockModel = z.infer<typeof productStockModel>;

export const productStockInputModel = z.object({ productId: idModel });

export type ProductStockInputModel = z.infer<typeof productStockInputModel>;

// moving stock between godowns; lengths follow stock_moves: vehicle number 15, remarks 100
export const moveStockInputModel = z
  .object({
    productId: idModel,
    fromGodownId: idModel,
    toGodownId: idModel,
    quantity: z.number().int().positive().max(1_000_000),
    vehicleNumber: z
      .string()
      .transform((v) => v.replace(/\s+/g, "").toUpperCase())
      .pipe(z.string().max(15))
      .transform((v) => (v === "" ? null : v))
      .nullable()
      .default(null),
    remarks: z
      .string()
      .trim()
      .max(100)
      .transform((v) => (v === "" ? null : v))
      .nullable()
      .default(null),
  })
  .refine((m) => m.fromGodownId !== m.toGodownId, { path: ["toGodownId"], message: "Pick two different godowns." });

export type MoveStockInputModel = z.input<typeof moveStockInputModel>;

export const stockMoveModel = z.object({
  id: idModel,
  productId: idModel,
  productName: z.string(),
  fromGodownId: idModel,
  fromGodownName: z.string(),
  toGodownId: idModel,
  toGodownName: z.string(),
  quantity: z.number().int(),
  vehicleNumber: z.string().nullable(),
  remarks: z.string().nullable(),
  movedByName: z.string(),
  movedAt: z.date(),
});

export type StockMoveModel = z.infer<typeof stockMoveModel>;

// the move history, newest first; filter by a godown (in or out) or a pack size, page with `before`
export const listMovesInputModel = z
  .object({
    godownId: idModel.optional(),
    productId: idModel.optional(),
    before: z.coerce.date().optional(),
    limit: z.number().int().min(1).max(100).default(50),
  })
  .default({ limit: 50 });

export type ListMovesInputModel = z.infer<typeof listMovesInputModel>;

// one change for the stock engine: a pack size in a godown goes up (+) or down (−) by whole packs.
// `reserved` says which part of the product's total it touches: an order's dispatch takes reserved
// stock, everything else (purchases, walk-in sales, returns, counts) the unreserved part
export type StockChange = { productId: string; godownId: string; delta: number; reserved?: boolean };

// who is acting, for the move log
export type ActorModel = { id: string; name: string };
