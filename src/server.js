import 'dotenv/config';
import crypto from 'node:crypto';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import express from 'express';
import helmet from 'helmet';
import cookieParser from 'cookie-parser';
import bcrypt from 'bcrypt';
import jwt from 'jsonwebtoken';
import rateLimit from 'express-rate-limit';
import mysql from 'mysql2/promise';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PORT = Number(process.env.PORT || 3000);
const ADMIN_USERNAME = 'quochoa';
const JWT_SECRET = process.env.JWT_SECRET;
const HMAC_SECRET = process.env.HMAC_SECRET;
const KEY_SALT = process.env.KEY_SALT;
const DATABASE_URL = process.env.DATABASE_URL;
if (!DATABASE_URL) throw new Error('DATABASE_URL is required');
if ([['JWT_SECRET', JWT_SECRET], ['HMAC_SECRET', HMAC_SECRET], ['KEY_SALT', KEY_SALT]].some(([, v]) => !v || v.length < 32)) throw new Error('Security secrets must be at least 32 characters');

const pool = mysql.createPool(DATABASE_URL);
const app = express();
app.set('trust proxy', Number(process.env.TRUST_PROXY || 1));
app.disable('x-powered-by');
app.use(helmet({
  contentSecurityPolicy: {
    directives: { defaultSrc: ["'self'"], scriptSrc: ["'self'"], styleSrc: ["'self'", "'unsafe-inline'"], imgSrc: ["'self'", 'data:'], connectSrc: ["'self'"], frameAncestors: ["'self'", 'https://*.manus.computer'] }
  },
  crossOriginEmbedderPolicy: false,
  xFrameOptions: false
}));
app.use(express.json({ limit: '24kb', strict: true }));
app.use(cookieParser());

const now = () => new Date();
const iso = () => now().toISOString();
const id = () => crypto.randomUUID();
const clientIp = req => String(req.ip || 'unknown').slice(0, 128);
const text = (v, max = 256) => String(v ?? '').trim().slice(0, max);
const jsonError = (res, status, error) => res.status(status).json({ ok: false, error });
const same = (a, b) => { const x = Buffer.from(String(a || '')); const y = Buffer.from(String(b || '')); return x.length === y.length && crypto.timingSafeEqual(x, y); };
const keyHash = key => crypto.createHash('sha256').update(`${String(key)}:${KEY_SALT}`).digest('hex');
const masked = key => `${key.slice(0, 7)}••••••${key.slice(-5)}`;
const randomKey = prefix => `${prefix}-${crypto.randomBytes(20).toString('base64url').toUpperCase()}`;
const csrfToken = () => crypto.randomBytes(24).toString('base64url');
const cookieOptions = { httpOnly: true, secure: true, sameSite: 'none', maxAge: 8 * 60 * 60 * 1000, path: '/' };

const schema = [
  `CREATE TABLE IF NOT EXISTS app_meta (meta_key VARCHAR(80) PRIMARY KEY, meta_value VARCHAR(255) NOT NULL)`,
  `CREATE TABLE IF NOT EXISTS admins (id CHAR(36) PRIMARY KEY, username VARCHAR(80) UNIQUE NOT NULL, password_hash VARCHAR(255) NOT NULL, role VARCHAR(30) NOT NULL DEFAULT 'owner', created_at DATETIME(3) NOT NULL)`,
  `CREATE TABLE IF NOT EXISTS keys_registry (id CHAR(36) PRIMARY KEY, key_hash CHAR(64) UNIQUE NOT NULL, key_masked VARCHAR(100) NOT NULL, hwid VARCHAR(256) NULL, user_id VARCHAR(128) NULL, status ENUM('active','disabled','revoked') NOT NULL DEFAULT 'active', expires_at DATETIME(3) NULL, note VARCHAR(500) NOT NULL DEFAULT '', created_at DATETIME(3) NOT NULL, created_by VARCHAR(80) NOT NULL, bound_at DATETIME(3) NULL, bound_ip VARCHAR(128) NULL, INDEX idx_keys_status (status), INDEX idx_keys_hwid (hwid), UNIQUE KEY uq_key_user (user_id))`,
  `CREATE TABLE IF NOT EXISTS gate_sessions (session_id CHAR(36) PRIMARY KEY, hwid VARCHAR(256) NOT NULL, user_id VARCHAR(128) NOT NULL, ip VARCHAR(128) NOT NULL, key_id CHAR(36) NULL, claimed_at DATETIME(3) NULL, validated_at DATETIME(3) NULL, created_at DATETIME(3) NOT NULL, expires_at DATETIME(3) NOT NULL, INDEX idx_gate_expiry (expires_at), INDEX idx_gate_key (key_id))`,
  `CREATE TABLE IF NOT EXISTS request_nonces (nonce VARCHAR(160) PRIMARY KEY, expires_at DATETIME(3) NOT NULL, created_at DATETIME(3) NOT NULL, INDEX idx_nonce_expiry (expires_at))`,
  `CREATE TABLE IF NOT EXISTS hwid_blacklist (hwid VARCHAR(256) PRIMARY KEY, reason VARCHAR(300) NOT NULL, banned_by VARCHAR(80) NOT NULL, created_at DATETIME(3) NOT NULL)`,
  `CREATE TABLE IF NOT EXISTS audit_logs (id CHAR(36) PRIMARY KEY, key_id CHAR(36) NULL, action VARCHAR(80) NOT NULL, reason VARCHAR(500) NULL, ip VARCHAR(128) NOT NULL, hwid VARCHAR(256) NULL, actor VARCHAR(128) NULL, created_at DATETIME(3) NOT NULL, INDEX idx_audit_time (created_at), INDEX idx_audit_key (key_id))`
];

