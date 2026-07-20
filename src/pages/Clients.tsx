import { useEffect, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Plus, Search, Play, Edit2, Trash2, X, Loader2, Globe, Mail, Cloud, Shield, Server, Key, CheckCircle2, AlertCircle, MapPin } from "lucide-react";
import { confirm } from "@tauri-apps/plugin-dialog";
import { api } from "../services/api";
import type { Client, CreateClientRequest } from "../types";

// Helper to extract domain from identity_center_url
function extractDomain(url: string): string {
  try {
    const parsed = new URL(url);
    return parsed.hostname;
  } catch {
    return url.replace(/^https?:\/\//, "").split("/")[0];
  }
}

// Login progress steps
const LOGIN_STEPS = [
  { label: "Starting", key: "Starting" },
  { label: "Connecting", key: "login" },
  { label: "Authenticating", key: "SSO" },
  { label: "Complete", key: "complete" },
];

function getLoginStepIndex(message: string): number {
  if (message.includes("✓") || message.includes("complete")) return 3;
  if (message.includes("SSO") || message.includes("Authenticat")) return 2;
  if (message.includes("login") || message.includes("Connect") || message.includes("Browser")) return 1;
  return 0;
}

export default function Clients() {
  const [clients, setClients] = useState<Client[]>([]);
  const [searchQuery, setSearchQuery] = useState("");
  const [showAddForm, setShowAddForm] = useState(false);
  const [editingClient, setEditingClient] = useState<Client | null>(null);
  const [loginProgress, setLoginProgress] = useState<{ id: string; message: string } | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => { loadClients(); }, []);
  useEffect(() => { const t = setTimeout(loadClients, 300); return () => clearTimeout(t); }, [searchQuery]);

  async function loadClients() {
    try { setClients(searchQuery ? await api.searchClients(searchQuery) : await api.getClients()); }
    catch (e) { console.error(e); }
    finally { setLoading(false); }
  }

  async function handleDelete(id: string, name: string) {
    const confirmed = await confirm(
      `Delete "${name}"?\nThis removes all stored credentials permanently.`,
      { title: "Confirm Delete", kind: "warning" }
    );
    if (!confirmed) return;
    await api.deleteClient(id); loadClients();
  }

  async function handleLogin(client: Client) {
    setLoginProgress({ id: client.id, message: "Starting SSO login..." });
    try {
      const password = await api.getClientPassword(client.id);
      await api.runLoginSso(
        client.identity_center_url,
        client.email,
        password,
        client.sso_region || "us-east-1",
        client.name,
        client.id
      );
      setLoginProgress({ id: client.id, message: "SSO login complete ✓" });
      await api.updateLastLogin(client.id);
      setTimeout(() => setLoginProgress(null), 3000);
      loadClients();
    } catch (err) {
      setLoginProgress({ id: client.id, message: String(err) });
      setTimeout(() => setLoginProgress(null), 5000);
    }
  }

  return (
    <div className="p-8 h-full overflow-auto">
      {/* Header */}
      <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-3xl font-bold text-white tracking-tight">Clients</h1>
          <p className="text-zinc-500 text-sm mt-1">{clients.length} configured</p>
        </div>
        <div className="flex items-center gap-3">
          <motion.button whileHover={{ scale: 1.02 }} whileTap={{ scale: 0.98 }} onClick={() => setShowAddForm(true)} className="btn-accent flex items-center gap-2 text-[13px]">
            <Plus size={16} /> Add Client
          </motion.button>
        </div>
      </motion.div>

      {/* Search */}
      <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.1 }} className="relative mb-6">
        <Search className="absolute left-4 top-3.5 text-zinc-500" size={16} />
        <input type="text" placeholder="Search clients, emails, tags..." value={searchQuery} onChange={e => setSearchQuery(e.target.value)}
          className="premium-input pl-11" />
      </motion.div>

      {/* Client List */}
      {loading ? (
        <SkeletonCards />
      ) : clients.length === 0 ? (
        <EmptyState onAdd={() => setShowAddForm(true)} hasSearch={!!searchQuery} />
      ) : (
        <div className="space-y-3">
          {clients.map((client, i) => (
            <motion.div key={client.id} initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.03 }}
              className="client-card solid-card flex items-center gap-5 !p-5">
              {/* Avatar */}
              <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-[#FF9900]/15 to-[#FF6B4A]/5 border border-[#FF9900]/20 flex items-center justify-center text-sm font-bold text-[#FF9900] flex-shrink-0">
                {client.name.charAt(0).toUpperCase()}
              </div>

              {/* Info */}
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-3">
                  <h3 className="font-semibold text-white text-[15px] truncate">{client.name}</h3>
                  <SessionDot lastLogin={client.last_login} />
                  {client.environment && <span className="premium-badge bg-purple-500/10 text-purple-400 border border-purple-500/20">{client.environment}</span>}
                  {client.sso_region && (
                    <span className="premium-badge bg-blue-500/10 text-blue-400 border border-blue-500/20 flex items-center gap-1">
                      <MapPin size={9} />
                      {client.sso_region}
                    </span>
                  )}
                </div>
                <div className="flex items-center gap-4 mt-1.5">
                  <span className="flex items-center gap-1.5 text-[12px] text-zinc-500"><Mail size={11} />{client.email}</span>
                  <span className="flex items-center gap-1.5 text-[12px] text-zinc-600"><Globe size={11} />{extractDomain(client.identity_center_url)}</span>
                  {client.last_login && <span className="text-[11px] text-zinc-600">{new Date(client.last_login).toLocaleDateString()}</span>}
                </div>
              </div>

              {/* Login Progress */}
              {loginProgress?.id === client.id && (
                <LoginProgressIndicator message={loginProgress.message} />
              )}

              {/* Actions - always visible */}
              <div className="flex items-center gap-1">
                <motion.button
                  whileHover={{ scale: 1.05 }}
                  whileTap={{ scale: 0.95 }}
                  onClick={() => handleLogin(client)}
                  disabled={!!loginProgress}
                  className="login-btn-pulse flex items-center gap-1.5 px-3.5 py-2 bg-green-500/10 hover:bg-green-500/20 border border-green-500/20 hover:border-green-500/40 text-green-400 rounded-lg transition-all disabled:opacity-30 disabled:cursor-not-allowed text-[12px] font-medium"
                >
                  <Play size={13} fill="currentColor" />
                  Login
                </motion.button>
                <button onClick={() => setEditingClient(client)} className="p-2.5 text-zinc-500 hover:text-white hover:bg-white/5 rounded-lg transition-all">
                  <Edit2 size={15} />
                </button>
                <button onClick={() => handleDelete(client.id, client.name)} className="p-2.5 text-zinc-600 hover:text-red-400 hover:bg-red-400/5 rounded-lg transition-all">
                  <Trash2 size={15} />
                </button>
              </div>
            </motion.div>
          ))}
        </div>
      )}

      {/* Modal */}
      <AnimatePresence>
        {(showAddForm || editingClient) && (
          <ClientFormModal client={editingClient} onClose={() => { setShowAddForm(false); setEditingClient(null); }} onSaved={() => { setShowAddForm(false); setEditingClient(null); loadClients(); }} />
        )}
      </AnimatePresence>
    </div>
  );
}

