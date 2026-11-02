import { useMemo, useState } from "react";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import {
  Activity,
  AlertTriangle,
  ArrowUpRight,
  BarChart3,
  Check,
  CheckCircle2,
  ChevronDown,
  Clock3,
  Copy,
  Crown,
  Database,
  ExternalLink,
  Fingerprint,
  KeyRound,
  LayoutDashboard,
  LogIn,
  LogOut,
  Menu,
  MoreHorizontal,
  Plus,
  RefreshCw,
  Search,
  ShieldCheck,
  Sparkles,
  TerminalSquare,
  Trash2,
  UserRound,
  Users,
  X,
  Zap,
} from "lucide-react";
import { toast } from "sonner";

type StatusFilter = "all" | "unactivated" | "active" | "exhausted" | "expired" | "revoked";
type DashboardTab = "overview" | "keys" | "activity";

const statusMeta: Record<Exclude<StatusFilter, "all">, { label: string; tone: string; dot: string }> = {
  unactivated: { label: "Chưa kích hoạt", tone: "status-neutral", dot: "dot-neutral" },
  active: { label: "Đang hoạt động", tone: "status-active", dot: "dot-active" },
  exhausted: { label: "Hết lượt", tone: "status-warning", dot: "dot-warning" },
  expired: { label: "Hết hạn", tone: "status-danger", dot: "dot-danger" },
  revoked: { label: "Vô hiệu hóa", tone: "status-danger", dot: "dot-danger" },
};

function formatDate(value: Date | string | null | undefined, withTime = false) {
  if (!value) return "Không giới hạn";
  return new Intl.DateTimeFormat("vi-VN", withTime ? { dateStyle: "medium", timeStyle: "short" } : { dateStyle: "medium" }).format(new Date(value));
}

function getFingerprint() {
  const storageKey = "keyforge_fingerprint";
  try {
    const existing = localStorage.getItem(storageKey);
    if (existing) return existing;
    const generated = `browser-${crypto.randomUUID()}`;
    localStorage.setItem(storageKey, generated);
    return generated;
  } catch {
    return `browser-${crypto.randomUUID()}`;
  }
}

function StatusBadge({ status }: { status: string }) {
  const meta = statusMeta[status as Exclude<StatusFilter, "all">] ?? statusMeta.unactivated;
  return (
    <span className={`status-badge ${meta.tone}`}>
      <span className={`status-dot ${meta.dot}`} />
      {meta.label}
    </span>
  );
}

function Logo({ compact = false }: { compact?: boolean }) {
  return (
    <div className={`brand ${compact ? "brand-compact" : ""}`}>
      <span className="brand-mark"><KeyRound size={18} strokeWidth={2.4} /></span>
      {!compact && <span className="brand-wordmark">KEY<span>FORGE</span></span>}
    </div>
  );
}

function PublicActivation() {
  const [keyValue, setKeyValue] = useState("");
  const [result, setResult] = useState<{ ok: boolean; message: string; code?: string } | null>(null);
  const activation = trpc.keys.activate.useMutation({
    onSuccess: data => setResult(data),
    onError: error => setResult({ ok: false, message: error.message }),
  });
  const fingerprint = useMemo(getFingerprint, []);

  const submit = (event: React.FormEvent) => {
    event.preventDefault();
    if (!keyValue.trim()) return;
    setResult(null);
    activation.mutate({ key: keyValue.trim().toLowerCase(), fingerprint });
  };

  return (
    <section className="activation-card panel-glow">
      <div className="activation-card-head">
        <div>
          <div className="eyebrow"><span className="live-pip" /> PUBLIC ACTIVATION GATE</div>
          <h2>Unlock your access.</h2>
          <p>Nhập license key để xác thực quyền truy cập trên thiết bị này.</p>
        </div>
        <div className="activation-icon"><Fingerprint size={21} /></div>
      </div>
      <form onSubmit={submit} className="activation-form">
        <label className="field-label" htmlFor="license-key">LICENSE KEY</label>
        <div className="key-input-wrap">
          <KeyRound size={18} />
          <input id="license-key" value={keyValue} onChange={event => setKeyValue(event.target.value.toLowerCase().replace(/[^a-z0-9]/g, "").slice(0, 24))} placeholder="24 ký tự a-z / 0-9" maxLength={24} autoComplete="off" spellCheck={false} />
          <span className="input-hint">AES-256</span>
        </div>
        <Button type="submit" className="activate-button" disabled={activation.isPending || !keyValue.trim()}>
          {activation.isPending ? <RefreshCw size={16} className="spin" /> : <Zap size={16} />}
          {activation.isPending ? "Đang xác thực..." : "Activate key"}
          {!activation.isPending && <ArrowUpRight size={16} />}
        </Button>
      </form>
      {result && (
        <div className={`activation-result ${result.ok ? "result-success" : "result-error"}`}>
          {result.ok ? <CheckCircle2 size={18} /> : <AlertTriangle size={18} />}
          <div><strong>{result.ok ? "Access verified" : "Activation blocked"}</strong><span>{result.message}</span></div>
          <button className="icon-button" onClick={() => setResult(null)} aria-label="Đóng"><X size={15} /></button>
        </div>
      )}
      <div className="activation-footnote"><ShieldCheck size={14} /> Fingerprint thiết bị được lưu để ngăn kích hoạt trùng lặp.</div>
    </section>
  );
}

