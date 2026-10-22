import { randomUUID } from "node:crypto";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";

import express, { Router } from "express";
import { logger } from "@repo/logger";
import { sessionFromRequest } from "@repo/trpc/server";

import { env } from "./env";

// photos are stored on this server's disk for now (a CDN comes later) and served back from /uploads
export const uploadsDir = path.resolve(env.UPLOADS_DIR);

const TYPES: Record<string, string> = { "image/webp": "webp", "image/jpeg": "jpg", "image/png": "png" };
const MAX_BYTES = 5 * 1024 * 1024;

export const uploadsRouter = Router();

// a product photo: the raw image as the body (the web app shrinks it first), admins only;
// answers with the link to store on the product
uploadsRouter.post("/product-image", express.raw({ type: Object.keys(TYPES), limit: MAX_BYTES }), async (req, res) => {
  const session = await sessionFromRequest(req);
  if (!session) return res.status(401).json({ message: "Please log in." });
  if (session.user.role !== "admin") return res.status(403).json({ message: "Admins only." });

  const ext = TYPES[req.headers["content-type"] ?? ""];
  if (!ext || !Buffer.isBuffer(req.body) || req.body.length === 0) {
    return res.status(415).json({ message: "Send a WebP, JPEG or PNG image." });
  }

  try {
    const dir = path.join(uploadsDir, "products");
    await mkdir(dir, { recursive: true });
    const file = `${randomUUID()}.${ext}`;
    await writeFile(path.join(dir, file), req.body);
    return res.status(201).json({ url: `/uploads/products/${file}` });
  } catch (error) {
    logger.error("Couldn't save an uploaded photo", { error });
    return res.status(500).json({ message: "Couldn't save the photo." });
  }
});

// a too-big body: say so plainly instead of Express's HTML error page
uploadsRouter.use((err: { type?: string }, _req: express.Request, res: express.Response, next: express.NextFunction) => {
  if (err.type === "entity.too.large") return res.status(413).json({ message: "The photo is too big (5 MB at most)." });
  return next(err);
});

// the stored photos; each file name is new on every upload, so browsers can keep them for good
export const uploadsStatic = express.static(uploadsDir, { immutable: true, maxAge: "365d", index: false });