// ============================================================
// Login Progress Indicator with Steps
// ============================================================

function LoginProgressIndicator({ message }: { message: string }) {
  const isError = message.includes("Failed") || message.includes("Error") || message.includes("error");
  const isComplete = message.includes("✓") || message.includes("complete");
  const stepIndex = getLoginStepIndex(message);

  if (isError) {
    return (
      <div className="flex items-center gap-2 px-3 py-2 rounded-lg bg-red-500/10 border border-red-500/20">
        <AlertCircle size={13} className="text-red-400" />
        <span className="text-[11px] font-medium text-red-400 max-w-[180px] truncate">{message}</span>
      </div>
    );
  }

  return (
    <div className="flex items-center gap-3 px-4 py-2.5 rounded-xl bg-gradient-to-r from-blue-500/5 to-green-500/5 border border-blue-500/15">
      <div className="flex items-center gap-1">
        {LOGIN_STEPS.map((step, i) => (
          <div key={step.key} className="flex items-center">
            <div className={`w-2 h-2 rounded-full transition-all duration-300 ${
              i < stepIndex ? "bg-green-400" :
              i === stepIndex ? (isComplete ? "bg-green-400" : "bg-blue-400 animate-pulse") :
              "bg-zinc-700"
            }`} />
            {i < LOGIN_STEPS.length - 1 && (
              <div className={`w-4 h-[1.5px] mx-0.5 transition-all duration-300 ${
                i < stepIndex ? "bg-green-400/50" : "bg-zinc-700/50"
              }`} />
            )}
          </div>
        ))}
      </div>
      <span className={`text-[11px] font-medium ${isComplete ? "text-green-400" : "text-blue-400"}`}>
        {isComplete ? "Done!" : LOGIN_STEPS[stepIndex]?.label}
      </span>
      {!isComplete && <Loader2 size={11} className="animate-spin text-blue-400" />}
      {isComplete && <CheckCircle2 size={11} className="text-green-400" />}
    </div>
  );
}

