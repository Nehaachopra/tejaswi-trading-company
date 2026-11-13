import { JobsService, QueuedOtpSender } from "@repo/jobs";
import AccountsService from "@repo/services/accounts";
import AuthService from "@repo/services/auth";
import BankService from "@repo/services/bank";
import ContraService from "@repo/services/contra";
import DocumentService from "@repo/services/document";
import DueService from "@repo/services/due";
import LandlordService from "@repo/services/landlord";
import LenderService from "@repo/services/lender";
import OtherService from "@repo/services/other";
import PartyService from "@repo/services/party";
import PaymentService from "@repo/services/payment";
import ReceiptService from "@repo/services/receipt";
import SalaryService from "@repo/services/salary";
import TransactionService from "@repo/services/transaction";
import CategoryService from "@repo/services/category";
import GodownService from "@repo/services/godown";
import ProductService from "@repo/services/product";
import PurchaseOrderService from "@repo/services/purchase-order";
import SaleOrderService from "@repo/services/sale-order";
import StockService from "@repo/services/stock";
import SettingService from "@repo/services/setting";

export const authService = new AuthService(new QueuedOtpSender());

export const categoryService = new CategoryService();

export const productService = new ProductService();

export const purchaseOrderService = new PurchaseOrderService();

export const saleOrderService = new SaleOrderService();

export const godownService = new GodownService();

export const stockService = new StockService();

export const jobsService = new JobsService();

export const accountsService = new AccountsService();

export const bankService = new BankService(accountsService);

export const partyService = new PartyService(accountsService);

export const landlordService = new LandlordService();
export const lenderService = new LenderService();

export const transactionService = new TransactionService();

export const receiptService = new ReceiptService(accountsService, transactionService, partyService);

export const paymentService = new PaymentService(accountsService, transactionService, partyService);

export const contraService = new ContraService(accountsService, transactionService);

export const otherService = new OtherService(accountsService, transactionService);

export const salaryService = new SalaryService(accountsService, transactionService);

export const documentService = new DocumentService(paymentService);

export const dueService = new DueService(accountsService, transactionService, partyService);

export const settingService = new SettingService();
