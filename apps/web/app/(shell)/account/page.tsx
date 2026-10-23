import { redirect } from "next/navigation";

// Accounts opens on its first head, Asset; each head has its own page
export default function AccountPage() {
  redirect("/account/asset");
}
