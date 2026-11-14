import { z } from "zod";

// what one change to an order was about (as the order_edit_field enum)
export const orderEditFieldModel = z.enum(["item_added", "item_removed", "quantity", "rate", "party", "expected_delivery", "discount", "remarks"]);

export type OrderEditField = z.infer<typeof orderEditFieldModel>;

// one save of an order's changes: when, by whom, and each change (an item's names its product), before and after as
// they read: a quantity, a rate or discount in rupees ("1850.00"), a day (YYYY-MM-DD), a name, remarks
export const orderEditModel = z.object({
  editId: z.string().uuid(),
  at: z.date(),
  byName: z.string(),
  changes: z.array(
    z.object({
      field: orderEditFieldModel,
      productId: z.string().uuid().nullable(),
      from: z.string().nullable(),
      to: z.string().nullable(),
    }),
  ),
});

export type OrderEditModel = z.infer<typeof orderEditModel>;
