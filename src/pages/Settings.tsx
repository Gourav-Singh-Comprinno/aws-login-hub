import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Shield, Info, Lock, Key, Download, Upload, Clock, ChevronRight, CheckCircle2 } from "lucide-react";
import { save, open } from "@tauri-apps/plugin-dialog";
import { api, type UserInfo } from "../services/api";

interface SettingsProps {
  currentUser: UserInfo | null;
  onLock: () => void;
}

export default function SettingsPage({ currentUser, onLock }: SettingsProps) {
  const [showPasswordChange, setShowPasswordChange] = useState(false);
  const [currentPw, setCurrentPw] = useState("");
  const [newPw, setNewPw] = useState("");
  const [confirmPw, setConfirmPw] = useState("");
  const [pwError, setPwError] = useState("");
  const [pwSuccess, setPwSuccess] = useState("");
  const [changing, setChanging] = useState(false);
  const [timeoutHrs, setTimeoutHrs] = useState(localStorage.getItem("vault_timeout_hrs") || "2");

  function handleTimeoutChange(value: string) {
    setTimeoutHrs(value);
    localStorage.setItem("vault_timeout_hrs", value);
    window.dispatchEvent(new Event("vault-timeout-changed"));
  }

  async function handleChangePassword(e: React.FormEvent) {
    e.preventDefault();
    setPwError(""); setPwSuccess("");
    if (newPw !== confirmPw) { setPwError("Passwords don't match"); return; }
    if (newPw.length < 6) { setPwError("Minimum 6 characters"); return; }
    setChanging(true);
    try {
      await api.changeMasterPassword(currentUser!.username, currentPw, newPw);
      setPwSuccess("Master password changed successfully");
      setCurrentPw(""); setNewPw(""); setConfirmPw("");
      setTimeout(() => { setShowPasswordChange(false); setPwSuccess(""); }, 2000);
    } catch (err) { setPwError(String(err)); }
    setChanging(false);
  }

  return (
    <div className="p-8 h-full overflow-auto">
      {/* Header */}
      <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="mb-8">
        <h1 className="text-3xl font-bold text-white tracking-tight">Settings</h1>
        <p className="text-zinc-500 text-sm mt-1">Profile, security & preferences</p>
      </motion.div>

      <div className="space-y-6 max-w-2xl">
        {/* Profile Card */}
        <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.05 }}
          className="solid-card !p-0 overflow-hidden">
          <div className="px-6 py-4 border-b border-white/[0.06] flex items-center gap-3">
            <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-[#FF9900]/20 to-[#FF6B4A]/10 flex items-center justify-center">
              <Shield size={16} className="text-[#FF9900]" />
            </div>
            <h3 className="text-[14px] font-semibold text-white">Profile</h3>
          </div>
          <div className="p-6">
            <div className="flex items-center gap-4">
              <div className="w-14 h-14 rounded-xl bg-gradient-to-br from-[#FF9900]/20 to-[#FF6B4A]/10 border border-[#FF9900]/20 flex items-center justify-center text-xl font-bold text-[#FF9900]">
                {currentUser?.display_name?.charAt(0).toUpperCase()}
              </div>
              <div className="flex-1">
                <p className="text-[16px] font-semibold text-white">{currentUser?.display_name}</p>
                <p className="text-[13px] text-zinc-500">@{currentUser?.username}</p>
              </div>
              <span className="px-3 py-1.5 rounded-lg bg-green-500/10 border border-green-500/20 text-[11px] font-medium text-green-400">
                Active
              </span>
            </div>

            <div className="grid grid-cols-2 gap-3 mt-5">
              <div className="p-3 rounded-xl bg-white/[0.02] border border-white/[0.06]">
                <p className="text-[11px] text-zinc-500 uppercase tracking-wider">Encryption</p>
                <p className="text-[13px] text-white mt-1 font-medium">AES-256-GCM</p>
              </div>
              <div className="p-3 rounded-xl bg-white/[0.02] border border-white/[0.06]">
                <p className="text-[11px] text-zinc-500 uppercase tracking-wider">Key Derivation</p>
                <p className="text-[13px] text-white mt-1 font-medium">Argon2id</p>
              </div>
            </div>
          </div>
        </motion.div>

        {/* Security Card */}
        <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.1 }}
          className="solid-card !p-0 overflow-hidden">
          <div className="px-6 py-4 border-b border-white/[0.06] flex items-center gap-3">
            <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-blue-500/20 to-cyan-500/10 flex items-center justify-center">
              <Key size={16} className="text-blue-400" />
            </div>
            <h3 className="text-[14px] font-semibold text-white">Security</h3>
          </div>
          <div className="p-6 space-y-4">
            {/* Auto-Lock Timeout */}
            <div className="flex items-center justify-between p-4 rounded-xl bg-white/[0.02] border border-white/[0.06]">
              <div className="flex items-center gap-3">
                <div className="w-9 h-9 rounded-lg bg-orange-500/10 flex items-center justify-center">
                  <Clock size={16} className="text-orange-400" />
                </div>
                <div>
                  <p className="text-[13px] font-medium text-white">Auto-Lock Timeout</p>
                  <p className="text-[11px] text-zinc-500">Lock vault after inactivity</p>
                </div>
              </div>
              <div className="flex items-center gap-1.5">
                {["1", "2", "8", "10"].map(h => (
                  <button
                    key={h}
                    onClick={() => handleTimeoutChange(h)}
                    className={`px-3 py-1.5 rounded-lg text-[12px] font-medium transition-all ${
                      timeoutHrs === h
                        ? "bg-[#FF9900]/20 border border-[#FF9900]/40 text-[#FF9900]"
                        : "bg-white/[0.03] border border-white/[0.06] text-zinc-400 hover:text-white hover:border-white/[0.12]"
                    }`}
                  >
                    {h}h
                  </button>
                ))}
              </div>
            </div>

            {/* Change Password */}
            <div className="rounded-xl bg-white/[0.02] border border-white/[0.06] overflow-hidden">
              <button
                onClick={() => setShowPasswordChange(!showPasswordChange)}
                className="w-full flex items-center justify-between p-4 hover:bg-white/[0.02] transition-colors"
              >
                <div className="flex items-center gap-3">
                  <div className="w-9 h-9 rounded-lg bg-purple-500/10 flex items-center justify-center">
                    <Key size={16} className="text-purple-400" />
                  </div>
                  <div className="text-left">
                    <p className="text-[13px] font-medium text-white">Change Master Password</p>
                    <p className="text-[11px] text-zinc-500">Re-encrypts vault with new key</p>
                  </div>
                </div>
                <ChevronRight size={16} className={`text-zinc-500 transition-transform ${showPasswordChange ? "rotate-90" : ""}`} />
              </button>

              <AnimatePresence>
                {showPasswordChange && (
                  <motion.form
                    initial={{ height: 0, opacity: 0 }}
                    animate={{ height: "auto", opacity: 1 }}
                    exit={{ height: 0, opacity: 0 }}
                    transition={{ duration: 0.2 }}
                    onSubmit={handleChangePassword}
                    className="px-4 pb-4 space-y-3 border-t border-white/[0.04]"
                  >
                    <div className="pt-4">
                      {pwError && <div className="p-3 mb-3 rounded-lg bg-red-500/10 border border-red-500/20 text-[12px] text-red-400">{pwError}</div>}
                      {pwSuccess && <div className="p-3 mb-3 rounded-lg bg-green-500/10 border border-green-500/20 text-[12px] text-green-400 flex items-center gap-2"><CheckCircle2 size={14} />{pwSuccess}</div>}
                      <input type="password" className="premium-input mb-3" placeholder="Current password" value={currentPw} onChange={e => setCurrentPw(e.target.value)} />
                      <input type="password" className="premium-input mb-3" placeholder="New password (min 6 characters)" value={newPw} onChange={e => setNewPw(e.target.value)} />
                      <input type="password" className="premium-input mb-3" placeholder="Confirm new password" value={confirmPw} onChange={e => setConfirmPw(e.target.value)} />
                      <motion.button whileHover={{ scale: 1.01 }} whileTap={{ scale: 0.99 }} type="submit" disabled={changing} className="btn-accent w-full !py-3 text-[13px]">
                        {changing ? "Changing..." : "Update Password"}
                      </motion.button>
                    </div>
                  </motion.form>
                )}
              </AnimatePresence>
            </div>

            {/* Export & Import */}
            <div className="grid grid-cols-2 gap-3">
              <ExportSection />
              <ImportSection />
            </div>

            {/* Lock Vault */}
            <motion.button
              whileHover={{ scale: 1.01 }}
              whileTap={{ scale: 0.99 }}
              onClick={onLock}
              className="w-full flex items-center justify-center gap-2 p-4 rounded-xl bg-red-500/5 border border-red-500/15 hover:bg-red-500/10 hover:border-red-500/30 transition-all"
            >
              <Lock size={16} className="text-red-400" />
              <span className="text-[13px] font-medium text-red-400">Lock Vault Now</span>
            </motion.button>
          </div>
        </motion.div>

        {/* About Card */}
        <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.15 }}
          className="solid-card !p-0 overflow-hidden">
          <div className="px-6 py-4 border-b border-white/[0.06] flex items-center gap-3">
            <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-zinc-500/20 to-zinc-600/10 flex items-center justify-center">
              <Info size={16} className="text-zinc-400" />
            </div>
            <h3 className="text-[14px] font-semibold text-white">About</h3>
          </div>
          <div className="p-6">
            <div className="grid grid-cols-3 gap-3">
              <div className="p-3 rounded-xl bg-white/[0.02] border border-white/[0.06] text-center">
                <p className="text-[11px] text-zinc-500 uppercase tracking-wider">Version</p>
                <p className="text-[14px] text-white mt-1 font-semibold">1.8.0</p>
              </div>
              <div className="p-3 rounded-xl bg-white/[0.02] border border-white/[0.06] text-center">
                <p className="text-[11px] text-zinc-500 uppercase tracking-wider">Platform</p>
                <p className="text-[14px] text-white mt-1 font-semibold">Cross-OS</p>
              </div>
              <div className="p-3 rounded-xl bg-white/[0.02] border border-white/[0.06] text-center">
                <p className="text-[11px] text-zinc-500 uppercase tracking-wider">Storage</p>
                <p className="text-[14px] text-white mt-1 font-semibold">Local Only</p>
              </div>
            </div>
            <p className="text-[11px] text-zinc-600 text-center mt-4">
              Zero network calls • Each user has an isolated encrypted vault • Keys zeroed from memory on lock
            </p>
          </div>
        </motion.div>
      </div>
    </div>
  );
}

