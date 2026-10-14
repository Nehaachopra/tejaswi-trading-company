"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { useLocale, useTranslations } from "next-intl";
import { Languages, LogOut, User } from "lucide-react";
import type { RouterOutputs } from "@repo/trpc/client";

import { Button } from "~/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "~/components/ui/dropdown-menu";
import { setLocale } from "~/i18n/actions";
import { localeNames, locales } from "~/i18n/locales";
import { trpc } from "~/trpc/client";

type SessionUser = RouterOutputs["auth"]["me"]["user"];

export function ProfileMenu({ user }: { user: SessionUser }) {
  const t = useTranslations("shell");
  const locale = useLocale();
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const logout = trpc.auth.logout.useMutation();

  function changeLanguage(next: string) {
    startTransition(async () => {
      await setLocale(next);
      router.refresh();
    });
  }

  function signOut() {
    logout.mutate(undefined, {
      onSettled: () => {
        router.replace("/login");
        router.refresh();
      },
    });
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger render={<Button variant="ghost" size="icon" className="size-11" aria-label={t("profile")} />}>
        <User />
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-60">
        <DropdownMenuGroup>
          <DropdownMenuLabel className="flex flex-col gap-0.5 py-2">
            <span className="text-sm font-semibold text-foreground">{user.name}</span>
            <span className="text-xs font-normal text-muted-foreground">
              {t(`roles.${user.role}`)} · {user.countryCode} {user.phone}
            </span>
          </DropdownMenuLabel>
        </DropdownMenuGroup>
        <DropdownMenuSeparator />
        <DropdownMenuGroup>
          <DropdownMenuLabel className="flex items-center gap-2">
            <Languages className="size-4" />
            {t("language")}
          </DropdownMenuLabel>
          <DropdownMenuRadioGroup value={locale} onValueChange={(value) => changeLanguage(String(value))}>
            {locales.map((code) => (
              <DropdownMenuRadioItem key={code} value={code} disabled={pending} className="min-h-11">
                {localeNames[code]}
              </DropdownMenuRadioItem>
            ))}
          </DropdownMenuRadioGroup>
        </DropdownMenuGroup>
        <DropdownMenuSeparator />
        <DropdownMenuItem className="min-h-11" onClick={signOut} disabled={logout.isPending}>
          <LogOut />
          {t("logout")}
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
