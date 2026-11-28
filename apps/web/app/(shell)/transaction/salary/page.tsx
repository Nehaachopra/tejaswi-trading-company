import { redirect } from "next/navigation";

// salary is paid from Payment (Paid for: Salary or Advance to employee), on the payment page itself; this old address
// goes there
export default function SalaryPage() {
  redirect("/transaction/payment");
}
