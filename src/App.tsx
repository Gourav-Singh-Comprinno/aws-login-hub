import { useState, useEffect, useRef } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { LayoutDashboard, Users, Star, Clock, Settings, Shield, Lock, Zap, Terminal as TermIcon, Download } from "lucide-react";
import { check } from "@tauri-apps/plugin-updater";
import { relaunch } from "@tauri-apps/plugin-process";
import type { Page } from "./types";
import { api, type UserInfo } from "./services/api";
import Dashboard from "./pages/Dashboard";
import Clients from "./pages/Clients";
import Favorites from "./pages/Favorites";
import Recent from "./pages/Recent";
import Terminal from "./pages/Terminal";
import SettingsPage from "./pages/Settings";

function App() {
  const [unlocked, setUnlocked] = useState(false);
  const [currentUser, setCurrentUser] = useState<UserInfo | null>(null);
  const [currentPage, setCurrentPage] = useState<Page>("dashboard");
  const lastActivityRef = useRef(Date.now());
  const [updateAvailable, setUpdateAvailable] = useState<{ version: string; body: string } | null>(null);
  const [updating, setUpdating] = useState(false);

  // Check for updates on startup
  useEffect(() => {
    checkForUpdates();
  }, []);

  async function checkForUpdates() {
    try {
      const update = await check();
      if (update) {
        setUpdateAvailable({ version: update.version, body: update.body || "" });
      }
    } catch (e) {
      console.log("Update check failed:", e);
    }
  }

  async function handleUpdate() {
    setUpdating(true);
    try {
      const update = await check();
      if (update) {
        await update.downloadAndInstall();
        await relaunch();
      }
    } catch (e) {
      console.error("Update failed:", e);
      setUpdating(false);
    }
  }

  useEffect(() => {
    const checkIdle = setInterval(() => {
      if (unlocked && Date.now() - lastActivityRef.current > 15 * 60 * 1000) {
        api.lockVault().then(() => {
          setUnlocked(false);
          setCurrentUser(null);
          setCurrentPage("dashboard");
        });
      }
    }, 30000);
    return () => clearInterval(checkIdle);
  }, [unlocked]);

  useEffect(() => {
    const reset = () => { lastActivityRef.current = Date.now(); };
    window.addEventListener("mousemove", reset);
    window.addEventListener("keydown", reset);
    return () => { window.removeEventListener("mousemove", reset); window.removeEventListener("keydown", reset); };
  }, []);

  const handleUnlock = async (user: UserInfo) => {
    setCurrentUser(user);
    setUnlocked(true);
    lastActivityRef.current = Date.now();
    // Refresh password expiry marker
    api.refreshPasswordExpiry().catch(() => {});
  };
  const handleLock = async () => { await api.lockVault(); setUnlocked(false); setCurrentUser(null); setCurrentPage("dashboard"); };

  if (!unlocked) return <UnlockScreen onUnlock={handleUnlock} />;

  const navItems: { id: Page; label: string; icon: React.ReactNode }[] = [
    { id: "dashboard", label: "Dashboard", icon: <LayoutDashboard size={18} /> },
    { id: "clients", label: "Clients", icon: <Users size={18} /> },
    { id: "favorites", label: "Favorites", icon: <Star size={18} /> },
    { id: "recent", label: "Recent", icon: <Clock size={18} /> },
    { id: "terminal", label: "Terminal", icon: <TermIcon size={18} /> },
    { id: "settings", label: "Settings", icon: <Settings size={18} /> },
  ];

  return (
    <div className="flex flex-col h-screen w-screen overflow-hidden">
      {/* Update Banner */}
      <AnimatePresence>
        {updateAvailable && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            className="bg-gradient-to-r from-[#FF9900]/10 to-[#FF6B4A]/10 border-b border-[#FF9900]/20 px-4 py-2.5 flex items-center justify-center gap-3"
          >
            <Download size={14} className="text-[#FF9900]" />
            <span className="text-[12px] text-zinc-300">
              <strong className="text-[#FF9900]">v{updateAvailable.version}</strong> is available
            </span>
            <motion.button
              whileHover={{ scale: 1.02 }}
              whileTap={{ scale: 0.98 }}
              onClick={handleUpdate}
              disabled={updating}
              className="px-3 py-1 rounded-lg bg-[#FF9900]/20 border border-[#FF9900]/30 text-[11px] font-medium text-[#FF9900] hover:bg-[#FF9900]/30 transition-colors disabled:opacity-50"
            >
              {updating ? "Updating..." : "Update Now"}
            </motion.button>
            <button onClick={() => setUpdateAvailable(null)} className="text-zinc-500 hover:text-zinc-300 text-[11px] ml-2">
              Later
            </button>
          </motion.div>
        )}
      </AnimatePresence>

      <div className="flex flex-1 overflow-hidden">
      {/* Premium Sidebar */}
      <aside className="w-[220px] min-w-[220px] sidebar flex flex-col h-full overflow-hidden">
        <div className="p-5 pb-6">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-[#FF9900] to-[#FF6B4A] flex items-center justify-center shadow-lg shadow-orange-500/20">
              <Shield size={18} className="text-black" />
            </div>
            <div>
              <h1 className="text-[13px] font-bold text-white tracking-tight">AWS Login Hub</h1>
              <p className="text-[10px] text-zinc-500 font-medium">Secure • Encrypted</p>
            </div>
          </div>
        </div>

        <nav className="flex-1 px-3 space-y-1">
          {navItems.map((item) => (
            <motion.button
              key={item.id}
              whileHover={{ x: 2 }}
              whileTap={{ scale: 0.98 }}
              onClick={() => setCurrentPage(item.id)}
              className={`sidebar-item w-full ${currentPage === item.id ? "sidebar-item-active" : ""}`}
            >
              {item.icon}
              {item.label}
            </motion.button>
          ))}
        </nav>

        <div className="p-4 m-3 mt-0 rounded-xl bg-gradient-to-br from-white/[0.03] to-transparent border border-white/[0.06]">
          <div className="flex items-center gap-3 mb-3">
            <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-[#FF9900]/20 to-[#FF6B4A]/20 flex items-center justify-center text-xs font-bold text-[#FF9900]">
              {currentUser?.display_name?.charAt(0).toUpperCase()}
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-[12px] font-medium text-white truncate">{currentUser?.display_name}</p>
              <p className="text-[10px] text-zinc-500">@{currentUser?.username}</p>
            </div>
          </div>
          <button onClick={handleLock} className="w-full flex items-center justify-center gap-2 py-2 rounded-lg text-[11px] font-medium text-zinc-400 hover:text-red-400 hover:bg-red-500/5 border border-transparent hover:border-red-500/20 transition-all">
            <Lock size={12} /> Lock Vault
          </button>
        </div>
      </aside>

      {/* Main Content */}
      <main className="flex-1 overflow-auto bg-[#000] h-full">
        <AnimatePresence mode="wait">
          <motion.div
            key={currentPage}
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -8 }}
            transition={{ duration: 0.2, ease: "easeOut" }}
            className="h-full overflow-auto"
          >
            {currentPage === "dashboard" && <Dashboard onNavigate={setCurrentPage} />}
            {currentPage === "clients" && <Clients />}
            {currentPage === "favorites" && <Favorites />}
            {currentPage === "recent" && <Recent />}
            {currentPage === "terminal" && <Terminal />}
            {currentPage === "settings" && <SettingsPage currentUser={currentUser} onLock={handleLock} />}
          </motion.div>
        </AnimatePresence>
      </main>
      </div>
    </div>
  );
}

