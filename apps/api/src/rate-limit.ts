import type { Request, Response } from "express";
import { rateLimit } from "express-rate-limit";

const MINUTE_MS = 60 * 1000;

// per IP, on top of AuthService's per-number limits (30 s resend, 5 codes per 15 min, 5 tries per code)
const SIGN_IN_WINDOW_MS = 15 * MINUTE_MS;
const SIGN_IN_LIMIT = 20;
const SIGN_IN_PATHS = ["/trpc/auth.requestOtp", "/trpc/auth.verifyOtp", "/api/auth/otp"];

// everything else: generous for a busy counter, tight enough to stop a runaway script
const API_WINDOW_MS = MINUTE_MS;
const API_LIMIT = 300;

const isSignIn = (req: Request) => SIGN_IN_PATHS.some((path) => req.originalUrl.startsWith(path));

// tRPC clients read the error from this shape, so the login page shows "too many attempts"
function tooMany(req: Request, res: Response) {
  const message = "Too many requests. Please wait and try again.";
  if (!req.originalUrl.startsWith("/trpc")) {
    res.status(429).json({ message, code: "TOO_MANY_REQUESTS" });
    return;
  }
  const path = req.originalUrl.slice("/trpc/".length).split("?")[0];
  res.status(429).json({
    error: { message, code: -32029, data: { code: "TOO_MANY_REQUESTS", httpStatus: 429, path } },
  });
}

const common = { standardHeaders: "draft-8", legacyHeaders: false, handler: tooMany } as const;

export const signInLimiter = rateLimit({
  ...common,
  windowMs: SIGN_IN_WINDOW_MS,
  limit: SIGN_IN_LIMIT,
  skip: (req) => !isSignIn(req),
});

export const apiLimiter = rateLimit({
  ...common,
  windowMs: API_WINDOW_MS,
  limit: API_LIMIT,
  skip: isSignIn,
});
