import type { Express, Request } from "express";
import { ObjectId, GridFSBucket } from "mongodb";
import rateLimit from "express-rate-limit";
import { SignJWT, jwtVerify } from "jose";
import { getDb } from "./db";
import { ENV } from "./_core/env";

const LOADER_ISSUER = "keyforge-loader";
const clientIdSchema = /^[a-zA-Z0-9._:-]{8,160}$/;
const sessionLimiter = rateLimit({ windowMs: 60_000, limit: 20, standardHeaders: "draft-8", legacyHeaders: false, message: { ok: false, reason: "rate_limited" } });
const payloadLimiter = rateLimit({ windowMs: 60_000, limit: 40, standardHeaders: "draft-8", legacyHeaders: false, message: { ok: false, reason: "rate_limited" } });

function secretKey() {
  if (!ENV.cookieSecret) throw new Error("MANUS_JWT_SECRET is unavailable");
  return new TextEncoder().encode(ENV.cookieSecret);
}

function clientIp(req: Request) {
  return req.ip || req.headers["x-forwarded-for"]?.toString().split(",")[0]?.trim() || "unknown";
}

export function registerLoaderApi(app: Express) {
  app.post("/api/v1/loader/session", sessionLimiter, async (req, res) => {
    const fileId = typeof req.body?.fileId === "string" ? req.body.fileId : "";
    const clientId = typeof req.body?.clientId === "string" ? req.body.clientId : "";
    if (!ObjectId.isValid(fileId) || !clientIdSchema.test(clientId)) return res.status(400).json({ ok: false, reason: "invalid_request" });
    try {
      const db = await getDb();
      if (!db) return res.status(503).json({ ok: false, reason: "database_unavailable" });
      const file = await db.collection("files.files").findOne({ _id: new ObjectId(fileId) });
      if (!file) return res.status(404).json({ ok: false, reason: "not_found" });
      if (file.metadata?.enabled === false) return res.status(403).json({ ok: false, reason: "disabled" });
      const token = await new SignJWT({ scope: "loader", fileId, clientId, ip: clientIp(req) })
        .setProtectedHeader({ alg: "HS256", typ: "JWT" }).setIssuer(LOADER_ISSUER).setIssuedAt().setExpirationTime("90s").sign(secretKey());
      return res.json({ ok: true, sessionToken: token, expiresIn: 90 });
    } catch (error) {
      console.error("[Loader] session failed", error instanceof Error ? error.message : error);
      return res.status(503).json({ ok: false, reason: "service_unavailable" });
    }
  });

  app.post("/api/v1/loader/payload", payloadLimiter, async (req, res) => {
    const sessionToken = typeof req.body?.sessionToken === "string" ? req.body.sessionToken : "";
    if (!sessionToken) return res.status(400).json({ ok: false, reason: "invalid_request" });
    try {
      const { payload } = await jwtVerify(sessionToken, secretKey(), { algorithms: ["HS256"], issuer: LOADER_ISSUER });
      const fileId = typeof payload.fileId === "string" ? payload.fileId : "";
      if (!ObjectId.isValid(fileId) || payload.scope !== "loader") return res.status(401).json({ ok: false, reason: "invalid_session" });
      const db = await getDb();
      if (!db) return res.status(503).json({ ok: false, reason: "database_unavailable" });
      const objectId = new ObjectId(fileId);
      const file = await db.collection("files.files").findOne({ _id: objectId });
      if (!file) return res.status(404).json({ ok: false, reason: "not_found" });
      if (file.metadata?.enabled === false) return res.status(403).json({ ok: false, reason: "disabled" });
      const chunks = await db.collection("files.chunks").find({ files_id: objectId }).sort({ n: 1 }).toArray();
      const source = Buffer.concat(chunks.map(chunk => Buffer.from(chunk.data.buffer ?? chunk.data)));
      res.setHeader("Cache-Control", "no-store");
      res.setHeader("Content-Type", "application/json; charset=utf-8");
      return res.json({ ok: true, source: source.toString("utf8"), expiresIn: Math.max(1, Number(payload.exp ? payload.exp - Math.floor(Date.now() / 1000) : 60)) });
    } catch {
      return res.status(401).json({ ok: false, reason: "invalid_or_expired_session" });
    }
  });
}