function AdminLoginPanel({ onClose }: { onClose: () => void }) {
  const [password, setPassword] = useState("");
  const login = trpc.admin.login.useMutation({
    onSuccess: () => window.location.reload(),
    onError: error => toast.error(error.message),
  });

  return <div className="modal-backdrop" onMouseDown={event => event.target === event.currentTarget && onClose()}><div className="modal-card admin-login-card">
    <div className="modal-head"><div><div className="eyebrow"><ShieldCheck size={13} /> SECURE ADMIN ACCESS</div><h2>Enter control room.</h2></div><button className="icon-button" onClick={onClose} aria-label="Đóng"><X size={18} /></button></div>
    <p className="modal-copy">Đăng nhập bằng admin pass key để quản lý license registry và audit trail.</p>
    <form className="form-stack" onSubmit={event => { event.preventDefault(); if (password) login.mutate({ password }); }}>
      <div><label className="field-label" htmlFor="admin-password">ADMIN PASS KEY</label><div className="key-input-wrap"><ShieldCheck size={17} /><input id="admin-password" autoFocus type="password" value={password} onChange={event => setPassword(event.target.value)} placeholder="Nhập mật khẩu admin" autoComplete="current-password" /></div></div>
      <Button type="submit" disabled={login.isPending || !password}><LogIn size={16} /> {login.isPending ? "Verifying..." : "Enter dashboard"}</Button>
    </form>
    <div className="activation-footnote"><ShieldCheck size={14} /> Session bảo mật, tự hết hạn sau 8 giờ.</div>
  </div></div>;
}

function PublicLanding() {
  const [showLogin, setShowLogin] = useState(false);
  return (
    <div className="public-page">
      <header className="public-nav shell-width">
        <Logo />
        <div className="nav-status"><span className="status-dot dot-active" /> SYSTEM OPERATIONAL</div>
        <button className="login-link" onClick={() => setShowLogin(true)}><LogIn size={15} /> Admin login</button>
      </header>
      <main className="public-main shell-width">
        <div className="public-hero">
          <div className="eyebrow"><Sparkles size={14} /> LICENSE INFRASTRUCTURE / 01</div>
          <h1>Access, <em>forged</em><br />with precision.</h1>
          <p className="hero-copy">Nền tảng cấp phép bảo mật cho những sản phẩm cần một lớp kiểm soát truy cập rõ ràng, nhanh và đáng tin cậy.</p>
          <div className="hero-actions"><a href="#activate" className="primary-link">Activate a key <ArrowUpRight size={16} /></a><span className="hero-note">Built for teams that ship.</span></div>
        </div>
        <div id="activate" className="public-grid">
          <PublicActivation />
          <div className="public-side-panel">
            <div className="side-kicker">WHY KEYFORGE</div>
            <div className="feature-list">
              <div className="feature-row"><span className="feature-number">01</span><div><strong>Instant validation</strong><p>Phản hồi key theo thời gian thực, không cần chờ đợi.</p></div></div>
              <div className="feature-row"><span className="feature-number">02</span><div><strong>Usage-aware</strong><p>Kiểm soát lượt dùng, thiết bị và thời hạn trong một nơi.</p></div></div>
              <div className="feature-row"><span className="feature-number">03</span><div><strong>Audit ready</strong><p>Mọi activation đều có dấu vết để bạn kiểm tra khi cần.</p></div></div>
            </div>
            <div className="system-card"><div className="system-card-top"><span>SECURITY CORE</span><ShieldCheck size={16} /></div><div className="security-line"><span>Edge validation</span><span className="text-green">ACTIVE</span></div><div className="security-line"><span>Encrypted storage</span><span className="text-green">AES-256</span></div><div className="security-line"><span>Audit trail</span><span className="text-green">ENABLED</span></div></div>
          </div>
        </div>
      </main>
      <footer className="public-footer shell-width"><span>© 2026 KEYFORGE SYSTEMS</span><span>SECURE ACCESS CONTROL <span className="footer-slash">/</span> v1.0.0</span></footer>
      {showLogin && <AdminLoginPanel onClose={() => setShowLogin(false)} />}
    </div>
  );
}

