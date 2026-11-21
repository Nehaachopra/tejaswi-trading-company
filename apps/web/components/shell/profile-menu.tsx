"use client";

import { LogOut } from "lucide-react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";

import { Menu, MenuItem } from "~/components/ui/menu";
import { Spinner } from "~/components/ui/icons/spinner";
import { toast } from "~/components/ui/toast";
import { useLogout } from "~/providers/session";

import type { Role } from "./nav-items";

// "Neha Chopra" → "NC"
const initials = (name: string) =>
  name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]!.toUpperCase())
    .join("");

// who is signed in, and Log out
export function ProfileMenu({ name, role }: { name: string; role: Role }) {
  const t = useTranslations("shell");
  const router = useRouter();
  const logout = useLogout({
    onSuccess: () => {
      router.replace("/login");
      router.refresh();
    },
    onError: () => toast.error(t("logoutFailed")),
  });

  return (
    <Menu
      label={t("profile")}
      boxed
      asksFirst
      triggerClassName="size-11 font-heading text-base font-bold"
      trigger={<span aria-hidden>{initials(name)}</span>}
    >
      {() => (
        <>
          {/* name and role */}
          <div className="px-3 pb-2 pt-1.5">
            <p className="font-heading text-lg font-bold leading-6">{name}</p>
            <p className="text-sm text-chestnut/80">{t(`roles.${role}`)}</p>
          </div>

          {/* log out: stays open with a spinner until the session has ended */}
          <div className="border-t border-chestnut/15 pt-1.5">
            <MenuItem
              onClick={() => logout.logout()}
              disabled={logout.loggingOut}
              aria-busy={logout.loggingOut}
            >
              {logout.loggingOut ? <Spinner /> : <LogOut className="size-4" aria-hidden />}{" "}
              {t("logout")}
            </MenuItem>
          </div>
        </>
      )}
    </Menu>
  );
}
