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

function packPayload(source: Buffer, sessionToken: string) {
  const key = Buffer.from(sessionToken, "utf8");
  const packed = Buffer.allocUnsafe(source.length);
  for (let i = 0; i < source.length; i += 1) packed[i] = (source[i] + key[i % key.length]) & 255;
  return packed.toString("base64");
}

const BOOTSTRAP_TEMPLATE = String.raw`local H=game:GetService("HttpService")
local I="__FILE_ID__"
local A="/api/v1/loader"
local R=(syn and syn.request) or (http and http.request) or request
if not R then error("HTTP request is not supported") end
local function P(p,b)local x=R({Url=A..p,Method="POST",Headers={["Content-Type"]="application/json"},Body=H:JSONEncode(b)});local s=x.StatusCode or x.Status or 0;if s<200 or s>=300 then error("KeyForge loader HTTP "..s)end;return H:JSONDecode(x.Body or x.body or "")end
local B="ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/"
local function D(v)v=v:gsub("[^"..B.."=]",""):gsub(".",function(c)if c=="="then return""end local n=B:find(c,1,true)-1 local z=""for i=6,1,-1 do z=z..((n%2^i-n%2^(i-1)>0)and"1"or"0")end return z end)local o={}for z in v:gmatch("%d%d%d?%d?%d?%d?%d?%d?")do if#z==8 then local n=0 for i=1,8 do if z:sub(i,i)=="1"then n=n+2^(8-i)end end o[#o+1]=string.char(n)end end return table.concat(o)end
local C="client-"..tostring(game.PlaceId).."-"..tostring(game.JobId~=""and game.JobId or os.time())
local S=P("/session",{fileId=I,clientId=C})
if S.ok~=true or type(S.sessionToken)~="string"then error("KeyForge file is disabled or unavailable")end
local Q=P("/payload",{sessionToken=S.sessionToken})
if Q.ok~=true or Q.algorithm~="packed-add-v1"or type(Q.payload)~="string"then error("KeyForge payload unavailable")end
local x=D(Q.payload)local o={}for i=1,#x do o[i]=string.char((string.byte(x,i)-string.byte(S.sessionToken,((i-1)%#S.sessionToken)+1))%256)end
local f,e=(loadstring or load)(table.concat(o),"=KeyForgePayload")if not f then error(e)end return f()`;

function bootstrapSource(fileId: string) {
  return BOOTSTRAP_TEMPLATE.replace("__FILE_ID__", fileId);
}

export function registerLoaderApi(app: Express) {
  app.get("/api/v1/loader/:fileId.lua", async (req, res) => {
    const fileId = String(req.params.fileId ?? "");
    if (!ObjectId.isValid(fileId)) return res.status(404).type("text/plain").send("-- invalid loader id");
    try {
      const db = await getDb();
      if (!db) return res.status(503).type("text/plain").send("-- database unavailable");
      const file = await db.collection("files.files").findOne({ _id: new ObjectId(fileId) });
      if (!file) return res.status(404).type("text/plain").send("-- loader not found");
      res.setHeader("Cache-Control", "no-store, no-cache, must-revalidate, private");
      return res.type("text/plain").send(bootstrapSource(fileId));
    } catch {
      return res.status(503).type("text/plain").send("-- loader unavailable");
    }
  });

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
      res.setHeader("X-KeyForge-Payload", "packed-add-v1");
      return res.json({ ok: true, algorithm: "packed-add-v1", payload: packPayload(source, sessionToken), expiresIn: Math.max(1, Number(payload.exp ? payload.exp - Math.floor(Date.now() / 1000) : 60)) });
    } catch {
      return res.status(401).json({ ok: false, reason: "invalid_or_expired_session" });
    }
  });
}
