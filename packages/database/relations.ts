import { relations } from "drizzle-orm";
import * as schema from "./schema";

// ===== USER RELATIONS =====
export const userRelations = relations(schema.user, ({ many }) => ({
  sessions: many(schema.session),
  accounts: many(schema.account),
  twoFactors: many(schema.twoFactor),
  trustedDevices: many(schema.trustedDevicesTable),
  operatorsCreated: many(schema.operatorsTable),
  stockTakes: many(schema.stockTakesTable),
  saleOrders: many(schema.saleOrdersTable),
  purchaseOrders: many(schema.purchaseOrdersTable),
  transactions: many(schema.transactionsTable),
}));

export const sessionRelations = relations(schema.session, ({ one }) => ({
  user: one(schema.user, {
    fields: [schema.session.userId],
    references: [schema.user.id],
  }),
}));

export const accountRelations = relations(schema.account, ({ one }) => ({
  user: one(schema.user, {
    fields: [schema.account.userId],
    references: [schema.user.id],
  }),
}));

export const twoFactorRelations = relations(schema.twoFactor, ({ one }) => ({
  user: one(schema.user, {
    fields: [schema.twoFactor.userId],
    references: [schema.user.id],
  }),
}));

// ===== TRUSTED DEVICE RELATIONS =====
export const trustedDeviceRelations = relations(schema.trustedDevicesTable, ({ one, many }) => ({
  user: one(schema.user, {
    fields: [schema.trustedDevicesTable.of],
    references: [schema.user.id],
  }),
  operatorsUsingThisDevice: many(schema.operatorsTable),
}));

// ===== OPERATOR RELATIONS =====
export const operatorRelations = relations(schema.operatorsTable, ({ one, many }) => ({
  createdByUser: one(schema.user, {
    fields: [schema.operatorsTable.createdBy],
    references: [schema.user.id],
  }),
  trustedDevice: one(schema.trustedDevicesTable, {
    fields: [schema.operatorsTable.trustedDeviceId],
    references: [schema.trustedDevicesTable.id],
  }),
  sessions: many(schema.operatorSessionsTable),
  saleOrders: many(schema.saleOrdersTable),
}));

export const operatorSessionRelations = relations(schema.operatorSessionsTable, ({ one }) => ({
  operator: one(schema.operatorsTable, {
    fields: [schema.operatorSessionsTable.operatorId],
    references: [schema.operatorsTable.id],
  }),
}));

// ===== PARTY RELATIONS =====
export const partyRelations = relations(schema.partiesTable, ({ many }) => ({
  godownsAsLandlord: many(schema.godownsTable),
  salesAsCustomer: many(schema.salesTable),
  purchasesAsSupplier: many(schema.purchasesTable),
  saleOrdersAsCustomer: many(schema.saleOrdersTable),
  purchaseOrdersAsSupplier: many(schema.purchaseOrdersTable),
  saleReturnsAsCustomer: many(schema.saleReturnsTable),
  purchaseReturnsAsSupplier: many(schema.purchaseReturnsTable),
  paymentsReceived: many(schema.paymentsTable),
  receiptsIssued: many(schema.receiptsTable),
}));

// ===== BANK & UPI RELATIONS =====
export const bankDetailRelations = relations(schema.bankDetailsTable, ({ many }) => ({
  upis: many(schema.upisTable),
  payments: many(schema.paymentsTable),
  receipts: many(schema.receiptsTable),
  deposits: many(schema.depositsTable),
  withdrawals: many(schema.withdrawalsTable),
  drawings: many(schema.drawingsTable),
}));

export const upiRelations = relations(schema.upisTable, ({ one }) => ({
  bankDetail: one(schema.bankDetailsTable, {
    fields: [schema.upisTable.bankDetailsId],
    references: [schema.bankDetailsTable.id],
  }),
}));

// ===== PRODUCT RELATIONS =====
export const categoryRelations = relations(schema.categoriesTable, ({ many }) => ({
  subCategories: many(schema.subCategoriesTable),
  products: many(schema.productsTable),
}));

export const subCategoryRelations = relations(schema.subCategoriesTable, ({ one, many }) => ({
  category: one(schema.categoriesTable, {
    fields: [schema.subCategoriesTable.categoryId],
    references: [schema.categoriesTable.id],
  }),
  products: many(schema.productsTable),
}));

export const subCategoryTypeRelations = relations(schema.subCategoryTypesTable, ({ many }) => ({
  products: many(schema.productsTable),
}));

