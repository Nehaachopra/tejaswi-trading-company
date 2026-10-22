import { JobsService, QueuedOtpSender } from "@repo/jobs";
import AuthService from "@repo/services/auth";
import CategoryService from "@repo/services/category";
import ProductService from "@repo/services/product";

export const authService = new AuthService(new QueuedOtpSender());

export const categoryService = new CategoryService();

export const productService = new ProductService();

export const jobsService = new JobsService();