function StatCard({ label, value, detail, icon: Icon, accent = "violet" }: { label: string; value: string | number; detail: string; icon: typeof Activity; accent?: string }) {
  return <div className={`stat-card accent-${accent}`}><div className="stat-card-top"><span className="stat-label">{label}</span><span className="stat-icon"><Icon size={17} /></span></div><div className="stat-value">{value}</div><div className="stat-detail">{detail}</div></div>;
}

function CreateKeyPanel({ onClose, onCreated }: { onClose: () => void; onCreated: () => void }) {
  const [label, setLabel] = useState("");
  const [maxUses, setMaxUses] = useState("1");
  const [durationDays, setDurationDays] = useState("30");
  const create = trpc.keys.create.useMutation({
    onSuccess: key => {
      navigator.clipboard?.writeText(key.key);
      toast.success("Key mới đã được tạo và copy vào clipboard.");
      onCreated();
      onClose();
    },
    onError: error => toast.error(error.message),
  });
  return <div className="modal-backdrop" onMouseDown={event => event.target === event.currentTarget && onClose()}><div className="modal-card">
    <div className="modal-head"><div><div className="eyebrow">NEW LICENSE</div><h2>Forge a key</h2></div><button className="icon-button" onClick={onClose}><X size={18} /></button></div>
    <p className="modal-copy">Tạo một license key mới với chính sách sử dụng riêng.</p>
    <div className="form-stack"><div><label className="field-label">LABEL <span>OPTIONAL</span></label><input className="text-input" value={label} onChange={event => setLabel(event.target.value)} placeholder="Ví dụ: Pro launch / Client A" /></div><div className="form-grid"><div><label className="field-label">MAX USES</label><input className="text-input" type="number" min="1" value={maxUses} onChange={event => setMaxUses(event.target.value)} /></div><div><label className="field-label">EXPIRES IN <span>DAYS</span></label><input className="text-input" type="number" min="0" value={durationDays} onChange={event => setDurationDays(event.target.value)} /></div></div></div>
    <div className="modal-actions"><Button variant="outline" onClick={onClose}>Cancel</Button><Button onClick={() => create.mutate({ label: label || undefined, maxUses: Number(maxUses), durationDays: durationDays ? Number(durationDays) : null })} disabled={create.isPending}><Plus size={16} /> {create.isPending ? "Forging..." : "Create key"}</Button></div>
  </div></div>;
}

