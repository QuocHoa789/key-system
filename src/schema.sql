CREATE TABLE IF NOT EXISTS keys (id TEXT PRIMARY KEY, key_hash TEXT NOT NULL UNIQUE, key_masked TEXT NOT NULL, hwid TEXT, hwid_bound_at TEXT, hwid_bound_ip TEXT, user_id TEXT, status TEXT NOT NULL DEFAULT 'active', expires_at TEXT, created_at TEXT NOT NULL, created_by TEXT NOT NULL, note TEXT);
CREATE TABLE IF NOT EXISTS hwid_history (id TEXT PRIMARY KEY, key_id TEXT NOT NULL, old_hwid TEXT, new_hwid TEXT, action TEXT NOT NULL, ip TEXT, admin_user TEXT, ts TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS logs (id TEXT PRIMARY KEY, key_id TEXT, action TEXT NOT NULL, reason TEXT, ip TEXT, hwid TEXT, ts TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS gate_sessions (session_id TEXT PRIMARY KEY, ip TEXT NOT NULL, hwid TEXT NOT NULL, step TEXT NOT NULL, completed INTEGER NOT NULL DEFAULT 0, issued_key TEXT, created_at TEXT NOT NULL, expires_at TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS admins (id TEXT PRIMARY KEY, username TEXT NOT NULL UNIQUE, password_hash TEXT NOT NULL, role TEXT NOT NULL DEFAULT 'admin', created_at TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS hwid_blacklist (hwid TEXT PRIMARY KEY, reason TEXT NOT NULL, banned_by TEXT NOT NULL, ts TEXT NOT NULL);
CREATE INDEX IF NOT EXISTS idx_keys_hash ON keys(key_hash); CREATE INDEX IF NOT EXISTS idx_keys_hwid ON keys(hwid); CREATE INDEX IF NOT EXISTS idx_logs_key ON logs(key_id); CREATE INDEX IF NOT EXISTS idx_gate_ip ON gate_sessions(ip);
