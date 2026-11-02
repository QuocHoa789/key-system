import type { Express, Request, Response } from "express";
import path from "node:path";
import { storagePut } from "./storage";
import { sdk } from "./_core/sdk";

const MAX_FILE_BYTES = 10 * 1024 * 1024;
const SAFE_EXTENSIONS = new Set([
  ".txt", ".lua", ".js", ".ts", ".json", ".css", ".html", ".md", ".xml", ".yml", ".yaml",
]);

function safeFileName(value: string) {
  const base = path.basename(value).replace(/[^a-zA-Z0-9._-]/g, "-").replace(/-+/g, "-");
  if (!base || base === "." || base === "..") return null;
  const ext = path.extname(base).toLowerCase();
  if (!SAFE_EXTENSIONS.has(ext)) return null;
  return base.slice(0, 180);
}

async function requireAdmin(req: Request) {
  try {
    const user = await sdk.authenticateRequest(req);
    return user.role === "admin" ? user : null;
  } catch {
    return null;
  }
}

export function registerFileApi(app: Express) {
  app.post(
    "/api/files/upload",
    async (req, res, next) => {
      const admin = await requireAdmin(req);
      if (!admin) return res.status(403).json({ error: "Admin access required" });
      next();
    },
    async (req, res) => {
      const fileName = safeFileName(req.get("x-file-name") ?? "");
      const contentType = (req.get("content-type") ?? "text/plain").split(";", 1)[0].trim().toLowerCase();
      const body = Buffer.isBuffer(req.body) ? req.body : Buffer.from([]);

      if (!fileName) return res.status(400).json({ error: "Unsupported or invalid file name" });
      if (body.length === 0) return res.status(400).json({ error: "File is empty" });
      if (body.length > MAX_FILE_BYTES) return res.status(413).json({ error: "File exceeds 10 MB limit" });

      try {
        const stored = await storagePut(`raw/${fileName}`, body, contentType || "text/plain");
        return res.status(201).json({
          name: fileName,
          size: body.length,
          contentType,
          rawPath: stored.url,
          rawUrl: stored.url,
          message: "Upload thành công. Dùng rawPath làm URL public.",
        });
      } catch (error) {
        console.error("[Files] upload failed", error instanceof Error ? error.message : error);
        return res.status(503).json({ error: "Storage unavailable" });
      }
    },
  );
}

export const fileUploadLimit = MAX_FILE_BYTES;