function EditKeyPanel({ keyData, onClose, onSaved }: { keyData: any; onClose: () => void; onSaved: () => void }) {
  const [label, setLabel] = useState(keyData.label ?? "");
  const [maxUses, setMaxUses] = useState(String(keyData.maxUses));
  const [expiresAt, setExpiresAt] = useState(keyData.expiresAt ? new Date(keyData.expiresAt).toISOString().slice(0, 10) : "");
  const update = trpc.keys.update.useMutation({ onSuccess: () => { toast.success("Đã cập nhật license key."); onSaved(); onClose(); }, onError: error => toast.error(error.message) });
  return <div className="modal-backdrop" onMouseDown={event => event.target === event.currentTarget && onClose()}><div className="modal-card">
    <div className="modal-head"><div><div className="eyebrow">EDIT LICENSE</div><h2>Refine policy</h2></div><button className="icon-button" onClick={onClose}><X size={18} /></button></div>
    <div className="edit-key-preview"><KeyRound size={15} /><code>{keyData.key}</code></div>
    <div className="form-stack"><div><label className="field-label">LABEL</label><input className="text-input" value={label} onChange={event => setLabel(event.target.value)} /></div><div className="form-grid"><div><label className="field-label">MAX USES</label><input className="text-input" type="number" min={keyData.usedCount || 1} value={maxUses} onChange={event => setMaxUses(event.target.value)} /></div><div><label className="field-label">EXPIRY DATE</label><input className="text-input" type="date" value={expiresAt} onChange={event => setExpiresAt(event.target.value)} /></div></div></div>
    <div className="modal-actions"><Button variant="outline" onClick={onClose}>Cancel</Button><Button onClick={() => update.mutate({ id: keyData.id, label: label || null, maxUses: Number(maxUses), expiresAt: expiresAt ? new Date(`${expiresAt}T23:59:59.000Z`).toISOString() : null })} disabled={update.isPending}><Check size={16} /> {update.isPending ? "Saving..." : "Save changes"}</Button></div>
  </div></div>;
}

