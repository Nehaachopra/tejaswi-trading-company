import Image from "next/image";
import Link from "next/link";
import { getTranslations } from "next-intl/server";

import { LanguageMenu } from "./language-menu";
import type { Role } from "./nav-items";
import { ProfileMenu } from "./profile-menu";

// ivory, chestnut ink: logo on the left (it goes Home); language toggle and profile on the right
export async function SiteHeader({ name, role }: { name: string; role: Role }) {
  const t = await getTranslations("shell");

  return (
    <header className="on-ivory sticky top-0 z-30 border-b border-chestnut/15 bg-ivory text-chestnut">
      <div className="flex h-16 items-center justify-between gap-3 px-4 sm:px-6">
        {/* the logo: it goes Home */}
        <Link href="/" aria-label={t("home")} className="rounded-control">
          <Image src="/logo-transparent.png" alt="Tejaswi Trading Company" width={1200} height={400} priority className="h-10 w-auto" />
        </Link>

        <div className="flex items-center gap-2">
          <LanguageMenu />
          <ProfileMenu name={name} role={role} />
        </div>
      </div>
    </header>
  );
}