// ============================================================
// Export Section
// ============================================================

function ExportSection() {
  const [msg, setMsg] = useState("");
  const [exporting, setExporting] = useState(false);

  async function handleExport() {
    setMsg("");
    setExporting(true);
    try {
      const filePath = await save({
        title: "Export Vault Backup",
        defaultPath: `vault-backup-${new Date().toISOString().slice(0, 10)}.vault-backup`,
        filters: [{ name: "Vault Backup", extensions: ["vault-backup"] }],
      });
      if (!filePath) { setExporting(false); return; }
      const result = await api.exportVault(filePath);
      setMsg(`✓ ${(result.size / 1024).toFixed(1)} KB`);
      setTimeout(() => setMsg(""), 3000);
    } catch (err) { setMsg(`✗ Failed`); }
    setExporting(false);
  }

  return (
    <motion.button
      whileHover={{ scale: 1.02 }}
      whileTap={{ scale: 0.98 }}
      onClick={handleExport}
      disabled={exporting}
      className="flex flex-col items-center gap-2 p-4 rounded-xl bg-white/[0.02] border border-white/[0.06] hover:border-blue-500/20 hover:bg-blue-500/5 transition-all disabled:opacity-50"
    >
      <div className="w-10 h-10 rounded-lg bg-blue-500/10 flex items-center justify-center">
        <Download size={18} className="text-blue-400" />
      </div>
      <span className="text-[12px] font-medium text-white">{exporting ? "Exporting..." : "Export Vault"}</span>
      {msg && <span className={`text-[10px] ${msg.includes("✓") ? "text-green-400" : "text-red-400"}`}>{msg}</span>}
    </motion.button>
  );
}