export const productRelations = relations(schema.productsTable, ({ one, many }) => ({
  category: one(schema.categoriesTable, {
    fields: [schema.productsTable.categoryId],
    references: [schema.categoriesTable.id],
  }),
  subCategory: one(schema.subCategoriesTable, {
    fields: [schema.productsTable.subCategoryId],
    references: [schema.subCategoriesTable.id],
  }),
  subCategoryType: one(schema.subCategoryTypesTable, {
    fields: [schema.productsTable.subCategoryTypeId],
    references: [schema.subCategoryTypesTable.id],
  }),
  productGodowns: many(schema.productGodownsTable),
  saleProducts: many(schema.saleProductsTable),
  purchaseProducts: many(schema.purchaseProductsTable),
  saleReturnProducts: many(schema.saleReturnProductsTable),
  purchaseReturnProducts: many(schema.purchaseReturnProductsTable),
  drawingProducts: many(schema.drawingProductsTable),
  stockTakeProducts: many(schema.stockTakeProductsTable),
  saleOrderProducts: many(schema.saleOrderProductsTable),
  purchaseOrderProducts: many(schema.purchaseOrderProductsTable),
}));

// ===== GODOWN RELATIONS =====
export const godownRelations = relations(schema.godownsTable, ({ one, many }) => ({
  landlord: one(schema.partiesTable, {
    fields: [schema.godownsTable.landlordId],
    references: [schema.partiesTable.id],
  }),
  productGodowns: many(schema.productGodownsTable),
  stockTakeGodowns: many(schema.stockTakeGodownsTable),
}));

export const productGodownRelations = relations(schema.productGodownsTable, ({ one }) => ({
  godown: one(schema.godownsTable, {
    fields: [schema.productGodownsTable.godownId],
    references: [schema.godownsTable.id],
  }),
  product: one(schema.productsTable, {
    fields: [schema.productGodownsTable.productId],
    references: [schema.productsTable.id],
  }),
}));

export const stockTakeRelations = relations(schema.stockTakesTable, ({ one, many }) => ({
  takenByUser: one(schema.user, {
    fields: [schema.stockTakesTable.takenBy],
    references: [schema.user.id],
  }),
  stockTakeGodowns: many(schema.stockTakeGodownsTable),
  stockTakeProducts: many(schema.stockTakeProductsTable),
}));

export const stockTakeGodownRelations = relations(schema.stockTakeGodownsTable, ({ one }) => ({
  stockTake: one(schema.stockTakesTable, {
    fields: [schema.stockTakeGodownsTable.stockTakeId],
    references: [schema.stockTakesTable.id],
  }),
  godown: one(schema.godownsTable, {
    fields: [schema.stockTakeGodownsTable.godownId],
    references: [schema.godownsTable.id],
  }),
}));

export const stockTakeProductRelations = relations(schema.stockTakeProductsTable, ({ one }) => ({
  stockTake: one(schema.stockTakeGodownsTable, {
    fields: [schema.stockTakeProductsTable.stockTakeGodownId],
    references: [schema.stockTakeGodownsTable.id],
  }),
  product: one(schema.productsTable, {
    fields: [schema.stockTakeProductsTable.productId],
    references: [schema.productsTable.id],
  }),
}));

// ===== TRANSACTION RELATIONS =====
export const transactionRelations = relations(schema.transactionsTable, ({ one, many }) => ({
  createdByUser: one(schema.user, {
    fields: [schema.transactionsTable.createdBy],
    references: [schema.user.id],
  }),
  ledgers: many(schema.ledgersTable),
  sales: many(schema.salesTable),
  purchases: many(schema.purchasesTable),
  saleReturns: many(schema.saleReturnsTable),
  purchaseReturns: many(schema.purchaseReturnsTable),
  payments: many(schema.paymentsTable),
  receipts: many(schema.receiptsTable),
  deposits: many(schema.depositsTable),
  withdrawls: many(schema.withdrawalsTable),
  drawings: many(schema.drawingsTable),
  others: many(schema.othersTable),
}));

// ===== SALE RELATIONS =====
export const saleRelations = relations(schema.salesTable, ({ one, many }) => ({
  transaction: one(schema.transactionsTable, {
    fields: [schema.salesTable.transactionId],
    references: [schema.transactionsTable.id],
  }),
  customer: one(schema.partiesTable, {
    fields: [schema.salesTable.customerId],
    references: [schema.partiesTable.id],
  }),
  products: many(schema.saleProductsTable),
  creditDetails: many(schema.saleCreditDetailsTable),
}));

export const saleProductRelations = relations(schema.saleProductsTable, ({ one }) => ({
  sale: one(schema.salesTable, {
    fields: [schema.saleProductsTable.saleId],
    references: [schema.salesTable.id],
  }),
  product: one(schema.productGodownsTable, {
    fields: [schema.saleProductsTable.productGodownId],
    references: [schema.productGodownsTable.id],
  }),
}));

