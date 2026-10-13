import { relations } from "drizzle-orm";
import * as schema from "./schema";

// This file intentionally follows declared foreign keys only. Tables without a
// foreign key (for example `parties`, `bank_details`, and `verification`) do
// not need a relation declaration of their own.

export const userRelations2 = relations(schema.user, ({ many }) => ({
  sessions: many(schema.session),
  accounts: many(schema.account),
  twoFactors: many(schema.twoFactor),
  trustedDevices: many(schema.trustedDevicesTable),
  operatorsCreated: many(schema.operatorsTable),
  stockTakes: many(schema.stockTakesTable),
  transactions: many(schema.transactionsTable),
  saleOrders: many(schema.saleOrdersTable),
  purchaseOrders: many(schema.purchaseOrdersTable),
  emailLogs: many(schema.emailLogsTable),
  authRateLimits: many(schema.authRatelimitsTable),
}));

export const sessionRelations2 = relations(schema.session, ({ one }) => ({
  user: one(schema.user, { fields: [schema.session.userId], references: [schema.user.id] }),
}));
export const accountRelations2 = relations(schema.account, ({ one }) => ({
  user: one(schema.user, { fields: [schema.account.userId], references: [schema.user.id] }),
}));
export const twoFactorRelations2 = relations(schema.twoFactor, ({ one }) => ({
  user: one(schema.user, { fields: [schema.twoFactor.userId], references: [schema.user.id] }),
}));
export const trustedDeviceRelations2 = relations(schema.trustedDevicesTable, ({ one, many }) => ({
  user: one(schema.user, { fields: [schema.trustedDevicesTable.of], references: [schema.user.id] }),
  operators: many(schema.operatorsTable),
}));
export const operatorRelations2 = relations(schema.operatorsTable, ({ one, many }) => ({
  trustedDevice: one(schema.trustedDevicesTable, { fields: [schema.operatorsTable.trustedDeviceId], references: [schema.trustedDevicesTable.id] }),
  createdByUser: one(schema.user, { fields: [schema.operatorsTable.createdBy], references: [schema.user.id] }),
  sessions: many(schema.operatorSessionsTable),
  saleOrders: many(schema.saleOrdersTable),
}));
export const operatorSessionRelations2 = relations(schema.operatorSessionsTable, ({ one }) => ({
  operator: one(schema.operatorsTable, { fields: [schema.operatorSessionsTable.operatorId], references: [schema.operatorsTable.id] }),
}));
export const emailLogRelations2 = relations(schema.emailLogsTable, ({ one }) => ({
  user: one(schema.user, { fields: [schema.emailLogsTable.userId], references: [schema.user.id] }),
}));
export const authRateLimitRelations2 = relations(schema.authRatelimitsTable, ({ one }) => ({
  user: one(schema.user, { fields: [schema.authRatelimitsTable.userId], references: [schema.user.id] }),
}));

export const bankDetailRelations2 = relations(schema.bankDetailsTable, ({ many }) => ({
  upis: many(schema.upisTable), payments: many(schema.paymentsTable), receipts: many(schema.receiptsTable),
  deposits: many(schema.depositsTable), withdrawals: many(schema.withdrawalsTable), drawings: many(schema.drawingsTable),
}));
export const upiRelations2 = relations(schema.upisTable, ({ one }) => ({
  bankDetail: one(schema.bankDetailsTable, { fields: [schema.upisTable.bankDetailsId], references: [schema.bankDetailsTable.id] }),
}));

