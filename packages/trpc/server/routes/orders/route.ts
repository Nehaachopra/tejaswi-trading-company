import { TRPCError } from "@trpc/server";
import { z } from "zod";

import {
  createPurchaseOrderInputModel,
  listPurchaseOrdersInputModel,
  purchaseOrderIdInputModel,
  purchaseOrderModel,
  purchaseOrderShareKeyModel,
  purchaseOrderSummaryModel,
  sharedPurchaseOrderInputModel,
  sharedPurchaseOrderModel,
  supplierPhoneInputModel,
  updatePurchaseOrderInputModel,
} from "@repo/services/purchase-order/model";
import { opensOrder, orderKey } from "@repo/services/transaction/share-link";

import { purchaseOrderService } from "../../services";
import { limitSaves, onceFor } from "../../guards";
import { adminProcedure, publicProcedure, router } from "../../trpc";

// Purchase orders: what we've asked a supplier for; the admin's only
const purchaseOrderRouter = router({
  list: adminProcedure
    .meta({ openapi: { method: "GET", path: "/orders/purchase", tags: ["orders"] } })
    .input(listPurchaseOrdersInputModel)
    .output(z.array(purchaseOrderSummaryModel))
    .query(({ input }) => purchaseOrderService.list(input)),

  get: adminProcedure
    .meta({ openapi: { method: "GET", path: "/orders/purchase/{id}", tags: ["orders"] } })
    .input(purchaseOrderIdInputModel)
    .output(purchaseOrderModel)
    .query(({ input }) => purchaseOrderService.get(input)),

  // a second save with the same key (a retry, a double tap) gets the first one's result
  create: adminProcedure
    .meta({ openapi: { method: "POST", path: "/orders/purchase", tags: ["orders"] } })
    .input(createPurchaseOrderInputModel)
    .output(purchaseOrderModel)
    .mutation(({ ctx, input }) => {
      limitSaves(ctx.session.user.id);
      const save = () => purchaseOrderService.create(input, ctx.session.user);
      return input.saveKey ? onceFor(ctx.session.user.id, input.saveKey, save) : save();
    }),

  // while pending
  update: adminProcedure
    .meta({ openapi: { method: "POST", path: "/orders/purchase/{id}", tags: ["orders"] } })
    .input(updatePurchaseOrderInputModel)
    .output(purchaseOrderModel)
    .mutation(({ input }) => purchaseOrderService.update(input)),

  // the order as a document, headed with our details, with the supplier's address and phone
  document: adminProcedure
    .meta({ openapi: { method: "GET", path: "/orders/purchase/{id}/document", tags: ["orders"] } })
    .input(purchaseOrderIdInputModel)
    .output(sharedPurchaseOrderModel)
    .query(({ input }) => purchaseOrderService.document(input)),

  // the supplier's WhatsApp number typed when sharing, kept on the supplier if they have none
  saveSupplierPhone: adminProcedure
    .meta({ openapi: { method: "POST", path: "/orders/purchase/{id}/supplier-phone", tags: ["orders"] } })
    .input(supplierPhoneInputModel)
    .output(z.void())
    .mutation(({ input }) => purchaseOrderService.saveSupplierPhone(input)),

  // the key for its link, to share it with the supplier on WhatsApp
  shareKey: adminProcedure
    .meta({ openapi: { method: "GET", path: "/orders/purchase/{id}/share-key", tags: ["orders"] } })
    .input(purchaseOrderIdInputModel)
    .output(purchaseOrderShareKeyModel)
    .query(({ input }) => ({ key: orderKey(input.id) })),

  // the order from a shared link, for the supplier: no login, only with the key from that link
  shared: publicProcedure
    .meta({ openapi: { method: "GET", path: "/orders/purchase/{id}/shared", tags: ["orders"] } })
    .input(sharedPurchaseOrderInputModel)
    .output(sharedPurchaseOrderModel)
    .query(({ input }) => {
      if (!opensOrder(input.id, input.key)) throw new TRPCError({ code: "NOT_FOUND", message: "Order not found." });
      return purchaseOrderService.document({ id: input.id });
    }),

  // while pending; what already arrived stays bought
  cancel: adminProcedure
    .meta({ openapi: { method: "POST", path: "/orders/purchase/{id}/cancel", tags: ["orders"] } })
    .input(purchaseOrderIdInputModel)
    .output(purchaseOrderModel)
    .mutation(({ input }) => purchaseOrderService.cancel(input)),
});

export const ordersRouter = router({
  purchase: purchaseOrderRouter,
});
