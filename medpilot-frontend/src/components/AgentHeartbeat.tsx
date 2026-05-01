import { motion } from 'framer-motion'
import { cn } from '@/lib/utils'
import { AGENT_META } from '@/data/mockData'
import { AGENT_NAMES, useMedPilotStore, type AgentName } from '@/store/medpilotStore'

const POD_ORDER = ['Pod A', 'Pod B', 'Pod C', 'Pod D']

const STATUS_STYLES = {
  idle:    'bg-slate-700/60 border-slate-600/40 text-slate-500',
  active:  'bg-accent/20 border-accent/50 text-accent shadow-glow',
  warning: 'bg-warning/20 border-warning/50 text-warning',
  error:   'bg-critical/20 border-critical/50 text-critical shadow-glow-red',
}

export default function AgentHeartbeat() {
  const { agentStatuses, setAgentStatus, addLog } = useMedPilotStore()

  async function triggerAgent(name: AgentName) {
    if (agentStatuses[name] === 'active') return
    
    // Optimistic UI updates
    setAgentStatus(name, 'active')
    addLog({
      id: Date.now().toString(),
      timestamp: new Date(),
      agent_name: name.replace('_', ' ').replace(/\b\w/g, l => l.toUpperCase()),
      action: `Manual override triggered via Network Dashboard`,
      status: 'Warning'
    })

    try {
      const res = await fetch(`${import.meta.env.VITE_BACKEND_URL || ''}/api/agents/trigger/${name}`, { method: 'POST' })
      if (res.ok) {
        // Simulate processing time for demo
        setTimeout(() => {
          setAgentStatus(name, 'idle')
        }, 3000)
      } else {
        setAgentStatus(name, 'error')
        setTimeout(() => setAgentStatus(name, 'idle'), 3000)
      }
    } catch (e) {
      setAgentStatus(name, 'error')
      setTimeout(() => setAgentStatus(name, 'idle'), 3000)
    }
  }

  const pods = POD_ORDER.map((pod) => ({
    pod,
    agents: AGENT_NAMES.filter((n) => AGENT_META[n].pod === pod),
  }))

  return (
    <div className="glass-card p-4 space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="text-xs font-semibold text-slate-400 uppercase tracking-wider">Agent Heartbeat</h3>
        <span className="text-[10px] text-accent font-mono">12 AGENTS ONLINE</span>
      </div>

      <div className="space-y-3">
        {pods.map(({ pod, agents }) => (
          <div key={pod}>
            <p className="text-[10px] text-slate-600 uppercase tracking-widest mb-1.5 pl-0.5">{pod}</p>
            <div className="grid grid-cols-3 gap-1.5">
              {agents.map((name) => {
                const meta   = AGENT_META[name]
                const status = agentStatuses[name]
                const Icon = meta.icon
                return (
                  <motion.button
                    key={name}
                    onClick={() => triggerAgent(name)}
                    disabled={status === 'active'}
                    whileHover={{ scale: status !== 'active' ? 1.05 : 1 }}
                    whileTap={{ scale: status !== 'active' ? 0.95 : 1 }}
                    animate={status === 'active'
                      ? { scale: [1, 1.03, 1], transition: { duration: 0.6, repeat: Infinity } }
                      : { scale: 1 }
                    }
                    className={cn(
                      'relative flex flex-col items-center justify-center gap-1 p-2 py-3 rounded-xl border text-center transition-all duration-300 w-full',
                      STATUS_STYLES[status],
                      status !== 'active' && 'hover:bg-white/5 hover:border-white/20 cursor-pointer'
                    )}
                  >
                    {/* Active pulse ring */}
                    {status === 'active' && (
                      <span className="absolute inset-0 rounded-xl border border-accent/50 animate-ping opacity-40" />
                    )}
                    {status === 'error' && (
                      <span className="absolute inset-0 rounded-xl border border-critical/50 animate-ping opacity-40" />
                    )}
                    <span className="text-base leading-none mb-1">
                      <Icon className="w-5 h-5" />
                    </span>
                    <span className="text-[10px] font-semibold leading-tight">{meta.label}</span>
                    <span className={cn(
                      'text-[9px] font-mono px-1.5 py-0.5 rounded mt-1',
                      status === 'idle'    ? 'bg-slate-800 text-slate-400' :
                      status === 'active'  ? 'bg-accent/20 text-accent font-bold' :
                      status === 'warning' ? 'bg-warning/20 text-warning font-bold' : 'bg-critical/20 text-critical font-bold'
                    )}>
                      {status.toUpperCase()}
                    </span>
                  </motion.button>
                )
              })}
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