// ============================================================
// Import Section
// ============================================================

function ImportSection() {
  const [showImport, setShowImport] = useState(false);
  const [selectedFile, setSelectedFile] = useState("");
  const [importPw, setImportPw] = useState("");
  const [msg, setMsg] = useState("");
  const [importing, setImporting] = useState(false);

  async function handleSelectFile() {
    try {
      const file = await open({
        title: "Select Vault Backup",
        multiple: false,
        filters: [{ name: "Vault Backup", extensions: ["vault-backup"] }],
      });
      if (file) { setSelectedFile(file as string); }
    } catch (err) { setMsg(`Failed to select file`); }
  }

  async function handleImport(e: React.FormEvent) {
    e.preventDefault();
    setMsg("");
    if (!selectedFile) { setMsg("Select a backup file first"); return; }
    if (!importPw) { setMsg("Password required"); return; }
    setImporting(true);
    try {
      const user = await api.importVault(selectedFile, importPw);
      setMsg(`Imported "${user.display_name}"`);
      setSelectedFile(""); setImportPw("");
      setTimeout(() => { setShowImport(false); setMsg(""); }, 2000);
    } catch (err) { setMsg(String(err)); }
    setImporting(false);
  }

  if (!showImport) {
    return (
      <motion.button
        whileHover={{ scale: 1.02 }}
        whileTap={{ scale: 0.98 }}
        onClick={() => setShowImport(true)}
        className="flex flex-col items-center gap-2 p-4 rounded-xl bg-white/[0.02] border border-white/[0.06] hover:border-purple-500/20 hover:bg-purple-500/5 transition-all"
      >
        <div className="w-10 h-10 rounded-lg bg-purple-500/10 flex items-center justify-center">
          <Upload size={18} className="text-purple-400" />
        </div>
        <span className="text-[12px] font-medium text-white">Import Vault</span>
      </motion.button>
    );
  }

  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.95 }}
      animate={{ opacity: 1, scale: 1 }}
      className="col-span-2 rounded-xl bg-white/[0.02] border border-purple-500/20 p-4"
    >
      <form onSubmit={handleImport} className="space-y-3">
        <div className="flex items-center justify-between">
          <p className="text-[13px] font-medium text-white">Import Vault Backup</p>
          <button type="button" onClick={() => setShowImport(false)} className="text-zinc-500 hover:text-white text-[11px]">Cancel</button>
        </div>

        {msg && <p className={`text-[11px] ${msg.includes("Imported") ? "text-green-400" : "text-red-400"}`}>{msg}</p>}

        <button
          type="button"
          onClick={handleSelectFile}
          className="w-full p-3 rounded-lg border border-dashed border-white/[0.1] hover:border-purple-500/30 text-center transition-all"
        >
          {selectedFile ? (
            <span className="text-[12px] text-purple-400 truncate block">{selectedFile.split("/").pop()}</span>
          ) : (
            <span className="text-[12px] text-zinc-500">Click to select .vault-backup file</span>
          )}
        </button>

        <input type="password" className="premium-input" placeholder="Backup's master password" value={importPw} onChange={e => setImportPw(e.target.value)} />

        <motion.button whileHover={{ scale: 1.01 }} whileTap={{ scale: 0.99 }} type="submit" disabled={importing || !selectedFile} className="btn-accent w-full !py-2.5 text-[12px]">
          {importing ? "Importing..." : "Import & Restore"}
        </motion.button>
      </form>
    </motion.div>
  );
}
