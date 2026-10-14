import express from "express";
import { logger } from "@repo/logger";
import cors from "cors";

import * as trpcExpress from "@trpc/server/adapters/express";
import { generateOpenApiDocument, createOpenApiExpressMiddleware } from "trpc-to-openapi";
import { apiReference } from "@scalar/express-api-reference";

import { serverRouter, createContext } from "@repo/trpc/server";

import { env } from "./env";

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
