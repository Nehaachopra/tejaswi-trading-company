import type { Metadata } from "next";

import { LandlordsManager } from "~/components/entities/landlords-manager";

export const metadata: Metadata = { title: "Landlords · Tejaswi trading company" };

// landlords are added and edited here, and nowhere else; the layout already checked for an admin session
export default function LandlordsPage() {
  return <LandlordsManager />;
}
