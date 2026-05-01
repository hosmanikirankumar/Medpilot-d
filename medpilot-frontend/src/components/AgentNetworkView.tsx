import { useState, useEffect } from 'react'
import { motion } from 'framer-motion'
import { Activity, RefreshCw, Loader2, Cpu, CheckCircle2, AlertCircle, Server } from 'lucide-react'
import { useMedPilotStore } from '@/store/medpilotStore'
import { AGENT_META } from '@/data/mockData'
import { AGENT_NAMES, type AgentName } from '@/store/medpilotStore'
import { cn } from '@/lib/utils'

const STATUS_STYLES = {
  idle:    'bg-slate-700/60 border-slate-600/40 text-slate-400',
  active:  'bg-accent/20 border-accent/50 text-accent shadow-glow',
  warning: 'bg-warning/20 border-warning/50 text-warning',
  error:   'bg-critical/20 border-critical/50 text-critical shadow-glow-red',
}

const POD_ORDER = ['Pod A', 'Pod B', 'Pod C', 'Pod D']
const POD_COLORS: Record<string, string> = {
  'Pod A': 'border-accent/20 bg-accent/5',
  'Pod B': 'border-info/20 bg-info/5',
  'Pod C': 'border-critical/20 bg-critical/5',
  'Pod D': 'border-warning/20 bg-warning/5',
}
const POD_LABELS: Record<string, string> = {
  'Pod A': 'Core Management & Extraction',
  'Pod B': 'Clinical Analysis & Safety',
  'Pod C': 'Emergency & Integrations',
  'Pod D': 'Deep Reasoning & Engagement',
}

interface BackendAgent {
  id: string
  label: string
  pod: string
  status: string
  model: string
  description: string
}