export const saleCreditDetailRelations = relations(schema.saleCreditDetailsTable, ({ one }) => ({
  sale: one(schema.salesTable, {
    fields: [schema.saleCreditDetailsTable.saleId],
    references: [schema.salesTable.id],
  }),
}));

// ===== PURCHASE RELATIONS =====
export const purchaseRelations = relations(schema.purchasesTable, ({ one, many }) => ({
  transaction: one(schema.transactionsTable, {
    fields: [schema.purchasesTable.transactionId],
    references: [schema.transactionsTable.id],
  }),
  supplier: one(schema.partiesTable, {
    fields: [schema.purchasesTable.supplierId],
    references: [schema.partiesTable.id],
  }),
  products: many(schema.purchaseProductsTable),
  creditDetails: many(schema.purchaseCreditDetailsTable),
}));

export const purchaseProductRelations = relations(schema.purchaseProductsTable, ({ one }) => ({
  purchase: one(schema.purchasesTable, {
    fields: [schema.purchaseProductsTable.purchaseId],
    references: [schema.purchasesTable.id],
  }),
  product: one(schema.productGodownsTable, {
    fields: [schema.purchaseProductsTable.productGodownId],
    references: [schema.productGodownsTable.id],
  }),
}));

export const purchaseCreditDetailRelations = relations(
  schema.purchaseCreditDetailsTable,
  ({ one }) => ({
    purchase: one(schema.purchasesTable, {
      fields: [schema.purchaseCreditDetailsTable.purchaseId],
      references: [schema.purchasesTable.id],
    }),
  }),
);

// ===== SALE RETURN RELATIONS =====
export const saleReturnRelations = relations(schema.saleReturnsTable, ({ one, many }) => ({
  transaction: one(schema.transactionsTable, {
    fields: [schema.saleReturnsTable.transactionId],
    references: [schema.transactionsTable.id],
  }),
  products: many(schema.saleReturnProductsTable),
}));

export const saleReturnProductRelations = relations(schema.saleReturnProductsTable, ({ one }) => ({
  saleReturn: one(schema.saleReturnsTable, {
    fields: [schema.saleReturnProductsTable.saleReturnId],
    references: [schema.saleReturnsTable.id],
  }),
  product: one(schema.productGodownsTable, {
    fields: [schema.saleReturnProductsTable.productGodownId],
    references: [schema.productGodownsTable.id],
  }),
}));

// ===== PURCHASE RETURN RELATIONS =====
export const purchaseReturnRelations = relations(schema.purchaseReturnsTable, ({ one, many }) => ({
  transaction: one(schema.transactionsTable, {
    fields: [schema.purchaseReturnsTable.transactionId],
    references: [schema.transactionsTable.id],
  }),
  products: many(schema.purchaseReturnProductsTable),
}));

export const purchaseReturnProductRelations = relations(
  schema.purchaseReturnProductsTable,
  ({ one }) => ({
    purchaseReturn: one(schema.purchaseReturnsTable, {
      fields: [schema.purchaseReturnProductsTable.purchaseReturnId],
      references: [schema.purchaseReturnsTable.id],
    }),
    product: one(schema.productGodownsTable, {
      fields: [schema.purchaseReturnProductsTable.productGodownId],
      references: [schema.productGodownsTable.id],
    }),
  }),
);

// ===== PAYMENT & RECEIPT RELATIONS =====
export const paymentRelations = relations(schema.paymentsTable, ({ one }) => ({
  transaction: one(schema.transactionsTable, {
    fields: [schema.paymentsTable.transactionId],
    references: [schema.transactionsTable.id],
  }),
  party: one(schema.partiesTable, {
    fields: [schema.paymentsTable.partyId],
    references: [schema.partiesTable.id],
  }),
  bankDetail: one(schema.bankDetailsTable, {
    fields: [schema.paymentsTable.bankDetailsId],
    references: [schema.bankDetailsTable.id],
  }),
}));

export const receiptRelations = relations(schema.receiptsTable, ({ one }) => ({
  transaction: one(schema.transactionsTable, {
    fields: [schema.receiptsTable.transactionId],
    references: [schema.transactionsTable.id],
  }),
  party: one(schema.partiesTable, {
    fields: [schema.receiptsTable.partyId],
    references: [schema.partiesTable.id],
  }),
  bankDetail: one(schema.bankDetailsTable, {
    fields: [schema.receiptsTable.bankDetailsId],
    references: [schema.bankDetailsTable.id],
  }),
}));

// ===== DEPOSIT & WITHDRAWL RELATIONS =====
export const depositRelations = relations(schema.depositsTable, ({ one }) => ({
  transaction: one(schema.transactionsTable, {
    fields: [schema.depositsTable.transactionId],
    references: [schema.transactionsTable.id],
  }),
  bankDetail: one(schema.bankDetailsTable, {
    fields: [schema.depositsTable.bankDetailsId],
    references: [schema.bankDetailsTable.id],
  }),
}));