// ============================================================
// Skeleton Loading State
// ============================================================

function SkeletonCards() {
  return (
    <div className="space-y-3">
      {[1, 2, 3].map((i) => (
        <div key={i} className="solid-card !p-5 flex items-center gap-5">
          <div className="w-12 h-12 rounded-xl bg-zinc-800 shimmer" />
          <div className="flex-1 space-y-2.5">
            <div className="flex items-center gap-3">
              <div className="h-4 w-32 rounded-md bg-zinc-800 shimmer" />
              <div className="h-4 w-16 rounded-full bg-zinc-800 shimmer" />
            </div>
            <div className="flex items-center gap-4">
              <div className="h-3 w-40 rounded-md bg-zinc-800/60 shimmer" />
              <div className="h-3 w-28 rounded-md bg-zinc-800/60 shimmer" />
            </div>
          </div>
          <div className="flex items-center gap-1">
            <div className="w-16 h-8 rounded-lg bg-zinc-800 shimmer" />
            <div className="w-8 h-8 rounded-lg bg-zinc-800/60 shimmer" />
            <div className="w-8 h-8 rounded-lg bg-zinc-800/60 shimmer" />
          </div>
        </div>
      ))}
    </div>
  );
}

// ============================================================
// Empty State with Icon Composition
// ============================================================

function EmptyState({ onAdd, hasSearch }: { onAdd: () => void; hasSearch: boolean }) {
  return (
    <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} className="glass-card text-center py-20">
      {/* Icon composition */}
      <div className="relative w-28 h-28 mx-auto mb-6">
        <motion.div
          initial={{ scale: 0 }}
          animate={{ scale: 1 }}
          transition={{ delay: 0.1, type: "spring", stiffness: 200 }}
          className="absolute inset-0 rounded-2xl bg-gradient-to-br from-[#FF9900]/10 to-transparent border border-[#FF9900]/10 flex items-center justify-center"
        >
          <Cloud size={36} className="text-[#FF9900]/40" />
        </motion.div>
        <motion.div
          initial={{ scale: 0 }}
          animate={{ scale: 1 }}
          transition={{ delay: 0.2, type: "spring", stiffness: 200 }}
          className="absolute -top-2 -right-2 w-10 h-10 rounded-xl bg-blue-500/10 border border-blue-500/20 flex items-center justify-center"
        >
          <Shield size={16} className="text-blue-400" />
        </motion.div>
        <motion.div
          initial={{ scale: 0 }}
          animate={{ scale: 1 }}
          transition={{ delay: 0.3, type: "spring", stiffness: 200 }}
          className="absolute -bottom-2 -left-2 w-10 h-10 rounded-xl bg-green-500/10 border border-green-500/20 flex items-center justify-center"
        >
          <Key size={16} className="text-green-400" />
        </motion.div>
        <motion.div
          initial={{ scale: 0 }}
          animate={{ scale: 1 }}
          transition={{ delay: 0.4, type: "spring", stiffness: 200 }}
          className="absolute -bottom-1 -right-3 w-9 h-9 rounded-lg bg-purple-500/10 border border-purple-500/20 flex items-center justify-center"
        >
          <Server size={14} className="text-purple-400" />
        </motion.div>
      </div>

      {hasSearch ? (
        <>
          <p className="text-zinc-400 text-lg font-medium">No matches found</p>
          <p className="text-zinc-600 text-sm mt-1.5">Try a different search query</p>
        </>
      ) : (
        <>
          <p className="text-zinc-300 text-lg font-semibold">No clients configured</p>
          <p className="text-zinc-600 text-sm mt-1.5 max-w-xs mx-auto">Add your first AWS Identity Center client to get started with one-click login</p>
          <motion.button whileHover={{ scale: 1.02 }} whileTap={{ scale: 0.98 }} onClick={onAdd} className="btn-accent mt-6 inline-flex items-center gap-2">
            <Plus size={16} /> Add Your First Client
          </motion.button>
        </>
      )}
    </motion.div>
  );
}

