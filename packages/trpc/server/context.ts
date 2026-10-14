import type { CreateExpressContextOptions } from "@trpc/server/adapters/express";
import type { Request, Response } from "express";
import type { AuthSessionModel, ClientInfo } from "@repo/services/auth/model";

import { authService } from "./services";

export interface Context {
  req: Request;
  res: Response;
  session: AuthSessionModel | null;
  client: ClientInfo;
}

export const SESSION_COOKIE = "ttc_session";

function readCookie(header: string | undefined, name: string) {
  if (!header) return undefined;
  for (const part of header.split(";")) {
    const [key, ...value] = part.trim().split("=");
    if (key === name) return decodeURIComponent(value.join("="));
  }
  return undefined;
}

export async function createContext({ req, res }: CreateExpressContextOptions): Promise<Context> {
  const token = readCookie(req.headers.cookie, SESSION_COOKIE);
  const session = token ? await authService.getSession(token) : null;

  return {
    req,
    res,
    session,
    client: {
      ipAddress: req.ip,
      userAgent: req.headers["user-agent"],
    },
  };
}
