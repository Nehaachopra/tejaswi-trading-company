import { redirect } from "next/navigation";

// a salary's success page moved under Payment; this old address goes there (with any others saved with it)
export default async function OldSalaryDonePage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  const { id } = await params;
  const q = await searchParams;
  redirect(`/transaction/payment/salary/${id}${q.also ? `?also=${q.also}` : ""}`);
}
