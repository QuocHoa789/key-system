import { jwtVerify, SignJWT } from "jose";
import type { Express, Request } from "express";
import rateLimit from "express-rate-limit";
import { z } from "zod";
import {
  activateLicenseKey,
  getActivationByDevice,
  getKeyStatus,
  getLicenseKeyByCode,
  getLicenseKeyById,
  touchActivation,
} from "./db";
import { ENV } from "./_core/env";

const LICENSE_ISSUER = "keyforge-license";
const LICENSE_TOKEN_TTL = "30m";
const deviceSchema = z.string().trim().min(8).max(160);
const keySchema = z.string().trim().min(3).max(128);
const verifyBody = z.object({ key: keySchema, deviceId: deviceSchema });
const activateBody = verifyBody;
const heartbeatBody = z.object({ licenseToken: z.string().min(20).max(4096), deviceId: deviceSchema });

const verifyLimiter = rateLimit({
  windowMs: 60_000,
  limit: 30,
  standardHeaders: "draft-8",
  legacyHeaders: false,
  message: { valid: false, reason: "rate_limited" },
});
const activateLimiter = rateLimit({
  windowMs: 15 * 60_000,
  limit: 10,
  standardHeaders: "draft-8",
  legacyHeaders: false,
  message: { success: false, reason: "rate_limited" },
});
const heartbeatLimiter = rateLimit({
  windowMs: 60_000,
  limit: 60,
  standardHeaders: "draft-8",
  legacyHeaders: false,
  message: { valid: false, reason: "rate_limited" },
});

function tokenSecret() {
  if (!ENV.cookieSecret) throw new Error("MANUS_JWT_SECRET is unavailable");
  return new TextEncoder().encode(ENV.cookieSecret);
}

async function createLicenseToken(keyId: number, deviceId: string) {
  return new SignJWT({ scope: "license", keyId, deviceId })
    .setProtectedHeader({ alg: "HS256", typ: "JWT" })
    .setIssuer(LICENSE_ISSUER)
    .setIssuedAt()
    .setExpirationTime(LICENSE_TOKEN_TTL)
    .sign(tokenSecret());
}

async function readLicenseToken(token: string) {
  const result = await jwtVerify(token, tokenSecret(), { algorithms: ["HS256"], issuer: LICENSE_ISSUER });
  const keyId = result.payload.keyId;
  const deviceId = result.payload.deviceId;
  if (result.payload.scope !== "license" || typeof keyId !== "number" || typeof deviceId !== "string") throw new Error("Invalid license token claims");
  return { keyId, deviceId };
}

function normalizedKey(value: string) {
  return value.toUpperCase();
}

function publicStatus(key: Awaited<ReturnType<typeof getLicenseKeyByCode>>) {
  if (!key) return null;
  return {
    key: key.key,
    status: getKeyStatus(key),
    expiresAt: key.expiresAt,
    usedCount: key.usedCount,
    maxUses: key.maxUses,
    remainingUses: Math.max(0, key.maxUses - key.usedCount),
  };
}

function clientIp(req: Request) {
  return req.ip || req.headers["x-forwarded-for"]?.toString().split(",")[0]?.trim() || null;
}

export function registerLicenseApi(app: Express) {
  app.post("/api/v1/license/verify", verifyLimiter, async (req, res) => {
    const parsed = verifyBody.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ valid: false, reason: "invalid_request" });
    try {
      const key = await getLicenseKeyByCode(normalizedKey(parsed.data.key));
      if (!key) return res.status(404).json({ valid: false, reason: "invalid" });
      const status = getKeyStatus(key);
      if (status === "revoked") return res.status(403).json({ valid: false, reason: "revoked" });
      if (status === "expired") return res.status(403).json({ valid: false, reason: "expired" });
      const activation = await getActivationByDevice(key.id, parsed.data.deviceId);
      if (status === "exhausted" && !activation) return res.status(403).json({ valid: false, reason: "exhausted" });
      return res.json({ valid: true, deviceBound: Boolean(activation), ...publicStatus(key) });
    } catch (error) {
      console.error("[License] verify failed", error instanceof Error ? error.message : error);
      return res.status(503).json({ valid: false, reason: "service_unavailable" });
    }
  });

  app.post("/api/v1/license/activate", activateLimiter, async (req, res) => {
    const parsed = activateBody.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ success: false, reason: "invalid_request" });
    try {
      const result = await activateLicenseKey({
        key: normalizedKey(parsed.data.key),
        fingerprint: parsed.data.deviceId,
        ipAddress: clientIp(req),
        userAgent: req.get("user-agent") ?? null,
      });
      if (!result.ok) return res.status(403).json({ success: false, reason: result.reason });
      const licenseToken = await createLicenseToken(result.key.id, parsed.data.deviceId);
      return res.json({ success: true, reason: result.reason, licenseToken, ...publicStatus(result.key) });
    } catch (error) {
      console.error("[License] activate failed", error instanceof Error ? error.message : error);
      return res.status(503).json({ success: false, reason: "service_unavailable" });
    }
  });

  app.post("/api/v1/license/heartbeat", heartbeatLimiter, async (req, res) => {
    const parsed = heartbeatBody.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ valid: false, reason: "invalid_request" });
    try {
      const claims = await readLicenseToken(parsed.data.licenseToken);
      if (claims.deviceId !== parsed.data.deviceId) return res.status(403).json({ valid: false, reason: "device_mismatch" });
      const key = await getLicenseKeyById(claims.keyId);
      if (!key) return res.status(404).json({ valid: false, reason: "invalid" });
      const activation = await getActivationByDevice(key.id, parsed.data.deviceId);
      if (!activation) return res.status(403).json({ valid: false, reason: "device_mismatch" });
      const status = getKeyStatus(key);
      if (status === "revoked") return res.status(403).json({ valid: false, reason: "revoked" });
      if (status === "expired") return res.status(403).json({ valid: false, reason: "expired" });
      await touchActivation(activation.id);
      return res.json({ valid: true, deviceBound: true, ...publicStatus(key) });
    } catch {
      return res.status(401).json({ valid: false, reason: "invalid_token" });
    }
  });
}
