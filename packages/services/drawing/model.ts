import { z } from "zod";

import { amountModel, ledgerSummaryModel } from "../accounts/model";
import { remarksModel } from "../transaction/model";

const idModel = z.string().uuid();

// what every drawing carries: made when the form opened (a second save with it gets the first one's result), when
// (today or before), and remarks if any
const drawingFields = {
  saveKey: z.string().uuid().nullable().default(null),
  dateTime: z.coerce.date(),
  remarks: remarksModel,
};

// a pack size's part from one godown
export const drawingGodownPartModel = z.object({ godownId: idModel, quantity: z.number().int().min(1).max(99_999) });

// one pack size the owner takes: where its packs leave from (one or more godowns, each once). Its value is never sent:
// the server takes the weighted average cost and the GST % from the product
export const drawingLineInputModel = z
  .object({ productId: idModel, godowns: z.array(drawingGodownPartModel).min(1, "Pick a godown.").max(20) })
  .refine((l) => new Set(l.godowns.map((g) => g.godownId)).size === l.godowns.length, { message: "Each godown once.", path: ["godowns"] });

// a drawing: money (the amount, out of cash, or one active bank account when one is picked; never more than it holds)
// or goods (pack sizes out of the godowns, each once). One object (the API's routes take only objects): what the other
// kind would carry is left empty
export const createDrawingInputModel = z
  .object({
    ...drawingFields,
    kind: z.enum(["money", "goods"]),
    amount: amountModel.nullable().default(null),
    bankDetailsId: idModel.nullable().default(null),
    lines: z.array(drawingLineInputModel).max(100).default([]),
  })
  .refine((d) => d.kind !== "money" || d.amount !== null, { message: "Enter the amount.", path: ["amount"] })
  .refine((d) => d.kind !== "goods" || d.lines.length > 0, { message: "Add a product.", path: ["lines"] })
  .refine((d) => new Set(d.lines.map((l) => l.productId)).size === d.lines.length, { message: "Each pack size once.", path: ["lines"] });

export type CreateDrawingInputModel = z.infer<typeof createDrawingInputModel>;

export const drawingIdInputModel = z.object({ transactionId: idModel });

export type DrawingIdInputModel = z.infer<typeof drawingIdInputModel>;

// one pack size's part from one godown, as drawn: its name and godown as they read then, how many, a pack's cost
// (weighted average, before GST), its GST % and the input GST reversed on it
const drawingLineModel = z.object({
  productId: idModel,
  name: z.string(),
  godownName: z.string(),
  quantity: z.number(),
  unitCost: z.number(),
  gstRate: z.number(),
  itcReversal: z.number(),
});

// one's own details, for its page after a save and /history/[id]: money (the bank account it came out of, null for
// cash) or goods (its lines, their cost and the GST reversed); the total either way
export const drawingModel = z.object({
  transactionId: idModel,
  kind: z.enum(["money", "goods"]),
  assignedId: z.string(),
  dateTime: z.date(),
  status: z.enum(["active", "cancelled"]),
  total: z.number(),
  bank: z.object({ id: idModel, name: z.string(), last4: z.string() }).nullable(),
  lines: z.array(drawingLineModel),
  cost: z.number(),
  itcReversal: z.number(),
  remarks: z.string().nullable(),
  createdByName: z.string(),
});

export type DrawingModel = z.infer<typeof drawingModel>;

// what a saved one gives back: it, and the ledgers it moved with their balances now
export const savedDrawingModel = drawingModel.extend({ balances: z.array(ledgerSummaryModel) });

export type SavedDrawingModel = z.infer<typeof savedDrawingModel>;
