import express from "express";
import { logger } from "@repo/logger";
import cors from "cors";

import * as trpcExpress from "@trpc/server/adapters/express";
import { generateOpenApiDocument, createOpenApiExpressMiddleware } from "trpc-to-openapi";
import { apiReference } from "@scalar/express-api-reference";

import { serverRouter, createContext } from "@repo/trpc/server";

import { env } from "./env";
import { apiLimiter, signInLimiter } from "./rate-limit";
import { uploadsRouter, uploadsStatic } from "./uploads";

export const app = express();

// expected errors (wrong OTP, forbidden, ...) are part of the flow; only log the unexpected ones
const onError = ({ error, path }: { error: { code: string }; path?: string }) => {
  if (error.code === "INTERNAL_SERVER_ERROR") {
    logger.error(`Unexpected error in ${path ?? "unknown procedure"}`, { error });
  }
};
const openApiDocument = generateOpenApiDocument(serverRouter, {
  title: "Tejaswi trading company OpenAPI",
  version: "1.0.0",
  baseUrl: env.BASE_URL.concat("/api"),
});

if (env.NODE_ENV !== "prod") {
  app.use(
    cors({
      origin: "http://localhost:3000",
      credentials: true,
    }),
  );
}

// the web app forwards /trpc from its own server, so the visitor's IP is in X-Forwarded-For;
// trust only that hop (loopback by default) so a visitor can't fake an IP to dodge the limits
app.set("trust proxy", env.TRUST_PROXY);

app.use(["/trpc", "/api", "/uploads"], signInLimiter, apiLimiter);

// photo uploads take the raw image, so they come before the JSON body parser; then the stored photos
app.use("/uploads", uploadsRouter, uploadsStatic);

app.use(express.json());

app.get("/", (req, res) => {
  return res.json({ message: "Tejaswi Trading Company API is up and running" });
});

app.get("/health", (req, res) => {
  return res.json({ message: "Tejaswi Trading Company API is healthy", healthy: true });
});

logger.debug(`openapi.json: ${env.BASE_URL}/openapi.json`);
app.get("/openapi.json", (req, res) => {
  return res.json(openApiDocument);
});

logger.debug(`docs: ${env.BASE_URL}/docs`);
app.use("/docs", apiReference({ url: "/openapi.json" }));

app.use(
  "/api",
  createOpenApiExpressMiddleware({
    router: serverRouter,
    createContext,
    onError,
  }),
);

app.use(
  "/trpc",
  trpcExpress.createExpressMiddleware({
    router: serverRouter,
    createContext,
    onError,
  }),
);

export default app;
