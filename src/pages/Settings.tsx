import { useState } from "react";
import { Shield, Info, Lock, Key, Download, Upload } from "lucide-react";
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
      setShowPasswordChange(false);
    } catch (err) { setPwError(String(err)); }
    setChanging(false);
  }

  return (
    <div className="p-6 space-y-6">
      <div>
        <h2 className="text-2xl font-bold text-white">Settings</h2>
        <p className="text-sm text-gray-400">Profile & Security</p>
      </div>

      {/* Current User */}
      <div className="card">
        <h3 className="text-sm font-semibold text-gray-300 mb-4 flex items-center gap-2">
          <Shield size={16} /> Your Profile
        </h3>
        <div className="space-y-3">
          <div className="flex items-center justify-between p-3 bg-gray-700/50 rounded-lg">
            <div>
              <p className="text-sm text-white">{currentUser?.display_name}</p>
              <p className="text-xs text-gray-400">@{currentUser?.username}</p>
            </div>
            <span className="badge bg-green-500/20 text-green-400">Active</span>
          </div>
          <div className="flex items-center justify-between p-3 bg-gray-700/50 rounded-lg">
            <div>
              <p className="text-sm text-white">Vault Encryption</p>
              <p className="text-xs text-gray-400">AES-256-GCM + Argon2id key derivation</p>
            </div>
            <span className="badge bg-green-500/20 text-green-400">Encrypted</span>
          </div>
          <div className="flex items-center justify-between p-3 bg-gray-700/50 rounded-lg">
            <div>
              <p className="text-sm text-white">User Isolation</p>
              <p className="text-xs text-gray-400">Each user has a separate encrypted vault</p>
            </div>
            <span className="badge bg-green-500/20 text-green-400">Isolated</span>
          </div>
        </div>
      </div>

      {/* Security Actions */}
      <div className="card">
        <h3 className="text-sm font-semibold text-gray-300 mb-4 flex items-center gap-2">
          <Key size={16} /> Security
        </h3>
        <div className="space-y-3">
          <button onClick={() => setShowPasswordChange(!showPasswordChange)} className="w-full flex items-center justify-between p-3 bg-gray-700/50 rounded-lg hover:bg-gray-700 transition-colors">
            <div className="text-left">
              <p className="text-sm text-white">Change Master Password</p>
              <p className="text-xs text-gray-400">Re-encrypts your vault with a new password</p>
            </div>
            <Key size={16} className="text-gray-400" />
          </button>

          {showPasswordChange && (
            <form onSubmit={handleChangePassword} className="p-4 bg-gray-700/30 rounded-lg space-y-3">
              {pwError && <p className="text-xs text-red-400">{pwError}</p>}
              {pwSuccess && <p className="text-xs text-green-400">{pwSuccess}</p>}
              <input type="password" className="input" placeholder="Current password" value={currentPw} onChange={e => setCurrentPw(e.target.value)} />
              <input type="password" className="input" placeholder="New password (min 6)" value={newPw} onChange={e => setNewPw(e.target.value)} />
              <input type="password" className="input" placeholder="Confirm new password" value={confirmPw} onChange={e => setConfirmPw(e.target.value)} />
              <button type="submit" disabled={changing} className="btn-primary w-full">{changing ? "Changing..." : "Change Password"}</button>
            </form>
          )}

          <ExportSection />
          <ImportSection />

          <button onClick={onLock} className="w-full flex items-center justify-between p-3 bg-gray-700/50 rounded-lg hover:bg-red-900/30 transition-colors">
            <div className="text-left">
              <p className="text-sm text-red-400">Lock Vault</p>
              <p className="text-xs text-gray-400">Encrypts data and requires password to re-enter</p>
            </div>
            <Lock size={16} className="text-red-400" />
          </button>
        </div>
      </div>

      {/* About */}
      <div className="card">
        <h3 className="text-sm font-semibold text-gray-300 mb-4 flex items-center gap-2">
          <Info size={16} /> About
        </h3>
        <div className="space-y-2 text-sm text-gray-400">
          <p><span className="text-gray-300">Version:</span> 1.7.1</p>
          <p><span className="text-gray-300">Security:</span> Argon2id + AES-256-GCM + Zeroize</p>
          <p><span className="text-gray-300">Storage:</span> ~/.aws-login-hub/ (local encrypted vaults)</p>
          <p className="text-xs text-gray-500 mt-4 pt-3 border-t border-gray-700">
            Each user profile has its own encrypted vault. User A cannot read User B's credentials.
          </p>
        </div>
      </div>
    </div>
  );
}

