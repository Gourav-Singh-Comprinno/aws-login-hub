import { useState, useEffect, useRef } from "react";
import { motion } from "framer-motion";
import { Play, Trash2 } from "lucide-react";
import { api } from "../services/api";

interface TerminalLine {
  type: "input" | "output" | "error";
  text: string;
}

export default function Terminal() {
  const [profiles, setProfiles] = useState<string[]>([]);
  const [selectedProfile, setSelectedProfile] = useState("");
  const [command, setCommand] = useState("");
  const [history, setHistory] = useState<TerminalLine[]>([]);
  const [running, setRunning] = useState(false);
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    api.getAwsProfiles().then(setProfiles).catch(() => {});
  }, []);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [history]);

  async function handleRun(e: React.FormEvent) {
    e.preventDefault();
    if (!command.trim() || running) return;

    const cmd = command.trim();
    setHistory(h => [...h, { type: "input", text: `${selectedProfile ? `[${selectedProfile}]` : ""} $ ${cmd}` }]);
    setCommand("");
    setRunning(true);

    try {
      const output = await api.runTerminalCommand(cmd, selectedProfile);
      setHistory(h => [...h, { type: "output", text: output }]);
    } catch (err) {
      setHistory(h => [...h, { type: "error", text: String(err) }]);
    }
    setRunning(false);
  }

  function handleClear() {
    setHistory([]);
  }

  async function handleGenerateProfiles() {
    try {
      const result = await api.generateAwsConfig();
      setHistory(h => [...h, { type: "output", text: result }]);
      const p = await api.getAwsProfiles();
      setProfiles(p);
    } catch (err) {
      setHistory(h => [...h, { type: "error", text: String(err) }]);
    }
  }

  async function handleRefreshToken() {
    if (!selectedProfile) return;
    setRunning(true);
    setHistory(h => [...h, { type: "input", text: `$ aws sso login --profile ${selectedProfile}` }]);
    try {
      const result = await api.refreshSsoToken(selectedProfile);
      setHistory(h => [...h, {
        type: result.success ? "output" : "error",
        text: result.message
      }]);
    } catch (err) {
      setHistory(h => [...h, { type: "error", text: String(err) }]);
    }
    setRunning(false);
  }

  async function handleExportCreds() {
    if (!selectedProfile) return;
    setRunning(true);
    setHistory(h => [...h, { type: "input", text: `$ aws configure export-credentials --profile ${selectedProfile} --format env` }]);
    try {
      const creds = await api.exportCredentialsEnv(selectedProfile);
      setHistory(h => [...h, {
        type: "output",
        text: `Temporary credentials for '${selectedProfile}':\n\n${creds}\nPaste these in any terminal to use this profile's credentials.`
      }]);
    } catch (err) {
      setHistory(h => [...h, { type: "error", text: String(err) }]);
    }
    setRunning(false);
  }

  return (
    <div className="p-8 h-full overflow-auto flex flex-col">
      <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="mb-5">
        <h1 className="text-3xl font-bold text-white tracking-tight">Terminal</h1>
        <p className="text-zinc-500 text-sm mt-1">Run AWS CLI commands with auto-configured profiles</p>
      </motion.div>

      {/* Profile selector + actions */}
      <div className="flex items-center gap-3 mb-4">
        <div className="flex-1">
          <select
            className="premium-input"
            value={selectedProfile}
            onChange={e => setSelectedProfile(e.target.value)}
          >
            <option value="">No profile (default credentials)</option>
            {profiles.map(p => <option key={p} value={p}>{p}</option>)}
          </select>
        </div>
        <button onClick={handleGenerateProfiles} className="btn-glass text-[12px] whitespace-nowrap">
          Sync Profiles
        </button>
        <button onClick={handleRefreshToken} disabled={!selectedProfile || running} className="btn-glass text-[12px] whitespace-nowrap">
          Refresh Token
        </button>
        <button onClick={handleExportCreds} disabled={!selectedProfile || running} className="btn-glass text-[12px] whitespace-nowrap">
          Get Credentials
        </button>
        <button onClick={handleClear} className="btn-glass text-[12px]" title="Clear">
          <Trash2 size={14} />
        </button>
      </div>

      {/* Terminal output */}
      <div className="flex-1 solid-card !p-0 overflow-hidden flex flex-col min-h-[300px]">
        <div className="flex items-center gap-2 px-4 py-2.5 border-b border-white/[0.06]">
          <div className="w-3 h-3 rounded-full bg-red-500/80" />
          <div className="w-3 h-3 rounded-full bg-yellow-500/80" />
          <div className="w-3 h-3 rounded-full bg-green-500/80" />
          <span className="text-[11px] text-zinc-500 ml-3 font-mono">
            {selectedProfile ? `AWS_PROFILE=${selectedProfile}` : "bash"}
          </span>
        </div>

        <div className="flex-1 overflow-auto p-4 font-mono text-[13px] space-y-1">
          {history.length === 0 && (
            <div className="text-zinc-600 text-sm">
              <p>Ready. Type a command below.</p>
              <p className="mt-2">Quick commands:</p>
              <p className="text-zinc-500 mt-1">  aws sts get-caller-identity</p>
              <p className="text-zinc-500">  aws s3 ls</p>
              <p className="text-zinc-500">  aws ec2 describe-instances --query 'Reservations[].Instances[].InstanceId'</p>
            </div>
          )}
          {history.map((line, i) => (
            <div key={i} className={
              line.type === "input" ? "text-[#FF9900] font-semibold" :
              line.type === "error" ? "text-red-400" : "text-zinc-300"
            }>
              <pre className="whitespace-pre-wrap break-all">{line.text}</pre>
            </div>
          ))}
          {running && <div className="text-zinc-500 animate-pulse">Running...</div>}
          <div ref={bottomRef} />
        </div>

        {/* Input */}
        <form onSubmit={handleRun} className="flex items-center border-t border-white/[0.06]">
          <span className="pl-4 text-[#FF9900] font-mono text-sm font-semibold">$</span>
          <input
            type="text"
            className="flex-1 bg-transparent border-none outline-none px-3 py-3 text-white font-mono text-[13px] placeholder-zinc-600"
            placeholder={running ? "Running..." : "Type command..."}
            value={command}
            onChange={e => setCommand(e.target.value)}
            disabled={running}
            autoFocus
          />
          <button type="submit" disabled={running || !command.trim()} className="px-4 py-3 text-[#FF9900] hover:bg-white/[0.03] transition-colors disabled:opacity-30">
            <Play size={16} />
          </button>
        </form>
      </div>
    </div>
  );
}