export const categoryRelations2 = relations(schema.categoriesTable, ({ many }) => ({
  subCategories: many(schema.subCategoriesTable), products: many(schema.productsTable),
}));
export const subCategoryRelations2 = relations(schema.subCategoriesTable, ({ one, many }) => ({
  category: one(schema.categoriesTable, { fields: [schema.subCategoriesTable.categoryId], references: [schema.categoriesTable.id] }),
  subCategoryTypes: many(schema.subCategoryTypesTable), products: many(schema.productsTable),
}));
export const subCategoryTypeRelations2 = relations(schema.subCategoryTypesTable, ({ one, many }) => ({
  subCategory: one(schema.subCategoriesTable, { fields: [schema.subCategoryTypesTable.subCategoryId], references: [schema.subCategoriesTable.id] }),
  products: many(schema.productsTable),
}));
export const productRelations2 = relations(schema.productsTable, ({ one, many }) => ({
  category: one(schema.categoriesTable, { fields: [schema.productsTable.categoryId], references: [schema.categoriesTable.id] }),
  subCategory: one(schema.subCategoriesTable, { fields: [schema.productsTable.subCategoryId], references: [schema.subCategoriesTable.id] }),
  subCategoryType: one(schema.subCategoryTypesTable, { fields: [schema.productsTable.subCategoryTypeId], references: [schema.subCategoryTypesTable.id] }),
  prices: many(schema.productPricesTable), productGodowns: many(schema.productGodownsTable),
  saleOrderProducts: many(schema.saleOrderProductsTable), purchaseOrderProducts: many(schema.purchaseOrderProductsTable),
}));
export const productPriceRelations2 = relations(schema.productPricesTable, ({ one }) => ({
  product: one(schema.productsTable, { fields: [schema.productPricesTable.productId], references: [schema.productsTable.id] }),
}));

export const partyRelations2 = relations(schema.partiesTable, ({ many }) => ({
  godownsAsLandlord: many(schema.godownsTable), salesAsCustomer: many(schema.salesTable),
  purchasesAsSupplier: many(schema.purchasesTable), saleOrders: many(schema.saleOrdersTable),
  purchaseOrders: many(schema.purchaseOrdersTable), payments: many(schema.paymentsTable),
  receipts: many(schema.receiptsTable), notReportedSales: many(schema.notReportedSalesTable),
}));
export const godownRelations2 = relations(schema.godownsTable, ({ one, many }) => ({
  landlord: one(schema.partiesTable, { fields: [schema.godownsTable.landlordId], references: [schema.partiesTable.id] }),
  productGodowns: many(schema.productGodownsTable), stockTakeGodowns: many(schema.stockTakeGodownsTable),
}));
export const productGodownRelations2 = relations(schema.productGodownsTable, ({ one, many }) => ({
  godown: one(schema.godownsTable, { fields: [schema.productGodownsTable.godownId], references: [schema.godownsTable.id] }),
  product: one(schema.productsTable, { fields: [schema.productGodownsTable.productId], references: [schema.productsTable.id] }),
  saleProducts: many(schema.saleProductsTable), purchaseProducts: many(schema.purchaseProductsTable),
  saleReturnProducts: many(schema.saleReturnProductsTable), purchaseReturnProducts: many(schema.purchaseReturnProductsTable),
  drawingProducts: many(schema.drawingProductsTable), notReportedSaleProducts: many(schema.notReportedSaleProductsTable),
}));
export const stockTakeRelations2 = relations(schema.stockTakesTable, ({ one, many }) => ({
  takenByUser: one(schema.user, { fields: [schema.stockTakesTable.takenBy], references: [schema.user.id] }),
  godowns: many(schema.stockTakeGodownsTable), products: many(schema.stockTakeProductsTable),
}));
export const stockTakeGodownRelations2 = relations(schema.stockTakeGodownsTable, ({ one, many }) => ({
  stockTake: one(schema.stockTakesTable, { fields: [schema.stockTakeGodownsTable.stockTakeId], references: [schema.stockTakesTable.id] }),
  godown: one(schema.godownsTable, { fields: [schema.stockTakeGodownsTable.godownId], references: [schema.godownsTable.id] }),
  products: many(schema.stockTakeProductsTable),
}));
export const stockTakeProductRelations2 = relations(schema.stockTakeProductsTable, ({ one }) => ({
  stockTakeGodown: one(schema.stockTakeGodownsTable, { fields: [schema.stockTakeProductsTable.stockTakeGodownId], references: [schema.stockTakeGodownsTable.id] }),
  product: one(schema.productsTable, { fields: [schema.stockTakeProductsTable.productId], references: [schema.productsTable.id] }),
}));

