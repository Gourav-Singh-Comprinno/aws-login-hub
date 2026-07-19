import { useEffect, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Plus, Search, Play, Edit2, Trash2, X, Loader2, Globe, Mail } from "lucide-react";
import { confirm } from "@tauri-apps/plugin-dialog";
import { api } from "../services/api";
import type { Client, CreateClientRequest } from "../types";

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
    setLoginProgress({ id: client.id, message: "Opening browser..." });
    try {
      const password = await api.getClientPassword(client.id);
      await api.runLogin(client.identity_center_url, client.email, password, client.id, client.name);
      setLoginProgress({ id: client.id, message: "Browser opened ✓" });
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
        <div className="text-center py-16 text-zinc-500">Loading...</div>
      ) : clients.length === 0 ? (
        <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="glass-card text-center py-16">
          <p className="text-zinc-400 text-lg font-medium">No clients found</p>
          <p className="text-zinc-600 text-sm mt-1">Add your first AWS Identity Center client</p>
          <motion.button whileHover={{ scale: 1.02 }} onClick={() => setShowAddForm(true)} className="btn-accent mt-5">+ Add Client</motion.button>
        </motion.div>
      ) : (
        <div className="space-y-3">
          {clients.map((client, i) => (
            <motion.div key={client.id} initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.03 }}
              className="solid-card flex items-center gap-5 !p-5 group hover:border-[#FF9900]/20 hover:shadow-lg hover:shadow-orange-500/5">
              {/* Avatar */}
              <div className="w-11 h-11 rounded-xl bg-gradient-to-br from-[#FF9900]/15 to-[#FF6B4A]/5 border border-[#FF9900]/20 flex items-center justify-center text-sm font-bold text-[#FF9900] flex-shrink-0">
                {client.name.charAt(0).toUpperCase()}
              </div>

              {/* Info */}
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-3">
                  <h3 className="font-semibold text-white text-[15px] truncate">{client.name}</h3>
                  <SessionDot lastLogin={client.last_login} />
                  {client.environment && <span className="premium-badge bg-purple-500/10 text-purple-400 border border-purple-500/20">{client.environment}</span>}
                </div>
                <div className="flex items-center gap-4 mt-1.5">
                  <span className="flex items-center gap-1.5 text-[12px] text-zinc-500"><Mail size={11} />{client.email}</span>
                  {client.last_login && <span className="text-[11px] text-zinc-600">{new Date(client.last_login).toLocaleDateString()}</span>}
                </div>
              </div>

              {/* Login Progress */}
              {loginProgress?.id === client.id && (
                <div className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-blue-500/10 border border-blue-500/20">
                  {!loginProgress.message.includes("✓") && !loginProgress.message.includes("Failed") && <Loader2 size={13} className="animate-spin text-blue-400" />}
                  <span className={`text-[11px] font-medium ${loginProgress.message.includes("Failed") || loginProgress.message.includes("Error") ? "text-red-400" : loginProgress.message.includes("✓") ? "text-green-400" : "text-blue-400"}`}>
                    {loginProgress.message}
                  </span>
                </div>
              )}

              {/* Actions */}
              <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                <button onClick={() => handleLogin(client)} disabled={!!loginProgress} className="p-2.5 text-green-400 hover:bg-green-400/10 rounded-lg transition-all disabled:opacity-30">
                  <Play size={15} />
                </button>
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
// Premium Form Modal
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
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="fixed inset-0 bg-black/80 backdrop-blur-sm flex items-center justify-center z-50 p-6">
      <motion.div initial={{ scale: 0.95, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} exit={{ scale: 0.95, opacity: 0 }} transition={{ duration: 0.2 }}
        className="w-full max-w-lg bg-[#111] border border-white/[0.08] rounded-2xl overflow-hidden shadow-2xl">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-5 border-b border-white/[0.06]">
          <h3 className="text-lg font-semibold text-white">{client ? "Edit Client" : "Add Client"}</h3>
          <button onClick={onClose} className="p-2 text-zinc-500 hover:text-white hover:bg-white/5 rounded-lg transition-all"><X size={18} /></button>
        </div>

        {/* Form */}
        <form onSubmit={handleSubmit} className="p-6 space-y-4 max-h-[70vh] overflow-auto">
          {error && <div className="p-3 rounded-xl bg-red-500/10 border border-red-500/20 text-sm text-red-400">{error}</div>}

          <Field label="Client Name" placeholder="e.g., Netflix Production" value={form.name} onChange={v => setForm({...form, name: v})} />
          <Field label="Identity Center URL" placeholder="https://d-xxxxxxxxxx.awsapps.com/start" value={form.identity_center_url} onChange={v => setForm({...form, identity_center_url: v})} icon={<Globe size={14} />} />
          <Field label="Email" placeholder="user@company.com" type="email" value={form.email} onChange={v => setForm({...form, email: v})} icon={<Mail size={14} />} />
          <Field label={client ? "Password (leave empty to keep)" : "Password"} placeholder="••••••••" type="password" value={form.password} onChange={v => setForm({...form, password: v})} />

          <div className="grid grid-cols-3 gap-3">
            <Field label="SSO Region" placeholder="us-east-1" value={form.sso_region || ""} onChange={v => setForm({...form, sso_region: v})} />
            <Field label="Account ID" placeholder="123456789012" value={form.sso_account_id || ""} onChange={v => setForm({...form, sso_account_id: v})} />
            <Field label="Role Name" placeholder="AdministratorAccess" value={form.sso_role_name || ""} onChange={v => setForm({...form, sso_role_name: v})} />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="text-[11px] font-medium text-zinc-400 uppercase tracking-wider mb-2 block">Environment</label>
              <select className="premium-input" value={form.environment} onChange={e => setForm({...form, environment: e.target.value})}>
                <option value="">Select...</option>
                <option value="Production">Production</option>
                <option value="Development">Development</option>
                <option value="Staging">Staging</option>
                <option value="UAT">UAT</option>
                <option value="Sandbox">Sandbox</option>
              </select>
            </div>
            <Field label="Tags" placeholder="aws, prod" value={form.tags || ""} onChange={v => setForm({...form, tags: v})} />
          </div>

          <div>
            <label className="text-[11px] font-medium text-zinc-400 uppercase tracking-wider mb-2 block">Notes</label>
            <textarea className="premium-input resize-none" rows={2} placeholder="Optional notes..." value={form.notes} onChange={e => setForm({...form, notes: e.target.value})} />
          </div>

          <div className="flex gap-3 pt-3">
            <button type="button" onClick={onClose} className="btn-glass flex-1">Cancel</button>
            <motion.button whileHover={{ scale: 1.01 }} whileTap={{ scale: 0.99 }} type="submit" disabled={saving} className="btn-accent flex-1">
              {saving ? "Saving..." : client ? "Update" : "Add Client"}
            </motion.button>
          </div>
        </form>
      </motion.div>
    </motion.div>
  );
}

function Field({ label, placeholder, value, onChange, type = "text", icon }: { label: string; placeholder: string; value: string; onChange: (v: string) => void; type?: string; icon?: React.ReactNode }) {
  return (
    <div>
      <label className="text-[11px] font-medium text-zinc-400 uppercase tracking-wider mb-2 block">{label}</label>
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
