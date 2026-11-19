"use client";

import { useSyncExternalStore } from "react";

// below Tailwind's sm breakpoint: a phone. Follows the window as it changes; false on the server
const query = "(max-width: 639px)";

function subscribe(onChange: () => void) {
  const list = window.matchMedia(query);
  list.addEventListener("change", onChange);
  return () => list.removeEventListener("change", onChange);
}

export function usePhone() {
  return useSyncExternalStore(
    subscribe,
    () => window.matchMedia(query).matches,
    () => false,
  );
}