function DashboardShell({ user }: { user: any }) {
  const [tab, setTab] = useState<DashboardTab>("overview");
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("all");
  const [showCreate, setShowCreate] = useState(false);
  const [editKey, setEditKey] = useState<any | null>(null);
  const [mobileNav, setMobileNav] = useState(false);
  const utils = trpc.useUtils();
  const isAdmin = user?.role === "admin";
  const summary = trpc.keys.summary.useQuery(undefined, { enabled: isAdmin, refetchInterval: 30000 });
  const keyList = trpc.keys.list.useQuery({ search: search || undefined, status: statusFilter === "all" ? undefined : statusFilter }, { enabled: isAdmin });
  const activations = trpc.keys.activations.useQuery(undefined, { enabled: isAdmin });
  const revoke = trpc.keys.revoke.useMutation({ onSuccess: () => { toast.success("Key đã bị vô hiệu hóa."); refresh(); }, onError: error => toast.error(error.message) });
  const unblacklist = trpc.keys.unblacklist.useMutation({ onSuccess: () => { toast.success("Đã unblacklist key."); refresh(); }, onError: error => toast.error(error.message) });
  const resetHwid = trpc.keys.resetHwid.useMutation({ onSuccess: () => { toast.success("Đã reset HWID và lượt redeem của key."); refresh(); }, onError: error => toast.error(error.message) });
  const remove = trpc.keys.remove.useMutation({ onSuccess: () => { toast.success("Đã xóa key và lịch sử activation."); refresh(); }, onError: error => toast.error(error.message) });
  const logout = trpc.auth.logout.useMutation({ onSuccess: () => window.location.reload() });
  const adminLogout = trpc.admin.logout.useMutation({ onSuccess: () => window.location.reload() });

  function refresh() { void utils.keys.list.invalidate(); void utils.keys.summary.invalidate(); void utils.keys.activations.invalidate(); }
  function handleLogout() { if (user?.loginMethod === "password") adminLogout.mutate(); else logout.mutate(); }
  function copyKey(value: string) { navigator.clipboard?.writeText(value); toast.success("Đã copy key."); }
  function confirmRevoke(key: any) { if (window.confirm(`Vô hiệu hóa ${key.key}?`)) revoke.mutate({ id: key.id }); }
  function confirmUnblacklist(key: any) { if (window.confirm(`Bỏ blacklist ${key.key}?`)) unblacklist.mutate({ id: key.id }); }
  function confirmResetHwid(key: any) { if (window.confirm(`Reset HWID và redeem của ${key.key}?`)) resetHwid.mutate({ id: key.id }); }
  function confirmRemove(key: any) { if (window.confirm(`Xóa vĩnh viễn ${key.key} và toàn bộ lịch sử?`)) remove.mutate({ id: key.id }); }

  if (!isAdmin) {
    return <div className="public-page"><header className="public-nav shell-width"><Logo /><div className="nav-status"><span className="status-dot dot-active" /> SIGNED IN</div><button className="login-link" onClick={handleLogout}><LogOut size={15} /> Log out</button></header><main className="public-main shell-width"><div className="access-denied"><div className="access-denied-icon"><Users size={25} /></div><div><div className="eyebrow">ADMIN ACCESS REQUIRED</div><h1>Workspace not provisioned.</h1><p>Tài khoản <strong>{user?.email || user?.name || "này"}</strong> đã đăng nhập nhưng chưa có quyền admin trong KeyForge.</p></div></div><PublicActivation /></main></div>;
  }

  const navItems: { id: DashboardTab; label: string; icon: typeof LayoutDashboard }[] = [{ id: "overview", label: "Overview", icon: LayoutDashboard }, { id: "keys", label: "License keys", icon: KeyRound }, { id: "activity", label: "Activity log", icon: Activity }];
  return <div className="app-shell">
    <aside className={`sidebar ${mobileNav ? "sidebar-open" : ""}`}><div className="sidebar-top"><Logo /><button className="mobile-close icon-button" onClick={() => setMobileNav(false)}><X size={17} /></button></div><div className="workspace-switch"><span className="workspace-avatar">K</span><div><strong>KeyForge Core</strong><span>Production workspace</span></div><ChevronDown size={15} /></div><nav className="side-nav"><span className="nav-section-label">WORKSPACE</span>{navItems.map(item => <button key={item.id} className={`side-nav-item ${tab === item.id ? "active" : ""}`} onClick={() => { setTab(item.id); setMobileNav(false); }}><item.icon size={17} /><span>{item.label}</span>{item.id === "activity" && <span className="nav-count">{activations.data?.length ?? 0}</span>}</button>)}</nav><div className="sidebar-bottom"><div className="security-mini"><ShieldCheck size={16} /><div><strong>Protected</strong><span>Role-based access</span></div></div><button className="account-row" onClick={handleLogout}><span className="user-avatar">{(user.name || user.email || "A").slice(0, 1).toUpperCase()}</span><span className="account-copy"><strong>{user.name || "Admin"}</strong><span>Administrator</span></span><LogOut size={15} /></button></div></aside>
    {mobileNav && <div className="mobile-nav-overlay" onClick={() => setMobileNav(false)} />}
    <main className="dashboard-main"><header className="dashboard-header"><div className="header-left"><button className="mobile-menu icon-button" onClick={() => setMobileNav(true)}><Menu size={19} /></button><div><div className="breadcrumb"><span>KeyForge</span><span>/</span><strong>{navItems.find(item => item.id === tab)?.label}</strong></div><h1>{tab === "overview" ? "Good evening, admin." : tab === "keys" ? "License keys" : "Activity log"}</h1></div></div><div className="header-actions"><div className="header-live"><span className="status-dot dot-active" /> API ONLINE</div><Button onClick={() => setShowCreate(true)}><Plus size={16} /> New key</Button></div></header>
      {tab === "overview" && <Overview summary={summary.data} activations={activations.data ?? []} onViewKeys={() => setTab("keys")} />}
      {tab === "keys" && <KeysView keys={keyList.data ?? []} search={search} setSearch={setSearch} statusFilter={statusFilter} setStatusFilter={setStatusFilter} onCopy={copyKey} onEdit={setEditKey} onRevoke={confirmRevoke} onUnblacklist={confirmUnblacklist} onResetHwid={confirmResetHwid} onRemove={confirmRemove} isLoading={keyList.isLoading} />}
      {tab === "activity" && <ActivityView activations={activations.data ?? []} keys={keyList.data ?? []} />}
    </main>
    {showCreate && <CreateKeyPanel onClose={() => setShowCreate(false)} onCreated={refresh} />}
    {editKey && <EditKeyPanel keyData={editKey} onClose={() => setEditKey(null)} onSaved={refresh} />}
  </div>;
}

