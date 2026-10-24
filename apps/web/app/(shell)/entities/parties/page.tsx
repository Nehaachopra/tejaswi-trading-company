import type { Metadata } from "next";

import { PartiesManager } from "~/components/entities/parties-manager";

export const metadata: Metadata = { title: "Parties · Tejaswi trading company" };

// customers and suppliers are added and edited here; the layout already checked for an admin session
export default function PartiesPage() {
  return <PartiesManager />;
}