async function query(sql, params = []) { const [rows] = await pool.execute(sql, params); return rows; }
async function one(sql, params = []) { const rows = await query(sql, params); return rows[0] || null; }
async function audit({ keyId = null, action, reason = null, req, hwid = null, actor = null }) { await query('INSERT INTO audit_logs (id,key_id,action,reason,ip,hwid,actor,created_at) VALUES (?,?,?,?,?,?,?,?)', [id(), keyId, action, reason, clientIp(req), hwid, actor, now()]); }
async function transaction(fn) { const conn = await pool.getConnection(); try { await conn.beginTransaction(); const result = await fn(conn); await conn.commit(); return result; } catch (e) { await conn.rollback(); throw e; } finally { conn.release(); } }

async function migrate() { for (const statement of schema) await query(statement); }
async function seedAdmin() {
  const password = process.env.ADMIN_PASSWORD;
  if (!password || password.length < 8) throw new Error('ADMIN_PASSWORD must be configured and at least 8 characters');
  const existing = await one('SELECT id FROM admins WHERE username=?', [ADMIN_USERNAME]);
  if (!existing) await query('INSERT INTO admins (id,username,password_hash,role,created_at) VALUES (?,?,?,?,?)', [id(), ADMIN_USERNAME, await bcrypt.hash(password, 12), 'owner', now()]);
}
async function cleanup() { await query('DELETE FROM request_nonces WHERE expires_at < ?', [now()]); await query('DELETE FROM gate_sessions WHERE expires_at < ?', [now()]); }

function signSession(admin, csrf) { return jwt.sign({ sub: admin.id, username: admin.username, role: admin.role, csrf }, JWT_SECRET, { expiresIn: '8h', issuer: 'key-system-control-center' }); }
function auth(req, res, next) { try { const raw = req.cookies.admin_session || String(req.get('authorization') || '').replace(/^Bearer\s+/i, ''); req.admin = jwt.verify(raw, JWT_SECRET, { issuer: 'key-system-control-center' }); next(); } catch { jsonError(res, 401, 'Unauthorized'); } }
function mutation(req, res, next) { if (!same(req.get('x-csrf-token'), req.admin.csrf)) return jsonError(res, 403, 'CSRF check failed'); next(); }
function hmacValid(req) {
  const timestamp = text(req.get('x-timestamp'), 20), nonce = text(req.get('x-nonce'), 160), signature = text(req.get('x-signature'), 128);
  if (!/^\d{10,13}$/.test(timestamp) || !nonce || !/^[a-f0-9]{64}$/i.test(signature)) return false;
  const ms = Number(timestamp) < 1e12 ? Number(timestamp) * 1000 : Number(timestamp);
  if (Math.abs(Date.now() - ms) > 120000) return false;
  const bodyHash = crypto.createHash('sha256').update(JSON.stringify(req.body || {})).digest('hex');
  const canonical = `${req.method}\n${req.path}\n${timestamp}\n${nonce}\n${bodyHash}`;
  return same(crypto.createHmac('sha256', HMAC_SECRET).update(canonical).digest('hex'), signature);
}
async function reserveNonce(nonce) { try { await query('INSERT INTO request_nonces (nonce,expires_at,created_at) VALUES (?,?,?)', [nonce, new Date(Date.now() + 130000), now()]); return true; } catch (e) { if (e.code === 'ER_DUP_ENTRY') return false; throw e; } }