export default function AgentNetworkView() {
  const { agentStatuses, setAgentStatus, addLog } = useMedPilotStore()
  const [backendAgents, setBackendAgents] = useState<BackendAgent[]>([])
  const [loading, setLoading] = useState(false)
  const [lastFetched, setLastFetched] = useState<Date | null>(null)
  const [backendOnline, setBackendOnline] = useState<boolean | null>(null)

  async function fetchAgentStatus() {
    setLoading(true)
    try {
      const res = await fetch('/api/agents/status')
      if (res.ok) {
        const data = await res.json()
        setBackendAgents(data.agents || [])
        setBackendOnline(true)
        setLastFetched(new Date())
      } else {
        setBackendOnline(false)
      }
    } catch {
      setBackendOnline(false)
    }
    setLoading(false)
  }

  useEffect(() => {
    fetchAgentStatus()
    const interval = setInterval(fetchAgentStatus, 15000)
    return () => clearInterval(interval)
  }, [])

  async function triggerAgent(name: AgentName) {
    if (agentStatuses[name] === 'active') return
    setAgentStatus(name, 'active')
    addLog({
      id: Date.now().toString(),
      timestamp: new Date(),
      agent_name: name.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase()),
      action: 'Manual override triggered via Network Dashboard',
      status: 'Warning',
    })
    try {
      const res = await fetch(`/api/agents/trigger/${name}`, { method: 'POST' })
      if (res.ok) {
        setTimeout(() => setAgentStatus(name, 'idle'), 3000)
      } else {
        setAgentStatus(name, 'error')
        setTimeout(() => setAgentStatus(name, 'idle'), 3000)
      }
    } catch {
      setAgentStatus(name, 'error')
      setTimeout(() => setAgentStatus(name, 'idle'), 3000)
    }
  }

  const pods = POD_ORDER.map(pod => ({
    pod,
    agents: AGENT_NAMES.filter(n => AGENT_META[n].pod === pod),
  }))

  const activeCount = Object.values(agentStatuses).filter(s => s === 'active').length
  const errorCount = Object.values(agentStatuses).filter(s => s === 'error').length

  return (
    <div className="max-w-5xl mx-auto space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-medium text-white flex items-center gap-2">
            <Activity className="w-6 h-6 text-accent" />
            Agent Network Status
          </h2>
          <p className="text-sm text-slate-400 mt-1">
            Real-time visibility into all 12 MedPilot AI agents
          </p>
        </div>
        <div className="flex items-center gap-3">
          {/* Backend status indicator */}
          <div className={cn(
            'flex items-center gap-2 px-3 py-1.5 rounded-xl border text-xs font-medium',
            backendOnline === true
              ? 'bg-accent/10 border-accent/30 text-accent'
              : backendOnline === false
              ? 'bg-critical/10 border-critical/30 text-critical'
              : 'bg-surface-200 border-white/10 text-slate-400'
          )}>
            {backendOnline === true
              ? <CheckCircle2 className="w-3.5 h-3.5" />
              : backendOnline === false
              ? <AlertCircle className="w-3.5 h-3.5" />
              : <Loader2 className="w-3.5 h-3.5 animate-spin" />
            }
            {backendOnline === true ? 'Backend Online' : backendOnline === false ? 'Backend Offline' : 'Checking...'}
          </div>
          <button
            onClick={fetchAgentStatus}
            disabled={loading}
            className="flex items-center gap-2 px-3 py-1.5 rounded-xl bg-surface-200 border border-white/10 text-slate-400 hover:text-white text-xs transition-colors"
          >
            <RefreshCw className={cn('w-3.5 h-3.5', loading && 'animate-spin')} />
            Refresh
          </button>
        </div>
      </div>

      {/* Stats bar */}
      <div className="grid grid-cols-3 gap-4">
        {[
          { label: 'Total Agents', value: 12, color: 'text-slate-300', bg: 'bg-surface-100 border-white/5' },
          { label: 'Active', value: activeCount, color: 'text-accent', bg: 'bg-accent/5 border-accent/20' },
          { label: 'Errors', value: errorCount, color: 'text-critical', bg: 'bg-critical/5 border-critical/20' },
        ].map(({ label, value, color, bg }) => (
          <div key={label} className={cn('rounded-2xl border p-4 flex items-center justify-between shadow-glass', bg)}>
            <div>
              <p className="text-xs text-slate-500 uppercase tracking-wider">{label}</p>
              <p className={cn('text-2xl font-bold mt-1', color)}>{value}</p>
            </div>
            <Cpu className={cn('w-6 h-6 opacity-40', color)} />
          </div>
        ))}
      </div>

      {/* Agent Pods */}
      <div className="space-y-5">
        {pods.map(({ pod, agents }) => (
          <div key={pod} className={cn('rounded-3xl border p-5 shadow-glass', POD_COLORS[pod])}>
            <div className="flex items-center justify-between mb-4">
              <div>
                <h3 className="text-sm font-bold text-white">{pod}</h3>
                <p className="text-xs text-slate-500">{POD_LABELS[pod]}</p>
              </div>
              <Server className="w-4 h-4 text-slate-600" />
            </div>
            <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3">
              {agents.map(name => {
                const meta = AGENT_META[name]
                const status = agentStatuses[name]
                const Icon = meta.icon
                // Find matching backend agent for live model info
                const backendAgent = backendAgents.find(a => a.id === name)
                return (
                  <motion.button
                    key={name}
                    onClick={() => triggerAgent(name)}
                    disabled={status === 'active'}
                    whileHover={{ scale: status !== 'active' ? 1.03 : 1 }}
                    whileTap={{ scale: status !== 'active' ? 0.97 : 1 }}
                    animate={status === 'active'
                      ? { scale: [1, 1.02, 1], transition: { duration: 0.7, repeat: Infinity } }
                      : { scale: 1 }
                    }
                    className={cn(
                      'relative flex flex-col items-start gap-2 p-3 rounded-2xl border text-left transition-all duration-200',
                      STATUS_STYLES[status],
                      status !== 'active' && 'hover:bg-white/5 hover:border-white/20 cursor-pointer'
                    )}
                    title={backendAgent?.description || meta.label}
                  >
                    {/* Pulse ring for active */}
                    {status === 'active' && (
                      <span className="absolute inset-0 rounded-2xl border border-accent/50 animate-ping opacity-30 pointer-events-none" />
                    )}
                    {status === 'error' && (
                      <span className="absolute inset-0 rounded-2xl border border-critical/50 animate-ping opacity-30 pointer-events-none" />
                    )}

                    {/* Icon + Status dot */}
                    <div className="flex items-center justify-between w-full">
                      <Icon className="w-5 h-5" />
                      <span className={cn(
                        'w-2 h-2 rounded-full flex-shrink-0',
                        status === 'active' ? 'bg-accent animate-pulse' :
                        status === 'error' ? 'bg-critical animate-pulse' :
                        status === 'warning' ? 'bg-warning animate-pulse' :
                        'bg-slate-600'
                      )} />
                    </div>

                    {/* Label */}
                    <div>
                      <p className="text-[11px] font-bold leading-tight">{meta.label}</p>
                      <p className="text-[9px] opacity-60 mt-0.5 font-mono leading-tight">
                        {backendAgent?.model || meta.model}
                      </p>
                    </div>

                    {/* Status badge */}
                    <span className={cn(
                      'text-[9px] font-mono font-bold px-1.5 py-0.5 rounded-md uppercase',
                      status === 'idle' ? 'bg-slate-800 text-slate-500' :
                      status === 'active' ? 'bg-accent/25 text-accent' :
                      status === 'warning' ? 'bg-warning/25 text-warning' :
                      'bg-critical/25 text-critical'
                    )}>
                      {status}
                    </span>
                  </motion.button>
                )
              })}
            </div>
          </div>
        ))}
      </div>

      {/* Backend agent descriptions (if online) */}
      {backendOnline && backendAgents.length > 0 && (
        <div className="bg-surface-100 rounded-3xl border border-white/5 p-5 shadow-glass">
          <h3 className="text-sm font-bold text-white mb-4 flex items-center gap-2">
            <Server className="w-4 h-4 text-accent" />
            Live Agent Manifest
            {lastFetched && (
              <span className="ml-auto text-[10px] text-slate-500 font-normal font-mono">
                Fetched {lastFetched.toLocaleTimeString()}
              </span>
            )}
          </h3>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
            {backendAgents.map(agent => (
              <div key={agent.id} className="flex items-start gap-3 p-3 rounded-xl bg-surface-200 border border-white/5">
                <div className={cn(
                  'flex-shrink-0 w-2 h-2 rounded-full mt-1.5',
                  agent.status === 'idle' ? 'bg-slate-600' : 'bg-accent'
                )} />
                <div className="min-w-0">
                  <p className="text-xs font-semibold text-white">{agent.label}</p>
                  <p className="text-[10px] text-slate-500 font-mono">{agent.model}</p>
                  <p className="text-[10px] text-slate-400 mt-1 leading-relaxed">{agent.description}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
