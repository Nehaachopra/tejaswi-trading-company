"use client";

import { MutationCache, QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { ThemeProvider as NextThemesProvider } from "next-themes";
import React, { useState } from "react";

import { Toaster } from "~/components/ui/toast";
import { CapitalFirst } from "~/lib/capital-first";
import { refreshScope, scopeOf } from "~/lib/refresh-scope";
import { trpc } from "~/trpc/client";
import { createTRPCLinks } from "~/trpc/create-client";

const queryClient: QueryClient = new QueryClient({
  // a save that worked refreshes its part of the app in this tab, as a live update does in every other tab (the server
  // leaves this tab out of its own changes)
  mutationCache: new MutationCache({
    onSuccess: (_data, _vars, _ctx, mutation) => {
      const scope = scopeOf(mutation.options.mutationKey);
      if (scope) refreshScope(queryClient, scope);
    },
  }),
  defaultOptions: {
    queries: {
      refetchOnMount: true,
      staleTime: Infinity,
    },
  },
});

export const GlobalProviders: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [trpcClient] = useState(() =>
    trpc.createClient({
      links: [createTRPCLinks()],
    }),
  );
  return (
    <QueryClientProvider client={queryClient}>
      <NextThemesProvider
        attribute="class"
        defaultTheme="light"
        enableSystem
        forcedTheme="light"
        disableTransitionOnChange
      >
        <trpc.Provider queryClient={queryClient} client={trpcClient}>
          {children}
          <Toaster />
          <CapitalFirst />
        </trpc.Provider>
      </NextThemesProvider>
    </QueryClientProvider>
  );
};