// ============================================================
// Premium Unlock Screen
// ============================================================

function UnlockScreen({ onUnlock }: { onUnlock: (user: UserInfo) => void }) {
  const [users, setUsers] = useState<UserInfo[]>([]);
  const [selectedUser, setSelectedUser] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [showCreate, setShowCreate] = useState(false);
  const [initialLoading, setInitialLoading] = useState(true);

  useEffect(() => { loadUsers(); }, []);

  async function loadUsers() {
    try {
      const u = await api.getUsers();
      setUsers(u);
      if (u.length === 0) setShowCreate(true);
      else setSelectedUser(u[0].username);
    } catch (e) { console.error(e); }
    finally { setInitialLoading(false); }
  }

  async function handleUnlock(e: React.FormEvent) {
    e.preventDefault();
    setError(""); setLoading(true);
    try {
      const user = await api.unlockVault(selectedUser, password);
      // Check if password has expired (2 weeks) — still allow access but refresh the marker
      const expired = await api.checkPasswordExpiry().catch(() => false);
      if (expired) {
        // Password re-verified successfully during unlock — just refresh the marker
        await api.refreshPasswordExpiry().catch(() => {});
      }
      await api.refreshPasswordExpiry().catch(() => {});
      setPassword(""); onUnlock(user);
    } catch (err) { setError(String(err)); }
    setLoading(false);
  }

  if (initialLoading) return <div className="flex items-center justify-center h-screen bg-black"><motion.div animate={{ opacity: [0.3, 1, 0.3] }} transition={{ duration: 1.5, repeat: Infinity }} className="text-zinc-500 text-sm">Loading...</motion.div></div>;
  if (showCreate) return <CreateUserScreen onCreated={() => { setShowCreate(false); loadUsers(); }} onBack={users.length > 0 ? () => setShowCreate(false) : undefined} />;

  return (
    <div className="flex items-center justify-center h-screen bg-black animated-bg">
      <motion.div initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }} transition={{ duration: 0.4, ease: "easeOut" }} className="w-full max-w-[380px] px-6 relative z-10">
        {/* Logo */}
        <div className="text-center mb-10">
          <motion.div initial={{ y: -20 }} animate={{ y: 0 }} className="inline-flex p-4 rounded-2xl bg-gradient-to-br from-[#FF9900]/10 to-[#FF6B4A]/5 border border-[#FF9900]/20 mb-5 glow-accent">
            <Shield className="text-[#FF9900]" size={36} />
          </motion.div>
          <h1 className="text-2xl font-bold text-white tracking-tight">AWS Login Hub</h1>
          <p className="text-sm text-zinc-500 mt-2">Unlock your encrypted vault</p>
        </div>

        {/* Form */}
        <form onSubmit={handleUnlock} className="space-y-5">
          <AnimatePresence>
            {error && (
              <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: "auto" }} exit={{ opacity: 0, height: 0 }}
                className="p-3 rounded-xl bg-red-500/10 border border-red-500/20 text-sm text-red-400 text-center">{error}</motion.div>
            )}
          </AnimatePresence>

          <div>
            <label className="text-[11px] font-medium text-zinc-400 uppercase tracking-wider mb-2 block">Profile</label>
            <select className="premium-input" value={selectedUser} onChange={e => setSelectedUser(e.target.value)}>
              {users.map(u => <option key={u.username} value={u.username}>{u.display_name} (@{u.username})</option>)}
            </select>
          </div>

          <div>
            <label className="text-[11px] font-medium text-zinc-400 uppercase tracking-wider mb-2 block">Master Password</label>
            <input type="password" className="premium-input" placeholder="••••••••••" value={password} onChange={e => setPassword(e.target.value)} autoFocus />
          </div>

          <motion.button whileHover={{ scale: 1.01 }} whileTap={{ scale: 0.99 }} type="submit" disabled={loading || !password} className="btn-accent w-full">
            {loading ? "Decrypting..." : "Unlock Vault"}
          </motion.button>

          <button type="button" onClick={() => setShowCreate(true)} className="w-full text-center text-[12px] text-zinc-500 hover:text-zinc-300 transition-colors py-2">
            + Create New Profile
          </button>
        </form>

        <p className="text-[10px] text-zinc-600 text-center mt-8">AES-256-GCM • Argon2id • Zero-Knowledge</p>
      </motion.div>
    </div>
  );
}