export const transactionRelations2 = relations(schema.transactionsTable, ({ one, many }) => ({
  createdByUser: one(schema.user, { fields: [schema.transactionsTable.createdBy], references: [schema.user.id] }),
  ledgers: many(schema.ledgersTable), sales: many(schema.salesTable), purchases: many(schema.purchasesTable),
  saleReturns: many(schema.saleReturnsTable), purchaseReturns: many(schema.purchaseReturnsTable),
  payments: many(schema.paymentsTable), receipts: many(schema.receiptsTable), deposits: many(schema.depositsTable),
  withdrawals: many(schema.withdrawalsTable), drawings: many(schema.drawingsTable), others: many(schema.othersTable),
  notReportedSales: many(schema.notReportedSalesTable),
}));
export const saleRelations2 = relations(schema.salesTable, ({ one, many }) => ({
  transaction: one(schema.transactionsTable, { fields: [schema.salesTable.transactionId], references: [schema.transactionsTable.id] }),
  customer: one(schema.partiesTable, { fields: [schema.salesTable.customerId], references: [schema.partiesTable.id] }),
  products: many(schema.saleProductsTable), creditDetails: many(schema.saleCreditDetailsTable), returns: many(schema.saleReturnsTable),
}));
export const saleProductRelations2 = relations(schema.saleProductsTable, ({ one, many }) => ({
  sale: one(schema.salesTable, { fields: [schema.saleProductsTable.saleId], references: [schema.salesTable.id] }),
  productGodown: one(schema.productGodownsTable, { fields: [schema.saleProductsTable.productGodownId], references: [schema.productGodownsTable.id] }),
  returnProducts: many(schema.saleReturnProductsTable),
}));
export const saleCreditDetailRelations2 = relations(schema.saleCreditDetailsTable, ({ one }) => ({
  sale: one(schema.salesTable, { fields: [schema.saleCreditDetailsTable.saleId], references: [schema.salesTable.id] }),
}));
export const saleReturnRelations2 = relations(schema.saleReturnsTable, ({ one, many }) => ({
  transaction: one(schema.transactionsTable, { fields: [schema.saleReturnsTable.transactionId], references: [schema.transactionsTable.id] }),
  sale: one(schema.salesTable, { fields: [schema.saleReturnsTable.saleId], references: [schema.salesTable.id] }), products: many(schema.saleReturnProductsTable),
}));
export const saleReturnProductRelations2 = relations(schema.saleReturnProductsTable, ({ one }) => ({
  saleReturn: one(schema.saleReturnsTable, { fields: [schema.saleReturnProductsTable.saleReturnId], references: [schema.saleReturnsTable.id] }),
  saleProduct: one(schema.saleProductsTable, { fields: [schema.saleReturnProductsTable.saleProductId], references: [schema.saleProductsTable.id] }),
  productGodown: one(schema.productGodownsTable, { fields: [schema.saleReturnProductsTable.productGodownId], references: [schema.productGodownsTable.id] }),
}));