// ============================================================
// Premium Form Modal with Step Indicator
// ============================================================

function ClientFormModal({ client, onClose, onSaved }: { client: Client | null; onClose: () => void; onSaved: () => void }) {
  const [form, setForm] = useState<CreateClientRequest>({
    name: client?.name ?? "", identity_center_url: client?.identity_center_url ?? "",
    email: client?.email ?? "", password: "",
    sso_region: client?.sso_region ?? "us-east-1",
    sso_account_id: client?.sso_account_id ?? "",
    sso_role_name: client?.sso_role_name ?? "",
    notes: client?.notes ?? "",
    tags: client?.tags ?? "", environment: client?.environment ?? "",
  });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  // Calculate field completion for step indicator
  const requiredFields = [
    { label: "Name", done: !!form.name },
    { label: "URL", done: !!form.identity_center_url },
    { label: "Email", done: !!form.email },
    { label: "Password", done: !!form.password || !!client },
    { label: "Region", done: !!form.sso_region },
  ];
  const completedCount = requiredFields.filter(f => f.done).length;

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault(); setError("");
    if (!form.name || !form.identity_center_url || !form.email) { setError("Name, URL, and Email required"); return; }
    if (!client && !form.password) { setError("Password required"); return; }
    setSaving(true);
    try {
      if (client) {
        const u: Record<string, string | undefined> = {};
        if (form.name !== client.name) u.name = form.name;
        if (form.identity_center_url !== client.identity_center_url) u.identity_center_url = form.identity_center_url;
        if (form.email !== client.email) u.email = form.email;
        if (form.password) u.password = form.password;
        if ((form.sso_region || "") !== (client.sso_region || "")) u.sso_region = form.sso_region;
        if ((form.sso_account_id || "") !== (client.sso_account_id || "")) u.sso_account_id = form.sso_account_id;
        if ((form.sso_role_name || "") !== (client.sso_role_name || "")) u.sso_role_name = form.sso_role_name;
        if (form.notes !== client.notes) u.notes = form.notes;
        if (form.tags !== client.tags) u.tags = form.tags;
        if (form.environment !== client.environment) u.environment = form.environment;
        await api.updateClient(client.id, u);
      } else { await api.createClient(form); }
      onSaved();
    } catch (err) { setError(String(err)); }
    setSaving(false);
  }

  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="fixed inset-0 bg-black/80 backdrop-blur-sm flex items-center justify-center z-50 p-6" onClick={onClose}>
      <motion.div initial={{ scale: 0.95, opacity: 0, y: 10 }} animate={{ scale: 1, opacity: 1, y: 0 }} exit={{ scale: 0.95, opacity: 0, y: 10 }} transition={{ duration: 0.2, ease: "easeOut" }}
        className="w-full max-w-lg bg-[#111] border border-white/[0.08] rounded-2xl overflow-hidden shadow-2xl" onClick={e => e.stopPropagation()}>
        {/* Header */}
        <div className="px-6 py-5 border-b border-white/[0.06]">
          <div className="flex items-center justify-between">
            <div>
              <h3 className="text-lg font-semibold text-white">{client ? "Edit Client" : "Add New Client"}</h3>
              <p className="text-[12px] text-zinc-500 mt-0.5">
                {client ? "Update client configuration" : "Configure your AWS Identity Center login"}
              </p>
            </div>
            <button onClick={onClose} className="p-2 text-zinc-500 hover:text-white hover:bg-white/5 rounded-lg transition-all"><X size={18} /></button>
          </div>

          {/* Step indicator */}
          {!client && (
            <div className="mt-4 flex items-center gap-2">
              {requiredFields.map((field, i) => (
                <div key={field.label} className="flex items-center gap-2">
                  <div className="flex items-center gap-1.5">
                    <div className={`w-2 h-2 rounded-full transition-all duration-200 ${field.done ? "bg-[#FF9900]" : "bg-zinc-700"}`} />
                    <span className={`text-[10px] font-medium transition-colors duration-200 ${field.done ? "text-zinc-300" : "text-zinc-600"}`}>{field.label}</span>
                  </div>
                  {i < requiredFields.length - 1 && <div className="w-3 h-[1px] bg-zinc-800" />}
                </div>
              ))}
              <span className="ml-auto text-[10px] text-zinc-600">{completedCount}/{requiredFields.length}</span>
            </div>
          )}
        </div>

        {/* Form */}
        <form onSubmit={handleSubmit} className="p-6 space-y-5 max-h-[70vh] overflow-auto">
          {error && (
            <motion.div initial={{ opacity: 0, y: -5 }} animate={{ opacity: 1, y: 0 }} className="flex items-center gap-2.5 p-3.5 rounded-xl bg-red-500/10 border border-red-500/20">
              <AlertCircle size={14} className="text-red-400 flex-shrink-0" />
              <span className="text-sm text-red-400">{error}</span>
            </motion.div>
          )}

          <Field label="Client Name" placeholder="e.g., Netflix Production" value={form.name} onChange={v => setForm({...form, name: v})} required />
          <Field label="Identity Center URL" placeholder="https://d-xxxxxxxxxx.awsapps.com/start" value={form.identity_center_url} onChange={v => setForm({...form, identity_center_url: v})} icon={<Globe size={14} />} required />
          <Field label="Email" placeholder="user@company.com" type="email" value={form.email} onChange={v => setForm({...form, email: v})} icon={<Mail size={14} />} required />
          <Field label={client ? "Password (leave empty to keep)" : "Password"} placeholder="••••••••" type="password" value={form.password} onChange={v => setForm({...form, password: v})} required={!client} />
          <div>
            <label className="text-[11px] font-medium text-zinc-400 uppercase tracking-wider mb-2 block">SSO Region</label>
            <select className="premium-input" value={form.sso_region || "us-east-1"} onChange={e => setForm({...form, sso_region: e.target.value})}>
              <optgroup label="US East">
                <option value="us-east-1">US East (N. Virginia) — us-east-1</option>
                <option value="us-east-2">US East (Ohio) — us-east-2</option>
              </optgroup>
              <optgroup label="US West">
                <option value="us-west-1">US West (N. California) — us-west-1</option>
                <option value="us-west-2">US West (Oregon) — us-west-2</option>
              </optgroup>
              <optgroup label="Asia Pacific">
                <option value="ap-south-1">Asia Pacific (Mumbai) — ap-south-1</option>
                <option value="ap-south-2">Asia Pacific (Hyderabad) — ap-south-2</option>
                <option value="ap-southeast-1">Asia Pacific (Singapore) — ap-southeast-1</option>
                <option value="ap-southeast-2">Asia Pacific (Sydney) — ap-southeast-2</option>
                <option value="ap-southeast-3">Asia Pacific (Jakarta) — ap-southeast-3</option>
                <option value="ap-southeast-4">Asia Pacific (Melbourne) — ap-southeast-4</option>
                <option value="ap-northeast-1">Asia Pacific (Tokyo) — ap-northeast-1</option>
                <option value="ap-northeast-2">Asia Pacific (Seoul) — ap-northeast-2</option>
                <option value="ap-northeast-3">Asia Pacific (Osaka) — ap-northeast-3</option>
                <option value="ap-east-1">Asia Pacific (Hong Kong) — ap-east-1</option>
              </optgroup>
              <optgroup label="Europe">
                <option value="eu-west-1">Europe (Ireland) — eu-west-1</option>
                <option value="eu-west-2">Europe (London) — eu-west-2</option>
                <option value="eu-west-3">Europe (Paris) — eu-west-3</option>
                <option value="eu-central-1">Europe (Frankfurt) — eu-central-1</option>
                <option value="eu-central-2">Europe (Zurich) — eu-central-2</option>
                <option value="eu-north-1">Europe (Stockholm) — eu-north-1</option>
                <option value="eu-south-1">Europe (Milan) — eu-south-1</option>
                <option value="eu-south-2">Europe (Spain) — eu-south-2</option>
              </optgroup>
              <optgroup label="Canada">
                <option value="ca-central-1">Canada (Central) — ca-central-1</option>
                <option value="ca-west-1">Canada (Calgary) — ca-west-1</option>
              </optgroup>
              <optgroup label="South America">
                <option value="sa-east-1">South America (São Paulo) — sa-east-1</option>
              </optgroup>
              <optgroup label="Middle East">
                <option value="me-south-1">Middle East (Bahrain) — me-south-1</option>
                <option value="me-central-1">Middle East (UAE) — me-central-1</option>
              </optgroup>
              <optgroup label="Africa">
                <option value="af-south-1">Africa (Cape Town) — af-south-1</option>
              </optgroup>
              <optgroup label="Israel">
                <option value="il-central-1">Israel (Tel Aviv) — il-central-1</option>
              </optgroup>
            </select>
          </div>

          <div className="flex gap-3 pt-4">
            <button type="button" onClick={onClose} className="btn-glass flex-1">Cancel</button>
            <motion.button whileHover={{ scale: 1.01 }} whileTap={{ scale: 0.99 }} type="submit" disabled={saving} className="btn-accent flex-1 flex items-center justify-center gap-2">
              {saving && <Loader2 size={14} className="animate-spin" />}
              {saving ? "Saving..." : client ? "Update Client" : "Add Client"}
            </motion.button>
          </div>
        </form>
      </motion.div>
    </motion.div>
  );
}