// ============================================================
// Create User Screen
// ============================================================

function CreateUserScreen({ onCreated, onBack }: { onCreated: () => void; onBack?: () => void }) {
  const [username, setUsername] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault(); setError("");
    if (password !== confirmPassword) { setError("Passwords don't match"); return; }
    if (password.length < 6) { setError("Minimum 6 characters"); return; }
    if (!username.trim()) { setError("Username is required"); return; }
    setLoading(true);
    try { await api.createUser(username.trim().toLowerCase(), displayName || username, password); onCreated(); }
    catch (err) { setError(String(err)); }
    setLoading(false);
  }

  return (
    <div className="flex items-center justify-center h-screen bg-black animated-bg">
      <motion.div initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }} transition={{ duration: 0.4 }} className="w-full max-w-[380px] px-6 relative z-10">
        <div className="text-center mb-8">
          <motion.div initial={{ rotate: -10 }} animate={{ rotate: 0 }} className="inline-flex p-4 rounded-2xl bg-gradient-to-br from-green-500/10 to-emerald-500/5 border border-green-500/20 mb-5">
            <Zap className="text-green-400" size={32} />
          </motion.div>
          <h1 className="text-2xl font-bold text-white">Create Profile</h1>
          <p className="text-sm text-zinc-500 mt-2">Your vault will be encrypted locally</p>
        </div>

        <form onSubmit={handleCreate} className="space-y-4">
          {error && <div className="p-3 rounded-xl bg-red-500/10 border border-red-500/20 text-sm text-red-400">{error}</div>}
          <div>
            <label className="text-[11px] font-medium text-zinc-400 uppercase tracking-wider mb-2 block">Username</label>
            <input className="premium-input" placeholder="e.g., gourav" value={username} onChange={e => setUsername(e.target.value)} />
          </div>
          <div>
            <label className="text-[11px] font-medium text-zinc-400 uppercase tracking-wider mb-2 block">Display Name</label>
            <input className="premium-input" placeholder="e.g., Gourav Singh" value={displayName} onChange={e => setDisplayName(e.target.value)} />
          </div>
          <div>
            <label className="text-[11px] font-medium text-zinc-400 uppercase tracking-wider mb-2 block">Master Password</label>
            <input type="password" className="premium-input" placeholder="Min 6 characters" value={password} onChange={e => setPassword(e.target.value)} />
          </div>
          <div>
            <label className="text-[11px] font-medium text-zinc-400 uppercase tracking-wider mb-2 block">Confirm Password</label>
            <input type="password" className="premium-input" placeholder="••••••••••" value={confirmPassword} onChange={e => setConfirmPassword(e.target.value)} />
          </div>
          <motion.button whileHover={{ scale: 1.01 }} whileTap={{ scale: 0.99 }} type="submit" disabled={loading} className="btn-accent w-full">
            {loading ? "Creating..." : "Create Encrypted Vault"}
          </motion.button>
          {onBack && <button type="button" onClick={onBack} className="w-full text-center text-[12px] text-zinc-500 hover:text-zinc-300 py-2">← Back</button>}
        </form>
      </motion.div>
    </div>
  );
}

export default App;