// ============================================================
// Export Section — uses native Save dialog
// ============================================================

function ExportSection() {
  const [msg, setMsg] = useState("");
  const [exporting, setExporting] = useState(false);

  async function handleExport() {
    setMsg("");
    setExporting(true);
    try {
      // Open native "Save As" dialog
      const filePath = await save({
        title: "Export Vault Backup",
        defaultPath: `vault-backup-${new Date().toISOString().slice(0, 10)}.vault-backup`,
        filters: [{ name: "Vault Backup", extensions: ["vault-backup"] }],
      });

      if (!filePath) {
        setExporting(false);
        return; // User cancelled
      }

      const result = await api.exportVault(filePath);
      setMsg(`✅ Exported successfully (${(result.size / 1024).toFixed(1)} KB)`);
    } catch (err) {
      setMsg(`❌ ${String(err)}`);
    }
    setExporting(false);
  }

  return (
    <>
      <button onClick={handleExport} disabled={exporting} className="w-full flex items-center justify-between p-3 bg-gray-700/50 rounded-lg hover:bg-gray-700 transition-colors">
        <div className="text-left">
          <p className="text-sm text-white">{exporting ? "Exporting..." : "Export Vault"}</p>
          <p className="text-xs text-gray-400">Save encrypted backup to transfer to another machine</p>
        </div>
        <Download size={16} className="text-blue-400" />
      </button>
      {msg && <p className={`text-xs px-3 ${msg.includes("✅") ? "text-green-400" : "text-red-400"}`}>{msg}</p>}
    </>
  );
}

// ============================================================
// Import Section — uses native Open dialog (file picker)
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
      if (file) {
        setSelectedFile(file as string);
      }
    } catch (err) {
      setMsg(`❌ ${String(err)}`);
    }
  }

  async function handleImport(e: React.FormEvent) {
    e.preventDefault();
    setMsg("");
    if (!selectedFile) { setMsg("Please select a backup file"); return; }
    if (!importPw) { setMsg("Master password is required"); return; }
    setImporting(true);
    try {
      const user = await api.importVault(selectedFile, importPw);
      setMsg(`✅ Imported "${user.display_name}" (@${user.username}). Restart app to switch profiles.`);
      setSelectedFile(""); setImportPw("");
    } catch (err) {
      setMsg(`❌ ${String(err)}`);
    }
    setImporting(false);
  }

  return (
    <>
      <button onClick={() => setShowImport(!showImport)} className="w-full flex items-center justify-between p-3 bg-gray-700/50 rounded-lg hover:bg-gray-700 transition-colors">
        <div className="text-left">
          <p className="text-sm text-white">Import Vault</p>
          <p className="text-xs text-gray-400">Restore a vault backup from another machine</p>
        </div>
        <Upload size={16} className="text-purple-400" />
      </button>

      {showImport && (
        <form onSubmit={handleImport} className="p-4 bg-gray-700/30 rounded-lg space-y-3">
          {msg && <p className={`text-xs ${msg.includes("✅") ? "text-green-400" : "text-red-400"}`}>{msg}</p>}

          {/* File picker area */}
          <div
            onClick={handleSelectFile}
            className="border-2 border-dashed border-gray-600 rounded-lg p-6 text-center cursor-pointer hover:border-blue-500 hover:bg-blue-500/5 transition-colors"
          >
            {selectedFile ? (
              <div>
                <Upload size={24} className="mx-auto text-blue-400 mb-2" />
                <p className="text-sm text-white truncate">{selectedFile.split("/").pop()}</p>
                <p className="text-xs text-gray-400 mt-1">Click to change file</p>
              </div>
            ) : (
              <div>
                <Upload size={24} className="mx-auto text-gray-500 mb-2" />
                <p className="text-sm text-gray-300">Click to select .vault-backup file</p>
              </div>
            )}
          </div>

          <div>
            <label className="text-xs text-gray-400 mb-1 block">Master Password for this backup</label>
            <input type="password" className="input" placeholder="Enter the vault's master password" value={importPw} onChange={e => setImportPw(e.target.value)} />
          </div>

          <button type="submit" disabled={importing || !selectedFile} className="btn-primary w-full">
            {importing ? "Importing..." : "Import & Restore"}
          </button>
        </form>
      )}
    </>
  );
}
