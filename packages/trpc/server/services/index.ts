import { JobsService, QueuedOtpSender } from "@repo/jobs";
import AccountsService from "@repo/services/accounts";
import AuthService from "@repo/services/auth";
import BankService from "@repo/services/bank";
import DueService from "@repo/services/due";
import PartyService from "@repo/services/party";
import PaymentService from "@repo/services/payment";
import ReceiptService from "@repo/services/receipt";
import TransactionService from "@repo/services/transaction";
import CategoryService from "@repo/services/category";
import GodownService from "@repo/services/godown";
import ProductService from "@repo/services/product";
import StockService from "@repo/services/stock";

export const authService = new AuthService(new QueuedOtpSender());

export const categoryService = new CategoryService();

export const productService = new ProductService();

export const godownService = new GodownService();

export const stockService = new StockService();

export const jobsService = new JobsService();

export const accountsService = new AccountsService();

export const bankService = new BankService(accountsService);

export const partyService = new PartyService(accountsService);

export const transactionService = new TransactionService();

export const receiptService = new ReceiptService(accountsService, transactionService, partyService);

export const paymentService = new PaymentService(accountsService, transactionService, partyService);

export const dueService = new DueService(accountsService, transactionService, partyService);
