import { EventEmitter } from "node:events";

// a "something changed" signal: which part of the app (the router's first segment, e.g. "inventory"),
// the procedure that changed it, and the browser tab that made the change (that tab refreshes itself)
export type LiveChange = { scope: string; path: string; tabId: string | null };

// the parts of the app whose changes aren't broadcast: signing in and out is nobody else's business
const QUIET = new Set(["auth", "health"]);

// one bus per API process; every open connection listens on it. With more than one API server this becomes
// Postgres LISTEN/NOTIFY on a direct (unpooled) connection, behind the same publish and listen
const bus = new EventEmitter();
bus.setMaxListeners(0);

export function publishChange(change: LiveChange) {
  if (QUIET.has(change.scope)) return;
  bus.emit("change", change);
}

export { bus as liveBus };
