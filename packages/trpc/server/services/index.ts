import { JobsService, QueuedOtpSender } from "@repo/jobs";
import AccountsService from "@repo/services/accounts";
import AuthService from "@repo/services/auth";
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
