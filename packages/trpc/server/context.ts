import type { CreateExpressContextOptions } from "@trpc/server/adapters/express";
import { IncomingHttpHeaders } from 'node:http';

export interface TRPCContext {
  userId? : string,
  operatorId? : string,
  trustedDeviceId?: string,
  headers: IncomingHttpHeaders,
  authHeaders: Record<string, string>;
}

export async function createContext({req, res}: CreateExpressContextOptions) {
  const ctx = {
  }

  return ctx
}

export type Context = Awaited<ReturnType<typeof createContext>>;