export const purchaseRelations2 = relations(schema.purchasesTable, ({ one, many }) => ({
  transaction: one(schema.transactionsTable, { fields: [schema.purchasesTable.transactionId], references: [schema.transactionsTable.id] }),
  supplier: one(schema.partiesTable, { fields: [schema.purchasesTable.supplierId], references: [schema.partiesTable.id] }),
  products: many(schema.purchaseProductsTable), creditDetails: many(schema.purchaseCreditDetailsTable), returns: many(schema.purchaseReturnsTable),
}));
export const purchaseProductRelations2 = relations(schema.purchaseProductsTable, ({ one, many }) => ({
  purchase: one(schema.purchasesTable, { fields: [schema.purchaseProductsTable.purchaseId], references: [schema.purchasesTable.id] }),
  productGodown: one(schema.productGodownsTable, { fields: [schema.purchaseProductsTable.productGodownId], references: [schema.productGodownsTable.id] }),
  returnProducts: many(schema.purchaseReturnProductsTable),
}));
export const purchaseCreditDetailRelations2 = relations(schema.purchaseCreditDetailsTable, ({ one }) => ({
  purchase: one(schema.purchasesTable, { fields: [schema.purchaseCreditDetailsTable.purchaseId], references: [schema.purchasesTable.id] }),
}));
export const purchaseReturnRelations2 = relations(schema.purchaseReturnsTable, ({ one, many }) => ({
  transaction: one(schema.transactionsTable, { fields: [schema.purchaseReturnsTable.transactionId], references: [schema.transactionsTable.id] }),
  purchase: one(schema.purchasesTable, { fields: [schema.purchaseReturnsTable.purchaseId], references: [schema.purchasesTable.id] }), products: many(schema.purchaseReturnProductsTable),
}));
export const purchaseReturnProductRelations2 = relations(schema.purchaseReturnProductsTable, ({ one }) => ({
  purchaseReturn: one(schema.purchaseReturnsTable, { fields: [schema.purchaseReturnProductsTable.purchaseReturnId], references: [schema.purchaseReturnsTable.id] }),
  purchaseProduct: one(schema.purchaseProductsTable, { fields: [schema.purchaseReturnProductsTable.purchaseProductId], references: [schema.purchaseProductsTable.id] }),
  productGodown: one(schema.productGodownsTable, { fields: [schema.purchaseReturnProductsTable.productGodownId], references: [schema.productGodownsTable.id] }),
}));

export const paymentRelations2 = relations(schema.paymentsTable, ({ one }) => ({
  transaction: one(schema.transactionsTable, { fields: [schema.paymentsTable.transactionId], references: [schema.transactionsTable.id] }),
  party: one(schema.partiesTable, { fields: [schema.paymentsTable.partyId], references: [schema.partiesTable.id] }),
  bankDetail: one(schema.bankDetailsTable, { fields: [schema.paymentsTable.bankDetailsId], references: [schema.bankDetailsTable.id] }),
}));
export const receiptRelations2 = relations(schema.receiptsTable, ({ one }) => ({
  transaction: one(schema.transactionsTable, { fields: [schema.receiptsTable.transactionId], references: [schema.transactionsTable.id] }),
  party: one(schema.partiesTable, { fields: [schema.receiptsTable.partyId], references: [schema.partiesTable.id] }),
  bankDetail: one(schema.bankDetailsTable, { fields: [schema.receiptsTable.bankDetailsId], references: [schema.bankDetailsTable.id] }),
}));
export const depositRelations2 = relations(schema.depositsTable, ({ one }) => ({
  transaction: one(schema.transactionsTable, { fields: [schema.depositsTable.transactionId], references: [schema.transactionsTable.id] }),
  bankDetail: one(schema.bankDetailsTable, { fields: [schema.depositsTable.bankDetailsId], references: [schema.bankDetailsTable.id] }),
}));
export const withdrawalRelations2 = relations(schema.withdrawalsTable, ({ one }) => ({
  transaction: one(schema.transactionsTable, { fields: [schema.withdrawalsTable.transactionId], references: [schema.transactionsTable.id] }),
  bankDetail: one(schema.bankDetailsTable, { fields: [schema.withdrawalsTable.bankDetailsId], references: [schema.bankDetailsTable.id] }),
}));
export const drawingRelations2 = relations(schema.drawingsTable, ({ one, many }) => ({
  transaction: one(schema.transactionsTable, { fields: [schema.drawingsTable.transactionId], references: [schema.transactionsTable.id] }),
  bankDetail: one(schema.bankDetailsTable, { fields: [schema.drawingsTable.bankDetailsId], references: [schema.bankDetailsTable.id] }), products: many(schema.drawingProductsTable),
}));
export const drawingProductRelations2 = relations(schema.drawingProductsTable, ({ one }) => ({
  drawing: one(schema.drawingsTable, { fields: [schema.drawingProductsTable.drawingId], references: [schema.drawingsTable.id] }),
  productGodown: one(schema.productGodownsTable, { fields: [schema.drawingProductsTable.productGodownId], references: [schema.productGodownsTable.id] }),
}));
export const otherRelations2 = relations(schema.othersTable, ({ one }) => ({
  transaction: one(schema.transactionsTable, { fields: [schema.othersTable.transactionId], references: [schema.transactionsTable.id] }),
}));