function Overview({ summary, activations, onViewKeys }: { summary: any; activations: any[]; onViewKeys: () => void }) {
  const stats = summary?.byStatus ?? { unactivated: 0, active: 0, exhausted: 0, expired: 0, revoked: 0 };
  return <div className="content-wrap"><div className="overview-intro"><div><div className="eyebrow">SYSTEM OVERVIEW <span className="eyebrow-line" /></div><p>Toàn cảnh license infrastructure của bạn, cập nhật theo thời gian thực.</p></div><div className="date-stamp"><Clock3 size={14} /> {new Intl.DateTimeFormat("vi-VN", { dateStyle: "full" }).format(new Date())}</div></div><div className="stats-grid"><StatCard label="TOTAL KEYS" value={summary?.total ?? "—"} detail={`${stats.active} đang active`} icon={KeyRound} accent="violet" /><StatCard label="ACTIVATIONS" value={summary?.totalUses ?? "—"} detail={`${summary?.activationRate ?? 0}% capacity used`} icon={Zap} accent="blue" /><StatCard label="AVAILABLE" value={stats.unactivated + stats.active} detail="Ready to serve" icon={CheckCircle2} accent="green" /><StatCard label="ATTENTION" value={stats.expired + stats.revoked} detail={`${stats.expired} expired · ${stats.revoked} revoked`} icon={AlertTriangle} accent="orange" /></div><div className="overview-grid"><div className="panel distribution-panel"><div className="panel-header"><div><div className="panel-kicker">KEY DISTRIBUTION</div><h2>Health snapshot</h2></div><BarChart3 size={18} className="muted-icon" /></div><div className="distribution-visual"><div className="donut" style={{ "--active": `${summary?.total ? (stats.active / summary.total) * 100 : 0}%` } as React.CSSProperties}><div><strong>{summary?.total ?? 0}</strong><span>total keys</span></div></div><div className="distribution-list">{(["active", "unactivated", "exhausted", "expired", "revoked"] as const).map(key => <div className="distribution-row" key={key}><span className={`legend-dot ${statusMeta[key].dot}`} /><span>{statusMeta[key].label}</span><strong>{stats[key]}</strong></div>)}</div></div></div><div className="panel recent-panel"><div className="panel-header"><div><div className="panel-kicker">LATEST SIGNALS</div><h2>Recent activity</h2></div><button className="text-button" onClick={onViewKeys}>View keys <ArrowUpRight size={14} /></button></div>{activations.length === 0 ? <EmptyState icon={Activity} title="No activations yet" copy="Khi có activation đầu tiên, nó sẽ xuất hiện ở đây." /> : <div className="activity-list">{activations.slice(0, 5).map((activation: any) => <div className="activity-row" key={activation.id}><span className="activity-icon"><Zap size={14} /></span><div><strong>Key activation</strong><span>{activation.fingerprint.slice(0, 24)}...</span></div><time>{formatDate(activation.createdAt, true)}</time></div>)}</div>}</div></div><div className="bottom-callout"><div className="callout-icon"><TerminalSquare size={19} /></div><div><strong>Ready to ship with confidence?</strong><span>API endpoint, usage policy và audit trail đã được bật cho workspace này.</span></div><div className="callout-badge"><CheckCircle2 size={14} /> ALL SYSTEMS GO</div></div></div>;
}

