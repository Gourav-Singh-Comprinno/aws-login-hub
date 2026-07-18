import { useEffect, useState } from "react";
import { motion } from "framer-motion";
import { Clock, Play, Loader2 } from "lucide-react";
import { api } from "../services/api";
import { performLogin, type LoginProgress } from "../services/login";
import type { Client } from "../types";

export default function Recent() {
  const [clients, setClients] = useState<Client[]>([]);
  const [loginProgress, setLoginProgress] = useState<{ id: string; progress: LoginProgress } | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => { loadRecent(); }, []);
  async function loadRecent() {
    try { const s = await api.getDashboardStats(); setClients(s.recent_clients); }
    catch (e) { console.error(e); } finally { setLoading(false); }
  }

  async function handleLogin(client: Client) {
    setLoginProgress({ id: client.id, progress: { step: "launching", message: "Starting..." } });
    await performLogin(client, (p) => {
      setLoginProgress({ id: client.id, progress: p });
      if (p.step === "completed" || p.step === "failed") { setTimeout(() => setLoginProgress(null), 4000); loadRecent(); }
    });
  }

  if (loading) return <div className="flex items-center justify-center h-full text-zinc-500">Loading...</div>;

  return (
    <div className="p-8 h-full overflow-auto">
      <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }}>
        <h1 className="text-3xl font-bold text-white tracking-tight">Recent Logins</h1>
        <p className="text-zinc-500 text-sm mt-1">Last 10 sessions</p>
      </motion.div>

      {clients.length === 0 ? (
        <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="glass-card text-center py-16 mt-8">
          <Clock className="mx-auto text-zinc-700 mb-4" size={44} />
          <p className="text-zinc-400 text-lg font-medium">No recent logins</p>
          <p className="text-zinc-600 text-sm mt-1">Your login history will appear here</p>
        </motion.div>
      ) : (
        <div className="space-y-3 mt-8">
          {clients.map((client, i) => (
            <motion.div key={client.id} initial={{ opacity: 0, x: -10 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: i * 0.04 }}
              className="solid-card flex items-center gap-5 !p-5 group hover:border-white/[0.1]">
              <div className="w-9 h-9 rounded-full bg-gradient-to-br from-zinc-800 to-zinc-900 border border-white/[0.06] flex items-center justify-center text-[12px] font-bold text-zinc-400">
                {i + 1}
              </div>
              <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-[#FF9900]/10 to-[#FF6B4A]/5 border border-[#FF9900]/15 flex items-center justify-center text-sm font-bold text-[#FF9900]">
                {client.name.charAt(0)}
              </div>
              <div className="flex-1 min-w-0">
                <h3 className="font-medium text-white truncate">{client.name}</h3>
                <p className="text-[12px] text-zinc-500">{client.email}</p>
              </div>
              <div className="text-right mr-3">
                <p className="text-[12px] text-zinc-500">{client.last_login ? new Date(client.last_login).toLocaleString() : ""}</p>
                {client.environment && <span className="premium-badge bg-purple-500/10 text-purple-400 border border-purple-500/20 mt-1 inline-block">{client.environment}</span>}
              </div>
              <motion.button whileHover={{ scale: 1.1 }} whileTap={{ scale: 0.9 }} onClick={() => handleLogin(client)} disabled={!!loginProgress}
                className="p-3 text-green-400 hover:bg-green-400/10 rounded-xl transition-all opacity-0 group-hover:opacity-100">
                {loginProgress?.id === client.id ? <Loader2 size={16} className="animate-spin" /> : <Play size={16} />}
              </motion.button>
            </motion.div>
          ))}
        </div>
      )}
    </div>
  );
}