function Field({ label, placeholder, value, onChange, type = "text", icon, required }: { label: string; placeholder: string; value: string; onChange: (v: string) => void; type?: string; icon?: React.ReactNode; required?: boolean }) {
  return (
    <div>
      <label className="text-[11px] font-medium text-zinc-400 uppercase tracking-wider mb-2 flex items-center gap-1">
        {label}
        {required && <span className="text-[#FF9900]">*</span>}
      </label>
      <div className="relative">
        {icon && <span className="absolute left-4 top-3.5 text-zinc-600">{icon}</span>}
        <input type={type} className={`premium-input ${icon ? "pl-10" : ""}`} placeholder={placeholder} value={value} onChange={e => onChange(e.target.value)} />
      </div>
    </div>
  );
}

function SessionDot({ lastLogin }: { lastLogin: string | null }) {
  if (!lastLogin) return <span className="premium-badge bg-zinc-800 text-zinc-500 border border-zinc-700">Never</span>;

  const loginTime = new Date(lastLogin).getTime();
  const elapsed = Date.now() - loginTime;
  const oneHour = 60 * 60 * 1000;

  if (elapsed < oneHour) {
    return (
      <span className="flex items-center gap-1.5">
        <div className="status-dot bg-green-400" />
        <span className="text-[11px] text-green-400 font-medium">Active</span>
      </span>
    );
  }
  return (
    <span className="flex items-center gap-1.5">
      <div className="w-2 h-2 rounded-full bg-zinc-600" />
      <span className="text-[11px] text-zinc-500">Expired</span>
    </span>
  );
}