const loginLimit = rateLimit({ windowMs: 15 * 60 * 1000, max: 8, standardHeaders: true, legacyHeaders: false });
const adminLimit = rateLimit({ windowMs: 60 * 1000, max: 180, standardHeaders: true, legacyHeaders: false });
const clientLimit = rateLimit({ windowMs: 60 * 1000, max: 45, standardHeaders: true, legacyHeaders: false });
app.use('/api/admin', adminLimit);
app.get('/healthz', async (req, res) => { try { await query('SELECT 1'); res.json({ ok: true, service: 'key-system', time: iso() }); } catch { res.status(503).json({ ok: false, error: 'Database unavailable' }); } });
app.get('/api/admin/session', auth, (req, res) => res.json({ ok: true, user: { username: req.admin.username, role: req.admin.role }, csrf: req.admin.csrf }));
app.post('/api/admin/login', loginLimit, async (req, res) => {
  const username = text(req.body?.username, 80), password = String(req.body?.password || '');
  const admin = await one('SELECT * FROM admins WHERE username=?', [username]);
  if (!admin || !(await bcrypt.compare(password, admin.password_hash))) { await audit({ action: 'admin_login_failed', reason: 'invalid credentials', req, actor: username }); return jsonError(res, 401, 'Invalid credentials'); }
  const csrf = csrfToken(); res.cookie('admin_session', signSession(admin, csrf), cookieOptions);
  await audit({ action: 'admin_login', req, actor: admin.username }); res.json({ ok: true, user: { username: admin.username, role: admin.role }, csrf });
});
app.post('/api/admin/logout', auth, mutation, async (req, res) => { res.clearCookie('admin_session', { ...cookieOptions, maxAge: undefined }); await audit({ action: 'admin_logout', req, actor: req.admin.username }); res.json({ ok: true }); });
app.get('/api/admin/overview', auth, async (req, res) => {
  const [total, active, bound, blacklisted, events] = await Promise.all([
    one('SELECT COUNT(*) AS count FROM keys_registry'), one("SELECT COUNT(*) AS count FROM keys_registry WHERE status='active' AND (expires_at IS NULL OR expires_at>?)", [now()]), one('SELECT COUNT(*) AS count FROM keys_registry WHERE hwid IS NOT NULL'), one('SELECT COUNT(*) AS count FROM hwid_blacklist'), query('SELECT id,key_id,action,reason,ip,hwid,actor,created_at FROM audit_logs ORDER BY created_at DESC LIMIT 40')
  ]); res.json({ ok: true, stats: { total: Number(total.count), active: Number(active.count), bound: Number(bound.count), blacklisted: Number(blacklisted.count) }, events });
});
app.get('/api/admin/keys', auth, async (req, res) => { const search = `%${text(req.query.search, 80)}%`, status = text(req.query.status, 20); const where = status ? 'WHERE (key_masked LIKE ? OR note LIKE ?) AND status=?' : 'WHERE key_masked LIKE ? OR note LIKE ?'; const params = status ? [search, search, status] : [search, search]; const keys = await query(`SELECT id,key_masked,hwid,user_id,status,expires_at,note,created_at,bound_at,created_by FROM keys_registry ${where} ORDER BY created_at DESC LIMIT 500`, params); res.json({ ok: true, keys }); });
app.post('/api/admin/keys', auth, mutation, async (req, res) => {
  const prefix = text(req.body?.prefix || 'KEY', 12).replace(/[^A-Za-z0-9_-]/g, '').toUpperCase() || 'KEY'; const expires = req.body?.expiresAt ? new Date(req.body.expiresAt) : null;
  if (expires && Number.isNaN(expires.getTime())) return jsonError(res, 400, 'Invalid expiry');
  const raw = randomKey(prefix), record = [id(), keyHash(raw), masked(raw), expires, text(req.body?.note, 500), now(), req.admin.username];
  await query('INSERT INTO keys_registry (id,key_hash,key_masked,expires_at,note,created_at,created_by) VALUES (?,?,?,?,?,?,?)', record); await audit({ keyId: record[0], action: 'key_created', reason: 'admin created key', req, actor: req.admin.username }); res.status(201).json({ ok: true, key: raw, record: { id: record[0], key_masked: record[2], expires_at: expires, note: record[4] } });
});
app.patch('/api/admin/keys/:id', auth, mutation, async (req, res) => { const status = text(req.body?.status, 20); if (status && !['active', 'disabled', 'revoked'].includes(status)) return jsonError(res, 400, 'Invalid status'); const key = await one('SELECT id FROM keys_registry WHERE id=?', [req.params.id]); if (!key) return jsonError(res, 404, 'Key not found'); await query('UPDATE keys_registry SET status=COALESCE(?,status),note=COALESCE(?,note),expires_at=COALESCE(?,expires_at) WHERE id=?', [status || null, req.body?.note === undefined ? null : text(req.body.note, 500), req.body?.expiresAt ? new Date(req.body.expiresAt) : null, req.params.id]); await audit({ keyId: req.params.id, action: 'key_updated', reason: status || 'metadata updated', req, actor: req.admin.username }); res.json({ ok: true }); });
app.delete('/api/admin/keys/:id', auth, mutation, async (req, res) => { const key = await one('SELECT id,key_masked FROM keys_registry WHERE id=?', [req.params.id]); if (!key) return jsonError(res, 404, 'Key not found'); await query('UPDATE keys_registry SET status=\'revoked\' WHERE id=?', [req.params.id]); await audit({ keyId: req.params.id, action: 'key_revoked', reason: 'admin removed key', req, actor: req.admin.username }); res.json({ ok: true }); });
app.post('/api/admin/keys/:id/reset-hwid', auth, mutation, async (req, res) => { const key = await one('SELECT id,hwid FROM keys_registry WHERE id=?', [req.params.id]); if (!key) return jsonError(res, 404, 'Key not found'); if (!key.hwid) return jsonError(res, 409, 'Key is not bound'); await query('UPDATE keys_registry SET hwid=NULL,user_id=NULL,bound_at=NULL,bound_ip=NULL WHERE id=?', [req.params.id]); await audit({ keyId: key.id, action: 'hwid_reset', reason: text(req.body?.reason || 'admin reset', 300), req, hwid: key.hwid, actor: req.admin.username }); res.json({ ok: true }); });
app.post('/api/admin/blacklist', auth, mutation, async (req, res) => { const hwid = text(req.body?.hwid, 256); if (hwid.length < 8) return jsonError(res, 400, 'Invalid HWID'); await query('INSERT INTO hwid_blacklist (hwid,reason,banned_by,created_at) VALUES (?,?,?,?) ON DUPLICATE KEY UPDATE reason=VALUES(reason),banned_by=VALUES(banned_by),created_at=VALUES(created_at)', [hwid, text(req.body?.reason || 'admin block', 300), req.admin.username, now()]); await audit({ action: 'hwid_blacklisted', reason: text(req.body?.reason || 'admin block', 300), req, hwid, actor: req.admin.username }); res.status(201).json({ ok: true }); });