export const notReportedSaleRelations2 = relations(schema.notReportedSalesTable, ({ one, many }) => ({
  transaction: one(schema.transactionsTable, { fields: [schema.notReportedSalesTable.transactionId], references: [schema.transactionsTable.id] }),
  customer: one(schema.partiesTable, { fields: [schema.notReportedSalesTable.customerId], references: [schema.partiesTable.id] }),
  products: many(schema.notReportedSaleProductsTable), creditDetails: many(schema.notReportedSaleCreditDetailsTable),
}));
export const notReportedSaleProductRelations2 = relations(schema.notReportedSaleProductsTable, ({ one }) => ({
  sale: one(schema.notReportedSalesTable, { fields: [schema.notReportedSaleProductsTable.saleId], references: [schema.notReportedSalesTable.id] }),
  productGodown: one(schema.productGodownsTable, { fields: [schema.notReportedSaleProductsTable.productGodownId], references: [schema.productGodownsTable.id] }),
}));
export const notReportedSaleCreditDetailRelations2 = relations(schema.notReportedSaleCreditDetailsTable, ({ one }) => ({
  sale: one(schema.notReportedSalesTable, { fields: [schema.notReportedSaleCreditDetailsTable.saleId], references: [schema.notReportedSalesTable.id] }),
}));

export const saleOrderRelations2 = relations(schema.saleOrdersTable, ({ one, many }) => ({
  customer: one(schema.partiesTable, { fields: [schema.saleOrdersTable.customerId], references: [schema.partiesTable.id] }),
  orderedByUser: one(schema.user, { fields: [schema.saleOrdersTable.orderedBy], references: [schema.user.id] }),
  operator: one(schema.operatorsTable, { fields: [schema.saleOrdersTable.operatorId], references: [schema.operatorsTable.id] }), products: many(schema.saleOrderProductsTable),
}));
export const saleOrderProductRelations2 = relations(schema.saleOrderProductsTable, ({ one }) => ({
  saleOrder: one(schema.saleOrdersTable, { fields: [schema.saleOrderProductsTable.saleOrderId], references: [schema.saleOrdersTable.id] }),
  product: one(schema.productsTable, { fields: [schema.saleOrderProductsTable.productId], references: [schema.productsTable.id] }),
}));
export const purchaseOrderRelations2 = relations(schema.purchaseOrdersTable, ({ one, many }) => ({
  supplier: one(schema.partiesTable, { fields: [schema.purchaseOrdersTable.supplierId], references: [schema.partiesTable.id] }),
  orderedByUser: one(schema.user, { fields: [schema.purchaseOrdersTable.orderedBy], references: [schema.user.id] }), products: many(schema.purchaseOrderProductsTable),
}));
export const purchaseOrderProductRelations2 = relations(schema.purchaseOrderProductsTable, ({ one }) => ({
  purchaseOrder: one(schema.purchaseOrdersTable, { fields: [schema.purchaseOrderProductsTable.purchaseOrderId], references: [schema.purchaseOrdersTable.id] }),
  product: one(schema.productsTable, { fields: [schema.purchaseOrderProductsTable.productId], references: [schema.productsTable.id] }),
}));

export const ledgerGroupRelations2 = relations(schema.ledgerGroupsTable, ({ many }) => ({ ledgerMasters: many(schema.ledgerMastersTable) }));
export const ledgerMasterRelations2 = relations(schema.ledgerMastersTable, ({ one, many }) => ({
  ledgerGroup: one(schema.ledgerGroupsTable, { fields: [schema.ledgerMastersTable.ledgerGroupId], references: [schema.ledgerGroupsTable.id] }), ledgers: many(schema.ledgersTable),
}));
export const ledgerRelations2 = relations(schema.ledgersTable, ({ one }) => ({
  transaction: one(schema.transactionsTable, { fields: [schema.ledgersTable.transactionId], references: [schema.transactionsTable.id] }),
  ledgerMaster: one(schema.ledgerMastersTable, { fields: [schema.ledgersTable.ledgerMasterId], references: [schema.ledgerMastersTable.id] }),
}));
