import { useEffect, useState } from "react";
import { motion } from "framer-motion";
import { Star, Play, Loader2 } from "lucide-react";
import { api } from "../services/api";
import { performLogin, type LoginProgress } from "../services/login";
import type { Client } from "../types";

export default function Favorites() {
  const [clients, setClients] = useState<Client[]>([]);
  const [loginProgress, setLoginProgress] = useState<{ id: string; progress: LoginProgress } | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => { loadFavorites(); }, []);
  async function loadFavorites() {
    try { const all = await api.getClients(); setClients(all.filter(c => c.favorite)); }
    catch (e) { console.error(e); } finally { setLoading(false); }
  }

  async function handleLogin(client: Client) {
    setLoginProgress({ id: client.id, progress: { step: "launching", message: "Starting..." } });
    await performLogin(client, (p) => {
      setLoginProgress({ id: client.id, progress: p });
      if (p.step === "completed" || p.step === "failed") setTimeout(() => setLoginProgress(null), 4000);
    });
  }

  if (loading) return <div className="flex items-center justify-center h-full text-zinc-500">Loading...</div>;

  return (
    <div className="p-8 h-full overflow-auto">
      <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }}>
        <h1 className="text-3xl font-bold text-white tracking-tight">Favorites</h1>
        <p className="text-zinc-500 text-sm mt-1">{clients.length} pinned client{clients.length !== 1 ? "s" : ""}</p>
      </motion.div>

      {clients.length === 0 ? (
        <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.2 }} className="glass-card text-center py-16 mt-8">
          <Star className="mx-auto text-zinc-700 mb-4" size={44} />
          <p className="text-zinc-400 text-lg font-medium">No favorites yet</p>
          <p className="text-zinc-600 text-sm mt-1">Star a client for quick access</p>
        </motion.div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5 mt-8">
          {clients.map((client, i) => (
            <motion.div key={client.id} initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.05 }}
              className="solid-card group hover:border-amber-500/20 hover:shadow-lg hover:shadow-amber-500/5">
              <div className="flex items-start justify-between mb-4">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-amber-500/15 to-orange-500/5 border border-amber-500/20 flex items-center justify-center text-sm font-bold text-amber-400">
                    {client.name.charAt(0)}
                  </div>
                  <div>
                    <h3 className="font-semibold text-white">{client.name}</h3>
                    <p className="text-[12px] text-zinc-500">{client.email}</p>
                  </div>
                </div>
                <Star size={16} className="text-amber-400" fill="currentColor" />
              </div>
              {client.environment && <span className="premium-badge bg-purple-500/10 text-purple-400 border border-purple-500/20">{client.environment}</span>}
              <div className="flex items-center justify-between mt-5 pt-4 border-t border-white/[0.04]">
                <p className="text-[11px] text-zinc-600">{client.last_login ? `Last: ${new Date(client.last_login).toLocaleDateString()}` : "Never"}</p>
                <motion.button whileHover={{ scale: 1.05 }} whileTap={{ scale: 0.95 }} onClick={() => handleLogin(client)} disabled={!!loginProgress}
                  className="btn-accent !py-2 !px-4 text-[12px] flex items-center gap-2">
                  {loginProgress?.id === client.id ? <><Loader2 size={13} className="animate-spin" /> Connecting...</> : <><Play size={13} /> Login</>}
                </motion.button>
              </div>
            </motion.div>
          ))}
        </div>
      )}
    </div>
  );
}
