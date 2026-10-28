import { z } from "zod";

// a loan's terms, given with the receipt that brings it in: loans only carry interest, its rate (% a year, 0 =
// interest-free) and how often it's paid
export const loanTermsInputModel = z.object({
  interestRate: z.number().min(0).max(100).multipleOf(0.01),
  frequency: z.enum(["monthly", "quarterly", "half_yearly", "yearly"]),
});

export type LoanTermsInputModel = z.infer<typeof loanTermsInputModel>;
