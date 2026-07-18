import { useEffect, useState } from "react";
import { motion } from "framer-motion";
import { Users, Star, Zap, Clock, ArrowRight, Shield } from "lucide-react";
import { api } from "../services/api";
import type { DashboardStats, Page } from "../types";

interface DashboardProps { onNavigate: (page: Page) => void; }

export default function Dashboard({ onNavigate }: DashboardProps) {
  const [stats, setStats] = useState<DashboardStats | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => { api.getDashboardStats().then(setStats).finally(() => setLoading(false)); }, []);

  if (loading) return <div className="flex items-center justify-center h-full"><motion.div animate={{ opacity: [0.3, 1, 0.3] }} transition={{ duration: 1.5, repeat: Infinity }} className="text-zinc-500">Loading...</motion.div></div>;

  const metrics = [
    { icon: <Users size={20} />, label: "Total Clients", value: stats?.total_clients ?? 0, color: "from-blue-500/20 to-blue-600/5", iconColor: "text-blue-400", borderColor: "border-blue-500/20", onClick: () => onNavigate("clients") },
    { icon: <Star size={20} />, label: "Favorites", value: stats?.favorites ?? 0, color: "from-amber-500/20 to-orange-500/5", iconColor: "text-amber-400", borderColor: "border-amber-500/20", onClick: () => onNavigate("favorites") },
    { icon: <Zap size={20} />, label: "Active Today", value: stats?.logged_in_today ?? 0, color: "from-green-500/20 to-emerald-500/5", iconColor: "text-green-400", borderColor: "border-green-500/20" },
    { icon: <Clock size={20} />, label: "Recent Logins", value: stats?.recent_clients.length ?? 0, color: "from-purple-500/20 to-violet-500/5", iconColor: "text-purple-400", borderColor: "border-purple-500/20", onClick: () => onNavigate("recent") },
  ];

  return (
    <div className="p-8 h-full overflow-auto">
      {/* Header */}
      <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="mb-8">
        <h1 className="text-3xl font-bold text-white tracking-tight">Dashboard</h1>
        <p className="text-zinc-500 text-sm mt-1">AWS Identity Center Login Manager</p>
      </motion.div>

      {/* Metrics Grid */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-5 mb-8">
        {metrics.map((m, i) => (
          <motion.div
            key={m.label}
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: i * 0.1 }}
            onClick={m.onClick}
            className={`metric-card cursor-pointer group border ${m.borderColor} hover:border-[#FF9900]/30 transition-all`}
          >
            <div className={`inline-flex p-2.5 rounded-xl bg-gradient-to-br ${m.color} mb-4`}>
              <span className={m.iconColor}>{m.icon}</span>
            </div>
            <AnimatedNumber value={m.value} />
            <p className="text-[12px] text-zinc-500 mt-1 font-medium">{m.label}</p>
            <ArrowRight size={14} className="absolute top-5 right-5 text-zinc-700 group-hover:text-[#FF9900] transition-colors" />
          </motion.div>
        ))}
      </div>

      {/* Recent Activity */}
      {stats && stats.recent_clients.length > 0 && (
        <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.4 }} className="solid-card">
          <div className="flex items-center justify-between mb-5">
            <h3 className="text-[13px] font-semibold text-zinc-300 uppercase tracking-wider">Recent Activity</h3>
            <button onClick={() => onNavigate("recent")} className="text-[12px] text-[#FF9900] hover:underline">View all →</button>
          </div>
          <div className="space-y-2">
            {stats.recent_clients.slice(0, 5).map((client, i) => (
              <motion.div key={client.id} initial={{ opacity: 0, x: -10 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: 0.5 + i * 0.05 }}
                className="flex items-center justify-between p-4 rounded-xl bg-white/[0.02] border border-white/[0.04] hover:border-white/[0.08] transition-all group">
                <div className="flex items-center gap-4">
                  <div className="w-9 h-9 rounded-lg bg-gradient-to-br from-[#FF9900]/10 to-[#FF6B4A]/5 flex items-center justify-center text-[11px] font-bold text-[#FF9900]">
                    {client.name.charAt(0)}
                  </div>
                  <div>
                    <p className="text-sm font-medium text-white">{client.name}</p>
                    <p className="text-[11px] text-zinc-500">{client.email}</p>
                  </div>
                </div>
                <div className="text-right">
                  <p className="text-[11px] text-zinc-500">{client.last_login ? new Date(client.last_login).toLocaleDateString() : ""}</p>
                  {client.environment && <span className="premium-badge bg-purple-500/10 text-purple-400 border border-purple-500/20">{client.environment}</span>}
                </div>
              </motion.div>
            ))}
          </div>
        </motion.div>
      )}

      {/* Empty State */}
      {stats && stats.total_clients === 0 && (
        <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.3 }} className="glass-card text-center py-16">
          <div className="inline-flex p-5 rounded-2xl bg-gradient-to-br from-[#FF9900]/10 to-transparent border border-[#FF9900]/20 mb-5">
            <Shield className="text-[#FF9900]" size={40} />
          </div>
          <h3 className="text-xl font-bold text-white">Welcome to AWS Login Hub</h3>
          <p className="text-zinc-500 text-sm mt-2 max-w-md mx-auto">Add your first AWS Identity Center client to start automating logins securely.</p>
          <motion.button whileHover={{ scale: 1.02 }} whileTap={{ scale: 0.98 }} onClick={() => onNavigate("clients")} className="btn-accent mt-6">
            + Add First Client
          </motion.button>
        </motion.div>
      )}
    </div>
  );
}

function AnimatedNumber({ value }: { value: number }) {
  const [display, setDisplay] = useState(0);
  useEffect(() => {
    const duration = 600;
    const start = Date.now();
    const timer = setInterval(() => {
      const progress = Math.min((Date.now() - start) / duration, 1);
      setDisplay(Math.round(progress * value));
      if (progress >= 1) clearInterval(timer);
    }, 16);
    return () => clearInterval(timer);
  }, [value]);
  return <p className="text-3xl font-bold text-white">{display}</p>;
}