export const withdrawlRelations = relations(schema.withdrawalsTable, ({ one }) => ({
  transaction: one(schema.transactionsTable, {
    fields: [schema.withdrawalsTable.transactionId],
    references: [schema.transactionsTable.id],
  }),
  bankDetail: one(schema.bankDetailsTable, {
    fields: [schema.withdrawalsTable.bankDetailsId],
    references: [schema.bankDetailsTable.id],
  }),
}));

// ===== DRAWING RELATIONS =====
export const drawingRelations = relations(schema.drawingsTable, ({ one, many }) => ({
  transaction: one(schema.transactionsTable, {
    fields: [schema.drawingsTable.transactionId],
    references: [schema.transactionsTable.id],
  }),
  bankDetail: one(schema.bankDetailsTable, {
    fields: [schema.drawingsTable.bankDetailsId],
    references: [schema.bankDetailsTable.id],
  }),
  products: many(schema.drawingProductsTable),
}));

export const drawingProductRelations = relations(schema.drawingProductsTable, ({ one }) => ({
  drawing: one(schema.drawingsTable, {
    fields: [schema.drawingProductsTable.drawingId],
    references: [schema.drawingsTable.id],
  }),
  product: one(schema.productGodownsTable, {
    fields: [schema.drawingProductsTable.productGodownId],
    references: [schema.productGodownsTable.id],
  }),
}));

// ===== OTHER RELATIONS =====
export const otherRelations = relations(schema.othersTable, ({ one }) => ({
  transaction: one(schema.transactionsTable, {
    fields: [schema.othersTable.transactionId],
    references: [schema.transactionsTable.id],
  }),
}));

// ===== ORDER RELATIONS =====
export const saleOrderRelations = relations(schema.saleOrdersTable, ({ one, many }) => ({
  customer: one(schema.partiesTable, {
    fields: [schema.saleOrdersTable.customerId],
    references: [schema.partiesTable.id],
  }),
  takenByUser: one(schema.user, {
    fields: [schema.saleOrdersTable.orderedBy],
    references: [schema.user.id],
  }),
  operator: one(schema.operatorsTable, {
    fields: [schema.saleOrdersTable.operatorId],
    references: [schema.operatorsTable.id],
  }),
  products: many(schema.saleOrderProductsTable),
}));

export const saleOrderProductRelations = relations(schema.saleOrderProductsTable, ({ one }) => ({
  saleOrder: one(schema.saleOrdersTable, {
    fields: [schema.saleOrderProductsTable.saleOrderId],
    references: [schema.saleOrdersTable.id],
  }),
  product: one(schema.productsTable, {
    fields: [schema.saleOrderProductsTable.productId],
    references: [schema.productsTable.id],
  }),
}));

export const purchaseOrderRelations = relations(schema.purchaseOrdersTable, ({ one, many }) => ({
  supplier: one(schema.partiesTable, {
    fields: [schema.purchaseOrdersTable.supplierId],
    references: [schema.partiesTable.id],
  }),
  takenByUser: one(schema.user, {
    fields: [schema.purchaseOrdersTable.orderedBy],
    references: [schema.user.id],
  }),
  products: many(schema.purchaseOrderProductsTable),
}));

export const purchaseOrderProductRelations = relations(
  schema.purchaseOrderProductsTable,
  ({ one }) => ({
    purchaseOrder: one(schema.purchaseOrdersTable, {
      fields: [schema.purchaseOrderProductsTable.purchaseOrderId],
      references: [schema.purchaseOrdersTable.id],
    }),
    product: one(schema.productsTable, {
      fields: [schema.purchaseOrderProductsTable.productId],
      references: [schema.productsTable.id],
    }),
  }),
);

// ===== ACCOUNTING RELATIONS =====
export const ledgerGroupRelations = relations(schema.ledgerGroupsTable, ({ many }) => ({
  ledgerMasters: many(schema.ledgerMastersTable),
}));

export const ledgerMasterRelations = relations(schema.ledgerMastersTable, ({ one, many }) => ({
  ledgerGroup: one(schema.ledgerGroupsTable, {
    fields: [schema.ledgerMastersTable.ledgerGroupId],
    references: [schema.ledgerGroupsTable.id],
  }),
  ledgers: many(schema.ledgersTable),
}));

export const ledgerRelations = relations(schema.ledgersTable, ({ one }) => ({
  transaction: one(schema.transactionsTable, {
    fields: [schema.ledgersTable.transactionId],
    references: [schema.transactionsTable.id],
  }),
  ledgerMaster: one(schema.ledgerMastersTable, {
    fields: [schema.ledgersTable.ledgerMasterId],
    references: [schema.ledgerMastersTable.id],
  }),
}));
