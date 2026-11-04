import type { Express, Request } from "express";
import path from "node:path";
import { ObjectId, GridFSBucket } from "mongodb";
import { parse as parseCookieHeader } from "cookie";
import { getDb } from "./db";
import { sdk } from "./_core/sdk";
import { ADMIN_SESSION_COOKIE, verifyAdminSession } from "./_core/adminAuth";

const MAX_FILE_BYTES = 10 * 1024 * 1024;
const SAFE_EXTENSIONS = new Set([".txt", ".lua", ".js", ".ts", ".json", ".css", ".html", ".md", ".xml", ".yml", ".yaml"]);

function safeFileName(value: string) {
  const base = path.basename(value).replace(/[^a-zA-Z0-9._-]/g, "-").replace(/-+/g, "-");
  if (!base || base === "." || base === "..") return null;
  if (!SAFE_EXTENSIONS.has(path.extname(base).toLowerCase())) return null;
  return base.slice(0, 180);
}

async function requireAdmin(req: Request) {
  const adminToken = parseCookieHeader(req.headers.cookie ?? "")[ADMIN_SESSION_COOKIE];
  if (await verifyAdminSession(adminToken)) return true;
  try {
    const user = await sdk.authenticateRequest(req);
    return user.role === "admin";
  } catch {
    return false;
  }
}

async function getBucket() {
  const db = await getDb();
  if (!db) throw new Error("MongoDB is not configured. Set MONGODB_URI.");
  return new GridFSBucket(db, { bucketName: "files" });
}

export function registerFileApi(app: Express) {
  app.get("/api/files/admin/list", async (req, res) => {
    if (!(await requireAdmin(req))) return res.status(403).json({ error: "Admin access required" });
    try {
      const db = await getDb();
      if (!db) throw new Error("MongoDB is not configured");
      const files = await db.collection("files.files").find({}).sort({ uploadDate: -1 }).limit(200).toArray();
      return res.json(files.map(file => ({
        id: String(file._id),
        name: String(file.metadata?.originalName ?? file.filename),
        size: Number(file.length ?? 0),
        contentType: String(file.metadata?.contentType ?? "text/plain"),
        enabled: file.metadata?.enabled !== false,
        uploadedAt: file.uploadDate,
        rawPath: `/api/files/raw/${String(file._id)}`,
        loaderPath: `/api/v1/loader/session`,
      })));
    } catch (error) {
      console.error("[Files] list failed", error instanceof Error ? error.message : error);
      return res.status(503).json({ error: "MongoDB storage unavailable" });
    }
  });

  app.post("/api/files/admin/:id/toggle", async (req, res) => {
    if (!(await requireAdmin(req))) return res.status(403).json({ error: "Admin access required" });
    const id = String(req.params.id ?? "");
    if (!ObjectId.isValid(id)) return res.status(400).json({ error: "Invalid file id" });
    try {
      const db = await getDb();
      if (!db) throw new Error("MongoDB is not configured");
      const objectId = new ObjectId(id);
      const file = await db.collection("files.files").findOne({ _id: objectId });
      if (!file) return res.status(404).json({ error: "File not found" });
      const enabled = file.metadata?.enabled === false;
      await db.collection("files.files").updateOne({ _id: objectId }, { $set: { "metadata.enabled": enabled } });
      return res.json({ id, enabled });
    } catch (error) {
      console.error("[Files] toggle failed", error instanceof Error ? error.message : error);
      return res.status(503).json({ error: "MongoDB storage unavailable" });
    }
  });

  app.delete("/api/files/admin/:id", async (req, res) => {
    if (!(await requireAdmin(req))) return res.status(403).json({ error: "Admin access required" });
    const id = String(req.params.id ?? "");
    if (!ObjectId.isValid(id)) return res.status(400).json({ error: "Invalid file id" });
    try {
      const bucket = await getBucket();
      await bucket.delete(new ObjectId(id));
      return res.json({ success: true, id });
    } catch (error) {
      console.error("[Files] delete failed", error instanceof Error ? error.message : error);
      return res.status(404).json({ error: "File not found" });
    }
  });

  app.get("/api/files/raw/:id", async (req, res) => {
    return res.status(410).json({ error: "Raw source endpoint disabled. Use the bootstrap loader." });
  });

  app.post("/api/files/upload", async (req, res, next) => {
    const admin = await requireAdmin(req);
    if (!admin) return res.status(403).json({ error: "Admin access required" });
    next();
  }, async (req, res) => {
    const fileName = safeFileName(req.get("x-file-name") ?? "");
    const contentType = (req.get("content-type") ?? "text/plain").split(";", 1)[0].trim().toLowerCase() || "text/plain";
    const body = Buffer.isBuffer(req.body) ? req.body : Buffer.alloc(0);
    if (!fileName) return res.status(400).json({ error: "Unsupported or invalid file name" });
    if (body.length === 0) return res.status(400).json({ error: "File is empty" });
    if (body.length > MAX_FILE_BYTES) return res.status(413).json({ error: "File exceeds 10 MB limit" });
    try {
      const bucket = await getBucket();
      const id = await new Promise<ObjectId>((resolve, reject) => {
      const upload = bucket.openUploadStream(fileName, { metadata: { contentType, originalName: fileName, enabled: true } });
        upload.once("finish", () => resolve(upload.id as ObjectId));
        upload.once("error", reject);
        upload.end(body);
      });
      const rawPath = `/api/files/raw/${id.toHexString()}`;
      return res.status(201).json({ name: fileName, size: body.length, contentType, rawPath, rawUrl: rawPath });
    } catch (error) {
      console.error("[Files] GridFS upload failed", error instanceof Error ? error.message : error);
      return res.status(503).json({ error: "MongoDB storage unavailable" });
    }
  });
}

export const fileUploadLimit = MAX_FILE_BYTES;