app.post('/api/gate/start', clientLimit, async (req, res) => { const hwid = text(req.body?.hwid, 256), userId = text(req.body?.userId, 128); if (hwid.length < 8 || !userId) return jsonError(res, 400, 'hwid and userId are required'); if (await one('SELECT hwid FROM hwid_blacklist WHERE hwid=?', [hwid])) return jsonError(res, 403, 'HWID blacklisted'); const sessionId = id(), expires = new Date(Date.now() + 10 * 60 * 1000); await query('INSERT INTO gate_sessions (session_id,hwid,user_id,ip,created_at,expires_at) VALUES (?,?,?,?,?,?)', [sessionId, hwid, userId, clientIp(req), now(), expires]); res.json({ ok: true, sessionId, expiresAt: expires.toISOString(), next: 'Complete your link step, then call /api/gate/claim' }); });
app.post('/api/gate/claim', clientLimit, async (req, res) => {
  const sessionId = text(req.body?.sessionId, 80); if (!sessionId) return jsonError(res, 400, 'sessionId is required');
  try { const result = await transaction(async conn => { const [sessions] = await conn.execute('SELECT * FROM gate_sessions WHERE session_id=? AND ip=? FOR UPDATE', [sessionId, clientIp(req)]); const session = sessions[0]; if (!session || session.claimed_at || new Date(session.expires_at).getTime() < Date.now()) throw Object.assign(new Error('Invalid or expired gate session'), { status: 403 }); const [blocked] = await conn.execute('SELECT hwid FROM hwid_blacklist WHERE hwid=?', [session.hwid]); if (blocked[0]) throw Object.assign(new Error('HWID blacklisted'), { status: 403 }); const [existing] = await conn.execute('SELECT id,key_masked FROM keys_registry WHERE user_id=? LIMIT 1', [session.user_id]); if (existing[0]) throw Object.assign(new Error('This user already has a key'), { status: 409 }); const [keys] = await conn.execute("SELECT * FROM keys_registry WHERE status='active' AND hwid IS NULL AND user_id IS NULL AND (expires_at IS NULL OR expires_at>?) ORDER BY RAND() LIMIT 1 FOR UPDATE", [now()]); const key = keys[0]; if (!key) throw Object.assign(new Error('No available key'), { status: 404 }); await conn.execute('UPDATE keys_registry SET hwid=?,user_id=?,bound_at=?,bound_ip=? WHERE id=?', [session.hwid, session.user_id, now(), clientIp(req), key.id]); await conn.execute('UPDATE gate_sessions SET key_id=?,claimed_at=? WHERE session_id=?', [key.id, now(), sessionId]); return { keyId: key.id, keyMasked: key.key_masked, userId: session.user_id }; }); await audit({ keyId: result.keyId, action: 'key_claimed', reason: 'random gate claim', req, hwid: text(req.body?.hwid, 256) }); res.json({ ok: true, key: result.keyMasked, message: 'Key issued once. Keep it private.' }); } catch (e) { jsonError(res, e.status || 500, e.status ? e.message : 'Claim failed'); }
});
app.post('/api/client/validate', clientLimit, async (req, res) => {
  if (!hmacValid(req)) return jsonError(res, 401, 'Invalid signature'); const nonce = text(req.get('x-nonce'), 160); if (!(await reserveNonce(nonce))) return jsonError(res, 409, 'Replay detected');
  const { sessionId, key, hwid, userId } = req.body || {}; if (!sessionId || !key || !hwid || !userId) return jsonError(res, 400, 'sessionId, key, hwid and userId are required');
  const session = await one('SELECT * FROM gate_sessions WHERE session_id=?', [text(sessionId, 80)]); if (!session || session.ip !== clientIp(req) || session.hwid !== String(hwid) || session.user_id !== String(userId) || new Date(session.expires_at).getTime() < Date.now()) return jsonError(res, 403, 'Invalid or expired session');
  const keyRow = await one('SELECT * FROM keys_registry WHERE key_hash=?', [keyHash(key)]); if (!keyRow || keyRow.id !== session.key_id || keyRow.status !== 'active' || (keyRow.expires_at && new Date(keyRow.expires_at).getTime() < Date.now())) return jsonError(res, 403, 'Key inactive or expired'); if (await one('SELECT hwid FROM hwid_blacklist WHERE hwid=?', [hwid])) return jsonError(res, 403, 'HWID blacklisted');
  if (!same(keyRow.hwid, hwid) || !same(keyRow.user_id, userId)) { await audit({ keyId: keyRow.id, action: 'identity_mismatch', reason: 'HWID or userId mismatch', req, hwid }); return jsonError(res, 403, 'Identity mismatch'); }
  await query('UPDATE gate_sessions SET validated_at=? WHERE session_id=? AND validated_at IS NULL', [now(), session.session_id]); await audit({ keyId: keyRow.id, action: 'key_validated', reason: 'server validation success', req, hwid, actor: String(userId) }); res.set('Cache-Control', 'no-store'); res.json({ ok: true, valid: true, expiresAt: keyRow.expires_at ? new Date(keyRow.expires_at).toISOString() : null, loadScript: true });
});
app.use(express.static(path.join(__dirname, '../public'), { index: false, maxAge: 0 }));
app.get('/admin', (req, res) => res.sendFile(path.join(__dirname, '../public/admin.html')));
app.get('/', (req, res) => res.sendFile(path.join(__dirname, '../public/admin.html')));
app.use((err, req, res, next) => { console.error('request_error', err?.message); if (!res.headersSent) jsonError(res, 500, 'Internal server error'); });

let server;
async function start() { await migrate(); await seedAdmin(); server = app.listen(PORT, '0.0.0.0', () => console.log(`key-system listening on ${PORT}`)); setInterval(() => cleanup().catch(() => {}), 5 * 60 * 1000).unref(); }
start().catch(error => { console.error('startup_failed', error.message); process.exit(1); });
process.on('SIGTERM', async () => { if (server) server.close(); await pool.end(); });
export { app, pool };
