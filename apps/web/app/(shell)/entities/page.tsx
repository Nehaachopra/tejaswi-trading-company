import { redirect } from "next/navigation";

// Entities opens on Parties; each entity has its own page
export default function EntitiesPage() {
  redirect("/entities/parties");
}