function KeysView({ keys, search, setSearch, statusFilter, setStatusFilter, onCopy, onEdit, onRevoke, onUnblacklist, onResetHwid, onRemove, isLoading }: { keys: any[]; search: string; setSearch: (value: string) => void; statusFilter: StatusFilter; setStatusFilter: (value: StatusFilter) => void; onCopy: (value: string) => void; onEdit: (key: any) => void; onRevoke: (key: any) => void; onUnblacklist: (key: any) => void; onResetHwid: (key: any) => void; onRemove: (key: any) => void; isLoading: boolean }) {
  return <div className="content-wrap"><div className="page-toolbar"><div><div className="eyebrow">LICENSE REGISTRY</div><p>{keys.length} records trong workspace này.</p></div><div className="toolbar-controls"><div className="search-box"><Search size={16} /><input value={search} onChange={event => setSearch(event.target.value)} placeholder="Search keys..." /></div><select className="filter-select" value={statusFilter} onChange={event => setStatusFilter(event.target.value as StatusFilter)}><option value="all">All statuses</option><option value="unactivated">Chưa kích hoạt</option><option value="active">Đang hoạt động</option><option value="exhausted">Hết lượt</option><option value="expired">Hết hạn</option><option value="revoked">Vô hiệu hóa</option></select></div></div><div className="panel table-panel"><div className="table-scroll"><table className="data-table"><thead><tr><th>LICENSE</th><th>STATUS</th><th>USAGE</th><th>EXPIRES</th><th>CREATED</th><th className="align-right">ACTIONS</th></tr></thead><tbody>{isLoading ? <tr><td colSpan={6}><div className="table-loading"><RefreshCw className="spin" size={17} /> Loading registry...</div></td></tr> : keys.length === 0 ? <tr><td colSpan={6}><EmptyState icon={KeyRound} title="No keys found" copy="Thử một từ khóa khác hoặc tạo license key đầu tiên." /></td></tr> : keys.map(key => <tr key={key.id}><td><div className="license-cell"><span className="key-cell-icon"><KeyRound size={14} /></span><div><code>{key.key}</code><span>{key.label || "No label"}</span></div></div></td><td><StatusBadge status={key.status} /></td><td><div className="usage-cell"><div className="usage-label"><strong>{key.usedCount}</strong><span>/ {key.maxUses}</span></div><div className="usage-bar"><span style={{ width: `${Math.min(100, (key.usedCount / key.maxUses) * 100)}%` }} /></div></div></td><td><span className={key.expiresAt && new Date(key.expiresAt) < new Date() ? "text-danger" : "table-muted"}>{formatDate(key.expiresAt)}</span></td><td><span className="table-muted">{formatDate(key.createdAt)}</span></td><td><div className="row-actions"><button title="Copy key" className="row-action" onClick={() => onCopy(key.key)}><Copy size={15} /></button><button title="Edit key" className="row-action" onClick={() => onEdit(key)}><MoreHorizontal size={15} /></button>{key.status !== "revoked" ? <button title="Blacklist key" className="row-action danger" onClick={() => onRevoke(key)}><X size={15} /></button> : <button title="Unblacklist key" className="row-action" onClick={() => onUnblacklist(key)}><Check size={15} /></button>}<button title="Reset HWID" className="row-action" onClick={() => onResetHwid(key)}><RefreshCw size={15} /></button><button title="Delete key" className="row-action danger" onClick={() => onRemove(key)}><Trash2 size={15} /></button></div></td></tr>)}</tbody></table></div><div className="table-footer"><span><span className="status-dot dot-active" /> Data synced with managed database</span><span>Showing {keys.length} results</span></div></div></div>;
}

function ActivityView({ activations }: { activations: any[]; keys: any[] }) {
  return <div className="content-wrap"><div className="page-toolbar"><div><div className="eyebrow">AUDIT TRAIL</div><p>Toàn bộ hoạt động activation gần đây của hệ thống.</p></div><div className="toolbar-controls"><div className="header-live"><Activity size={14} /> LIVE STREAM</div></div></div><div className="panel activity-table-panel">{activations.length === 0 ? <EmptyState icon={Activity} title="No activity yet" copy="Activation events sẽ được ghi nhận tự động." /> : <div className="audit-list">{activations.map((activation: any) => <div className="audit-row" key={activation.id}><div className="audit-icon"><Zap size={15} /></div><div className="audit-main"><strong>License activated</strong><span>Fingerprint: <code>{activation.fingerprint}</code></span></div><div className="audit-meta"><span>{activation.ipAddress || "IP unavailable"}</span><time>{formatDate(activation.createdAt, true)}</time></div><span className="audit-check"><Check size={14} /></span></div>)}</div>}<div className="table-footer"><span><ShieldCheck size={14} /> Events are immutable once written</span><span>{activations.length} total events</span></div></div></div>;
}

function EmptyState({ icon: Icon, title, copy }: { icon: typeof Activity; title: string; copy: string }) {
  return <div className="empty-state"><span className="empty-icon"><Icon size={20} /></span><strong>{title}</strong><span>{copy}</span></div>;
}

export default function Home() {
  const { data: user, isLoading } = trpc.auth.me.useQuery();
  if (isLoading) return <div className="loading-screen"><Logo /><RefreshCw className="spin" size={18} /><span>Initializing secure workspace...</span></div>;
  if (user) return <DashboardShell user={user} />;
  return <PublicLanding />;
}
